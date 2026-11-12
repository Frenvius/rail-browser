#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"

#include <map>
#include <memory>
#include <utility>

#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/delete_profile_helper.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_attributes_entry.h"
#include "chrome/browser/profiles/profile_attributes_storage.h"
#include "chrome/browser/profiles/profile_avatar_icon_util.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/profiles/profile_metrics.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_enums.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/rail/rail_bundled_extensions.h"
#include "chrome/browser/ui/webui_browser/rail/rail_mini_window.h"
#include "chrome/common/pref_names.h"
#include "components/tabs/public/tab_interface.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"
#include "url/url_constants.h"

namespace rail {

namespace {

std::map<BrowserWindowInterface*, raw_ptr<Profile>>& ActiveProfiles() {
  static base::NoDestructor<std::map<BrowserWindowInterface*, raw_ptr<Profile>>>
      profiles;
  return *profiles;
}

std::string IdForPath(const base::FilePath& path) {
  return path.BaseName().AsUTF8Unsafe();
}

base::FilePath PathForId(const std::string& id) {
  ProfileManager* manager = g_browser_process->profile_manager();
  return manager ? manager->user_data_dir().AppendASCII(id) : base::FilePath();
}

std::optional<ProfileEntry> EntryForProfile(Profile* profile) {
  if (!profile) {
    return std::nullopt;
  }
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!manager) {
    return std::nullopt;
  }
  ProfileAttributesEntry* attributes =
      manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(
          profile->GetPath());
  if (!attributes) {
    return std::nullopt;
  }
  return ProfileEntry{
      IdForPath(profile->GetPath()),
      base::UTF16ToUTF8(attributes->GetLocalProfileName()),
  };
}

struct TabRequest {
  GURL url;
  int index = -1;
  bool foreground = true;
};

content::WebContents* InsertTab(BrowserWindowInterface* browser,
                                Profile* profile,
                                const TabRequest& request) {
  if (!browser || !profile) {
    return nullptr;
  }

  const bool mini = IsMiniWindow(browser);
  if (!mini && profile == browser->GetProfile() &&
      profile == ProfileForNewTab(browser)) {
    return chrome::AddAndReturnTabAt(browser, request.url, request.index,
                                     request.foreground, std::nullopt, false);
  }

  content::WebContents::CreateParams create(profile);
  create.initially_hidden = !request.foreground;
  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(create);
  content::NavigationController::LoadURLParams load(request.url);
  load.transition_type = ui::PAGE_TRANSITION_TYPED;
  contents->GetController().LoadURLWithParams(load);

  if (mini) {
    content::WebContents* inserted = contents.get();
    TabStripModel* model = browser->GetTabStripModel();
    model->InsertWebContentsAt(
        request.index < 0 ? model->count() : request.index,
        std::move(contents),
        request.foreground ? AddTabTypes::ADD_ACTIVE : AddTabTypes::ADD_NONE);
    return inserted;
  }

  NavigateParams params(browser, std::move(contents));
  params.disposition = request.foreground
                           ? WindowOpenDisposition::NEW_FOREGROUND_TAB
                           : WindowOpenDisposition::NEW_BACKGROUND_TAB;
  params.transition = ui::PAGE_TRANSITION_TYPED;
  params.tabstrip_index = request.index;
  Navigate(&params);
  return params.navigated_or_inserted_contents;
}

void OnProfileResolved(base::WeakPtr<BrowserWindowInterface> browser,
                       TabRequest request,
                       TabCreatedCallback callback,
                       Profile* profile) {
  std::move(callback).Run(InsertTab(browser.get(), profile, request));
}

void CreateTab(BrowserWindowInterface* browser,
               const std::string& profile_id,
               TabRequest request,
               TabCreatedCallback callback) {
  if (!browser || request.url.is_empty()) {
    std::move(callback).Run(nullptr);
    return;
  }

  ResolveProfile(browser, profile_id,
                 base::BindOnce(&OnProfileResolved, browser->GetWeakPtr(),
                                std::move(request), std::move(callback)));
}

void OnMoveProfileResolved(base::WeakPtr<BrowserWindowInterface> browser,
                           tabs::TabHandle handle,
                           GURL url,
                           TabCreatedCallback callback,
                           Profile* profile) {
  tabs::TabInterface* tab = handle.Get();
  if (!browser || !tab) {
    std::move(callback).Run(nullptr);
    return;
  }
  TabStripModel* model = browser->GetTabStripModel();
  const int index = model->GetIndexOfTab(tab);
  if (index == TabStripModel::kNoTab) {
    std::move(callback).Run(nullptr);
    return;
  }
  content::WebContents* created =
      InsertTab(browser.get(), profile, TabRequest{url, index + 1});
  const int old_index = model->GetIndexOfTab(tab);
  if (created && old_index != TabStripModel::kNoTab) {
    model->DetachAndDeleteWebContentsAt(old_index);
  }
  std::move(callback).Run(created);
}

void OnFallbackToShell(base::WeakPtr<BrowserWindowInterface> browser,
                       ProfileResolvedCallback callback,
                       Profile* profile) {
  if (!profile && browser) {
    profile = browser->GetProfile();
  }
  if (profile) {
    EnsureBundledExtensions(profile);
  }
  std::move(callback).Run(profile);
}

void OnProfileCreated(ProfileCreatedCallback callback, Profile* profile) {
  if (profile) {
    if (PrefService* local_state = g_browser_process->local_state()) {
      local_state->SetBoolean(prefs::kBrowserShowProfilePickerOnStartup, false);
    }
    EnsureBundledExtensions(profile);
  }
  std::move(callback).Run(EntryForProfile(profile));
}

}  // namespace

std::vector<ProfileEntry> ListProfiles(BrowserWindowInterface* browser) {
  std::vector<ProfileEntry> entries;
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!browser || !manager) {
    return entries;
  }

  const base::FilePath shell_path = browser->GetProfile()->GetPath();
  for (ProfileAttributesEntry* attributes :
       manager->GetProfileAttributesStorage()
           .GetAllProfilesAttributesSortedForDisplay()) {
    const base::FilePath path = attributes->GetPath();
    if (path == shell_path || attributes->IsOmitted() ||
        attributes->IsEphemeral()) {
      continue;
    }
    entries.push_back(ProfileEntry{
        IdForPath(path),
        base::UTF16ToUTF8(attributes->GetLocalProfileName()),
    });
  }
  return entries;
}

void CreateProfile(const std::string& name, ProfileCreatedCallback callback) {
  ProfileManager::CreateMultiProfileAsync(
      base::UTF8ToUTF16(name), profiles::GetPlaceholderAvatarIndex(),
      /*is_hidden=*/false,
      base::BindOnce(&OnProfileCreated, std::move(callback)));
}

bool ProfileExists(const std::string& profile_id) {
  ProfileManager* manager = g_browser_process->profile_manager();
  const base::FilePath path =
      profile_id.empty() ? base::FilePath() : PathForId(profile_id);
  return manager && !path.empty() &&
         manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(
             path);
}

void DeleteProfile(const std::string& profile_id) {
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!manager || profile_id.empty()) {
    return;
  }
  const base::FilePath path = PathForId(profile_id);
  if (path.empty() ||
      !manager->GetProfileAttributesStorage().GetProfileAttributesWithPath(
          path)) {
    return;
  }
  manager->GetDeleteProfileHelper().MaybeScheduleProfileForDeletion(
      path, base::DoNothing(), ProfileMetrics::DELETE_PROFILE_SETTINGS);
}

void ResolveProfile(BrowserWindowInterface* browser,
                    const std::string& profile_id,
                    ProfileResolvedCallback callback) {
  if (!browser) {
    std::move(callback).Run(nullptr);
    return;
  }

  ProfileManager* manager = g_browser_process->profile_manager();
  const base::FilePath path =
      profile_id.empty() ? base::FilePath() : PathForId(profile_id);
  if (!manager || path.empty()) {
    std::move(callback).Run(browser->GetProfile());
    return;
  }

  if (Profile* loaded = manager->GetProfileByPath(path)) {
    EnsureBundledExtensions(loaded);
    std::move(callback).Run(loaded);
    return;
  }

  manager->CreateProfileAsync(
      path, base::BindOnce(&OnFallbackToShell, browser->GetWeakPtr(),
                           std::move(callback)));
}

std::string ProfileIdOfTab(BrowserWindowInterface* browser,
                           const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return std::string();
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  if (!contents || contents->GetBrowserContext() == browser->GetProfile()) {
    return std::string();
  }
  return IdForPath(
      Profile::FromBrowserContext(contents->GetBrowserContext())->GetPath());
}

void SetActiveProfile(BrowserWindowInterface* browser, Profile* profile) {
  if (!browser) {
    return;
  }
  if (profile) {
    ActiveProfiles()[browser] = profile;
  } else {
    ActiveProfiles().erase(browser);
  }
}

void ForgetActiveProfile(BrowserWindowInterface* browser) {
  ActiveProfiles().erase(browser);
}

Profile* ProfileForNewTab(BrowserWindowInterface* browser) {
  if (!browser) {
    return nullptr;
  }
  auto it = ActiveProfiles().find(browser);
  return it == ActiveProfiles().end() ? browser->GetProfile()
                                      : it->second.get();
}

Profile* ProfileForNavigation(BrowserWindowInterface* browser,
                              const NavigateParams& params) {
  if (!browser) {
    return nullptr;
  }
  if (params.opener) {
    return Profile::FromBrowserContext(params.opener->GetBrowserContext());
  }
  content::WebContents* source = params.source_contents;
  if (!source ||
      source == browser->GetTabStripModel()->GetActiveWebContents()) {
    return ProfileForNewTab(browser);
  }
  return Profile::FromBrowserContext(source->GetBrowserContext());
}

BrowserWindowInterface* WindowHostingProfile(Profile* profile) {
  if (!profile) {
    return nullptr;
  }

  for (const auto& [window, active] : ActiveProfiles()) {
    if (active.get() == profile) {
      return window;
    }
  }

  for (BrowserWindowInterface* window : GetAllBrowserWindowInterfaces()) {
    TabStripModel* model = window->GetTabStripModel();
    for (int index = 0; index < model->count(); ++index) {
      content::WebContents* contents = model->GetWebContentsAt(index);
      if (contents && contents->GetBrowserContext() == profile) {
        return window;
      }
    }
  }

  return nullptr;
}

void CreateTabInProfile(BrowserWindowInterface* browser,
                        const std::string& profile_id,
                        const GURL& url,
                        TabCreatedCallback callback) {
  CreateTab(browser, profile_id, TabRequest{url}, std::move(callback));
}

void CreateBackgroundTabInProfile(BrowserWindowInterface* browser,
                                  const std::string& profile_id,
                                  const GURL& url,
                                  TabCreatedCallback callback) {
  CreateTab(browser, profile_id, TabRequest{url, -1, false},
            std::move(callback));
}

void MoveTabToProfile(BrowserWindowInterface* browser,
                      const tabs_api::NodeId& tab_id,
                      const std::string& profile_id,
                      TabCreatedCallback callback) {
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  if (!browser || !contents) {
    std::move(callback).Run(nullptr);
    return;
  }
  GURL url = contents->GetLastCommittedURL();
  if (url.is_empty()) {
    url = contents->GetVisibleURL();
  }
  if (url.is_empty()) {
    url = GURL(url::kAboutBlankURL);
  }
  ResolveProfile(browser, profile_id,
                 base::BindOnce(&OnMoveProfileResolved, browser->GetWeakPtr(),
                                *handle, url, std::move(callback)));
}

}  // namespace rail
