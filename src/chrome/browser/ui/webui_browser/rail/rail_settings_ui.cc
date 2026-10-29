#include "chrome/browser/ui/webui_browser/rail/rail_settings_ui.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/base64.h"
#include "base/functional/callback_helpers.h"
#include "base/notreached.h"
#include "base/strings/utf_string_conversions.h"
#include "base/version_info/version_info.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/favicon/favicon_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_attributes_entry.h"
#include "chrome/browser/profiles/profile_attributes_storage.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/common/pref_names.h"
#include "components/favicon/core/favicon_service.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_service.h"
#include "url/gurl.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_buildflags.h"
#include "chrome/browser/ui/webui_browser/rail/rail_mini_window_restore.h"
#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"
#include "chrome/browser/ui/webui_browser/rail/rail_site_routes.h"
#include "chrome/browser/ui/webui_browser/rail/rail_tab_organizer.h"
#include "chrome/browser/ui/webui_browser/rail/rail_updater.h"
#include "chrome/browser/ui/webui_browser/rail/rail_webui_browser.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"
#include "ui/gfx/favicon_size.h"
#include "ui/webui/webui_util.h"

namespace rail {

namespace {

std::string ProfileName(Profile* profile) {
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!manager) {
    return std::string();
  }
  ProfileAttributesEntry* entry =
      manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(
          profile->GetPath());
  return entry ? base::UTF16ToUTF8(entry->GetLocalProfileName())
               : std::string();
}

rail_settings::mojom::UpdateStatus UpdateStatusOf(const Updater* updater) {
  using rail_settings::mojom::UpdateStatus;
  if (!updater) {
    return UpdateStatus::kUnavailable;
  }
  switch (updater->status()) {
    case Updater::Status::kIdle:
      return UpdateStatus::kIdle;
    case Updater::Status::kChecking:
      return UpdateStatus::kChecking;
    case Updater::Status::kDownloading:
      return UpdateStatus::kDownloading;
    case Updater::Status::kUpToDate:
      return UpdateStatus::kUpToDate;
    case Updater::Status::kReady:
      return UpdateStatus::kReady;
    case Updater::Status::kFailed:
      return UpdateStatus::kFailed;
  }
  NOTREACHED();
}

std::optional<std::string> ReadyVersionOf(const Updater* updater) {
  return updater ? updater->ready_version() : std::nullopt;
}

std::vector<rail_settings::mojom::SiteRoutePtr> SiteRoutesFor(
    PrefService* prefs) {
  std::vector<rail_settings::mojom::SiteRoutePtr> routes;
  for (const SiteRoute& route : GetSiteRoutes(prefs)) {
    routes.push_back(rail_settings::mojom::SiteRoute::New(
        route.domain, route.path, route.query, route.space_id, route.enabled,
        route.from_ai));
  }
  return routes;
}

}

RailSettingsUIConfig::RailSettingsUIConfig()
    : DefaultTopChromeWebUIConfig(content::kChromeUIScheme,
                                  kRailSettingsHost) {}

RailSettingsUI::RailSettingsUI(content::WebUI* web_ui)
    : TopChromeWebUIController(web_ui,
                               /*enable_chrome_send=*/false,
                               /*enable_chrome_histograms=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), kRailSettingsHost);
  webui::SetupWebUIDataSource(source, kWebuiBrowserResources,
                              IDR_WEBUI_BROWSER_RAIL_SETTINGS_HTML);
  if (Updater* updater = Updater::Get()) {
    update_subscription_ = updater->AddStatusCallback(
        base::BindRepeating(&RailSettingsUI::OnUpdateStatusChanged,
                            weak_factory_.GetWeakPtr()));
  }
}

RailSettingsUI::~RailSettingsUI() = default;

void RailSettingsUI::ShowSection(const std::string& section) {
  if (!page_) {
    pending_section_ = section;
    return;
  }
  page_->OnShowSection(section);
}

void RailSettingsUI::BindInterface(
    mojo::PendingReceiver<rail_settings::mojom::PageHandlerFactory> receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void RailSettingsUI::CreatePageHandler(
    mojo::PendingRemote<rail_settings::mojom::Page> page,
    mojo::PendingReceiver<rail_settings::mojom::PageHandler> handler) {
  page_.reset();
  page_.Bind(std::move(page));
  page_handler_receiver_.reset();
  page_handler_receiver_.Bind(std::move(handler));
  if (!pending_section_.empty()) {
    page_->OnShowSection(std::exchange(pending_section_, std::string()));
  }
}

void RailSettingsUI::ListProfiles(ListProfilesCallback callback) {
  std::vector<rail_settings::mojom::SettingsProfilePtr> profiles;
  for (const ProfileEntry& entry : rail::ListProfiles(BrowserFor(web_ui()))) {
    auto profile = rail_settings::mojom::SettingsProfile::New();
    profile->id = entry.id;
    profile->name = entry.name;
    profiles.push_back(std::move(profile));
  }
  std::move(callback).Run(std::move(profiles));
}

void RailSettingsUI::GetSidebarState(GetSidebarStateCallback callback) {
  BrowserWindowInterface* browser = BrowserFor(web_ui());
  std::move(callback).Run(rail::GetSidebarState(
      browser ? browser->GetProfile()->GetPrefs() : nullptr));
}

void RailSettingsUI::CreateProfile(const std::string& name,
                                   CreateProfileCallback callback) {
  rail::CreateProfile(name,
                      base::BindOnce(&RailSettingsUI::OnProfileCreated,
                                     weak_factory_.GetWeakPtr(),
                                     std::move(callback)));
}

void RailSettingsUI::OnProfileCreated(CreateProfileCallback callback,
                                      std::optional<ProfileEntry> entry) {
  if (!entry) {
    std::move(callback).Run(nullptr);
    return;
  }
  auto profile = rail_settings::mojom::SettingsProfile::New();
  profile->id = entry->id;
  profile->name = entry->name;
  std::move(callback).Run(std::move(profile));
}

void RailSettingsUI::GetProfileDetail(const std::string& id,
                                     GetProfileDetailCallback callback) {
  rail::ResolveProfile(
      BrowserFor(web_ui()), id,
      base::BindOnce(&RailSettingsUI::OnProfileResolvedForDetail,
                     weak_factory_.GetWeakPtr(), std::move(callback)));
}

void RailSettingsUI::OnProfileResolvedForDetail(
    GetProfileDetailCallback callback,
    Profile* profile) {
  if (!profile) {
    std::move(callback).Run(nullptr);
    return;
  }
  TemplateURLService* service =
      TemplateURLServiceFactory::GetForProfile(profile);
  if (service && !service->loaded()) {
    search_engine_subscriptions_.push_back(service->RegisterOnLoadedCallback(
        base::BindOnce(&RailSettingsUI::SendProfileDetail,
                       weak_factory_.GetWeakPtr(), std::move(callback),
                       profile)));
    service->Load();
    return;
  }
  SendProfileDetail(std::move(callback), profile);
}

void RailSettingsUI::SendProfileDetail(GetProfileDetailCallback callback,
                                       Profile* profile) {
  auto detail = rail_settings::mojom::ProfileDetail::New();
  detail->name = ProfileName(profile);
  detail->search_suggestions =
      profile->GetPrefs()->GetBoolean(prefs::kSearchSuggestEnabled);

  TemplateURLService* service =
      TemplateURLServiceFactory::GetForProfile(profile);
  if (service) {
    for (const TemplateURL* turl : service->GetTemplateURLs()) {
      if (turl->type() != TemplateURL::NORMAL ||
          turl->prepopulate_id() <= 0) {
        continue;
      }
      auto engine = rail_settings::mojom::SearchEngine::New();
      engine->id = turl->sync_guid();
      engine->name = base::UTF16ToUTF8(turl->short_name());
      detail->search_engines.push_back(std::move(engine));
    }
    if (const TemplateURL* current = service->GetDefaultSearchProvider()) {
      detail->search_engine_id = current->sync_guid();
    }
  }
  std::move(callback).Run(std::move(detail));
}

void RailSettingsUI::RenameProfile(const std::string& id,
                                   const std::string& name) {
  rail::ResolveProfile(
      BrowserFor(web_ui()), id,
      base::BindOnce(&RailSettingsUI::OnProfileResolvedForRename,
                     weak_factory_.GetWeakPtr(), name));
}

void RailSettingsUI::OnProfileResolvedForRename(const std::string& name,
                                                Profile* profile) {
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!profile || !manager || name.empty()) {
    return;
  }
  ProfileAttributesEntry* entry =
      manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(
          profile->GetPath());
  if (!entry) {
    return;
  }
  entry->SetLocalProfileName(base::UTF8ToUTF16(name),
                             /*is_default_name=*/false);
  if (page_) {
    page_->OnProfilesChanged();
  }
}

void RailSettingsUI::DeleteProfile(const std::string& id) {
  rail::DeleteProfile(id);
  if (page_) {
    page_->OnProfilesChanged();
  }
}

void RailSettingsUI::SetSearchEngine(const std::string& id,
                                     const std::string& engine_id) {
  rail::ResolveProfile(
      BrowserFor(web_ui()), id,
      base::BindOnce(&RailSettingsUI::OnProfileResolvedForEngine,
                     weak_factory_.GetWeakPtr(), engine_id));
}

void RailSettingsUI::OnProfileResolvedForEngine(const std::string& engine_id,
                                                Profile* profile) {
  TemplateURLService* service =
      profile ? TemplateURLServiceFactory::GetForProfile(profile) : nullptr;
  if (!service) {
    return;
  }
  TemplateURL* turl = service->GetTemplateURLForGUID(engine_id);
  if (turl) {
    service->SetUserSelectedDefaultSearchProvider(turl);
  }
}

void RailSettingsUI::SetSearchSuggestions(const std::string& id, bool enabled) {
  rail::ResolveProfile(
      BrowserFor(web_ui()), id, base::BindOnce([](bool value, Profile* profile) {
        if (profile) {
          profile->GetPrefs()->SetBoolean(prefs::kSearchSuggestEnabled, value);
        }
      }, enabled));
}

void RailSettingsUI::OpenSearchSettings(const std::string& id) {
  rail::CreateTabInProfile(BrowserFor(web_ui()), id,
                           GURL("chrome://settings/search"), base::DoNothing());
  Close();
}

void RailSettingsUI::GetOrganizeSettings(
    GetOrganizeSettingsCallback callback) {
  PrefService* prefs = PrefsFor(web_ui());
  std::move(callback).Run(
      rail::HasOpenRouterKey(prefs), rail::GetOrganizeModel(prefs),
      rail::IsAssistantEnabled(prefs),
      prefs && prefs->GetBoolean(rail::kTidyEnabledPref));
}

void RailSettingsUI::SetAssistantEnabled(bool enabled) {
  if (PrefService* prefs = PrefsFor(web_ui())) {
    prefs->SetBoolean(rail::kAssistantEnabledPref, enabled);
  }
}

void RailSettingsUI::SetTidyEnabled(bool enabled) {
  if (PrefService* prefs = PrefsFor(web_ui())) {
    prefs->SetBoolean(rail::kTidyEnabledPref, enabled);
  }
}

void RailSettingsUI::SetOpenRouterKey(const std::string& key) {
  BrowserWindowInterface* browser = BrowserFor(web_ui());
  rail::SetOpenRouterKey(browser ? browser->GetProfile() : nullptr, key);
}

void RailSettingsUI::SetOrganizeModel(const std::string& model) {
  rail::SetOrganizeModel(PrefsFor(web_ui()), model);
}

void RailSettingsUI::GetSidebarIconsOnly(
    GetSidebarIconsOnlyCallback callback) {
  std::move(callback).Run(rail::GetSidebarIconsOnly(PrefsFor(web_ui())));
}

void RailSettingsUI::SetSidebarIconsOnly(bool icons_only) {
  rail::SetSidebarIconsOnly(PrefsFor(web_ui()), icons_only);
}

void RailSettingsUI::GetSidebarExpandOnHover(
    GetSidebarExpandOnHoverCallback callback) {
  std::move(callback).Run(rail::GetSidebarExpandOnHover(PrefsFor(web_ui())));
}

void RailSettingsUI::SetSidebarExpandOnHover(bool expand) {
  rail::SetSidebarExpandOnHover(PrefsFor(web_ui()), expand);
}

void RailSettingsUI::GetThemedTitlebar(GetThemedTitlebarCallback callback) {
  std::move(callback).Run(rail::GetThemedTitlebar(PrefsFor(web_ui())));
}

void RailSettingsUI::SetThemedTitlebar(bool themed) {
  rail::SetThemedTitlebar(PrefsFor(web_ui()), themed);
}

void RailSettingsUI::GetGroupOpenedLinks(
    GetGroupOpenedLinksCallback callback) {
  std::move(callback).Run(rail::GetGroupOpenedLinks(PrefsFor(web_ui())));
}

void RailSettingsUI::SetGroupOpenedLinks(bool grouped) {
  rail::SetGroupOpenedLinks(PrefsFor(web_ui()), grouped);
}

void RailSettingsUI::GetReopenMiniWindows(
    GetReopenMiniWindowsCallback callback) {
  std::move(callback).Run(rail::GetReopenMiniWindows(PrefsFor(web_ui())));
}

void RailSettingsUI::SetReopenMiniWindows(bool reopen) {
  rail::SetReopenMiniWindows(PrefsFor(web_ui()), reopen);
}

void RailSettingsUI::GetTrailDepth(GetTrailDepthCallback callback) {
  std::move(callback).Run(rail::GetTrailDepth(PrefsFor(web_ui())));
}

void RailSettingsUI::SetTrailDepth(int32_t depth) {
  rail::SetTrailDepth(PrefsFor(web_ui()), depth);
}

void RailSettingsUI::GetTabSleep(GetTabSleepCallback callback) {
  PrefService* prefs = PrefsFor(web_ui());
  std::move(callback).Run(rail::GetTabSleepMinutes(prefs),
                          rail::GetTabSleepExceptions(prefs),
                          rail::GetTabArchiveHours(prefs));
}

void RailSettingsUI::SetTabSleepMinutes(int32_t minutes) {
  rail::SetTabSleepMinutes(PrefsFor(web_ui()), minutes);
}

void RailSettingsUI::SetTabSleepExceptions(
    const std::vector<std::string>& exceptions) {
  rail::SetTabSleepExceptions(PrefsFor(web_ui()), exceptions);
}

void RailSettingsUI::SetTabArchiveHours(const std::string& id,
                                        int32_t hours) {
  rail::SetTabArchiveHours(PrefsFor(web_ui()), id, hours);
}

void RailSettingsUI::GetSiteRoutes(GetSiteRoutesCallback callback) {
  PrefService* prefs = PrefsFor(web_ui());
  rail::PruneDeletedSpaces(prefs);
  std::move(callback).Run(SiteRoutesFor(prefs));
}

void RailSettingsUI::AddSiteRoute(const std::string& site,
                                  const std::string& space_id,
                                  AddSiteRouteCallback callback) {
  PrefService* prefs = PrefsFor(web_ui());
  const std::optional<SiteRoute> route = rail::ParseSiteRoute(site, space_id);
  if (!route || !rail::AddSiteRoute(prefs, *route)) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  std::move(callback).Run(SiteRoutesFor(prefs));
}

void RailSettingsUI::SetSiteRoutes(
    std::vector<rail_settings::mojom::SiteRoutePtr> routes) {
  std::vector<SiteRoute> stored;
  stored.reserve(routes.size());
  for (const rail_settings::mojom::SiteRoutePtr& route : routes) {
    stored.push_back(SiteRoute{route->domain, route->path, route->query,
                               route->space_id, route->enabled,
                               route->from_ai});
  }
  rail::SetSiteRoutes(PrefsFor(web_ui()), stored);
}

void RailSettingsUI::EditSiteRoute(uint32_t index,
                                   const std::string& site,
                                   EditSiteRouteCallback callback) {
  PrefService* prefs = PrefsFor(web_ui());
  if (!rail::EditSiteRoute(prefs, index, site)) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  std::move(callback).Run(SiteRoutesFor(prefs));
}

void RailSettingsUI::GetSpaceVisits(GetSpaceVisitsCallback callback) {
  std::move(callback).Run(rail::GetSpaceVisits(PrefsFor(web_ui())));
}

void RailSettingsUI::GetSiteFavicon(const std::string& site,
                                    const std::string& profile_id,
                                    GetSiteFaviconCallback callback) {
  std::vector<std::string> hosts =
      rail::SiteFaviconHosts(PrefsFor(web_ui()), site);
  rail::ResolveProfile(
      BrowserFor(web_ui()), profile_id,
      base::BindOnce(&RailSettingsUI::OnProfileResolvedForFavicon,
                     weak_factory_.GetWeakPtr(), std::move(hosts),
                     std::move(callback)));
}

void RailSettingsUI::OnProfileResolvedForFavicon(
    std::vector<std::string> hosts,
    GetSiteFaviconCallback callback,
    Profile* profile) {
  LoadSiteFavicon(std::move(hosts), std::move(callback),
                  profile ? profile->GetWeakPtr() : base::WeakPtr<Profile>());
}

void RailSettingsUI::LoadSiteFavicon(std::vector<std::string> hosts,
                                     GetSiteFaviconCallback callback,
                                     base::WeakPtr<Profile> profile) {
  favicon::FaviconService* service =
      profile ? FaviconServiceFactory::GetForProfile(
                    profile.get(), ServiceAccessType::EXPLICIT_ACCESS)
              : nullptr;
  if (!service || hosts.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  const GURL page("https://" + hosts.front() + "/");
  hosts.erase(hosts.begin());
  constexpr bool kFallbackToHost = true;
  service->GetRawFaviconForPageURL(
      page, {favicon_base::IconType::kFavicon}, 2 * gfx::kFaviconSize,
      kFallbackToHost,
      base::BindOnce(&RailSettingsUI::OnSiteFaviconLoaded,
                     weak_factory_.GetWeakPtr(), std::move(hosts),
                     std::move(callback), profile),
      &favicon_tracker_);
}

void RailSettingsUI::OnSiteFaviconLoaded(
    std::vector<std::string> hosts,
    GetSiteFaviconCallback callback,
    base::WeakPtr<Profile> profile,
    const favicon_base::FaviconRawBitmapResult& result) {
  if (result.is_valid()) {
    std::move(callback).Run("data:image/png;base64," +
                            base::Base64Encode(*result.bitmap_data));
    return;
  }
  LoadSiteFavicon(std::move(hosts), std::move(callback), profile);
}

void RailSettingsUI::PlanSiteRoutes(const std::string& prompt,
                                    PlanSiteRoutesCallback callback) {
  BrowserWindowInterface* browser = BrowserFor(web_ui());
  route_planner_.Organize(browser ? browser->GetProfile() : nullptr, prompt,
                          std::move(callback));
}

void RailSettingsUI::ApplyPlannedRoutes(
    std::vector<rail_settings::mojom::PlannedRoutePtr> routes,
    ApplyPlannedRoutesCallback callback) {
  std::vector<SiteRoute> planned;
  for (const rail_settings::mojom::PlannedRoutePtr& route : routes) {
    if (std::optional<SiteRoute> parsed =
            rail::ParseSiteRoute(route->site, route->space_id)) {
      planned.push_back(std::move(*parsed));
    }
  }
  PrefService* prefs = PrefsFor(web_ui());
  if (!rail::ApplyPlannedRoutes(prefs, planned)) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  std::move(callback).Run(SiteRoutesFor(prefs));
}

void RailSettingsUI::GetVersions(GetVersionsCallback callback) {
  std::move(callback).Run(BUILDFLAG(RAIL_VERSION),
                          std::string(version_info::GetVersionNumber()));
}

void RailSettingsUI::GetUpdateStatus(GetUpdateStatusCallback callback) {
  Updater* updater = Updater::Get();
  std::move(callback).Run(UpdateStatusOf(updater), ReadyVersionOf(updater));
}

void RailSettingsUI::CheckForUpdates() {
  if (Updater* updater = Updater::Get()) {
    updater->CheckNow();
  }
}

void RailSettingsUI::ApplyUpdate() {
  if (Updater* updater = Updater::Get()) {
    updater->Apply();
  }
}

void RailSettingsUI::OnUpdateStatusChanged() {
  if (!page_) {
    return;
  }
  Updater* updater = Updater::Get();
  page_->OnUpdateStatusChanged(UpdateStatusOf(updater),
                               ReadyVersionOf(updater));
}

void RailSettingsUI::OpenUrl(const std::string& url) {
  GURL target(url);
  if (!target.SchemeIsHTTPOrHTTPS() &&
      !target.SchemeIs(content::kChromeUIScheme)) {
    return;
  }
  rail::CreateTabInProfile(BrowserFor(web_ui()), std::string(), target,
                           base::DoNothing());
  Close();
}

void RailSettingsUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailSettingsUI)

}
