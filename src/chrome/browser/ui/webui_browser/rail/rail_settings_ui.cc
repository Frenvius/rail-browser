#include "chrome/browser/ui/webui_browser/rail/rail_settings_ui.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_attributes_entry.h"
#include "chrome/browser/profiles/profile_attributes_storage.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/search_engines/template_url_service_factory.h"
#include "chrome/common/pref_names.h"
#include "components/prefs/pref_service.h"
#include "components/search_engines/template_url.h"
#include "components/search_engines/template_url_service.h"
#include "url/gurl.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"
#include "chrome/browser/ui/webui_browser/rail/rail_tab_organizer.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"
#include "ui/webui/webui_util.h"

namespace rail {

namespace {

BrowserWindowInterface* BrowserFor(content::WebUI* web_ui) {
  BrowserWindowInterface* window =
      webui::GetBrowserWindowInterface(web_ui->GetWebContents());
  WebUIBrowserWindow* browser_window =
      window ? WebUIBrowserWindow::FromBrowser(window) : nullptr;
  return browser_window ? browser_window->browser() : nullptr;
}

PrefService* PrefsFor(content::WebUI* web_ui) {
  BrowserWindowInterface* browser = BrowserFor(web_ui);
  return browser ? browser->GetProfile()->GetPrefs() : nullptr;
}

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
  source->AddResourcePath(kRailCreditsPath,
                          IDR_WEBUI_BROWSER_RAIL_CREDITS_HTML);
}

RailSettingsUI::~RailSettingsUI() = default;

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
  std::move(callback).Run(rail::HasOpenRouterKey(prefs),
                          rail::GetOrganizeModel(prefs));
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

void RailSettingsUI::SetTabArchiveHours(int32_t hours) {
  rail::SetTabArchiveHours(PrefsFor(web_ui()), hours);
}

void RailSettingsUI::OpenCredits() {
  rail::CreateTabInProfile(BrowserFor(web_ui()), std::string(),
                           GURL(kRailCreditsURL), base::DoNothing());
  Close();
}

void RailSettingsUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailSettingsUI)

}
