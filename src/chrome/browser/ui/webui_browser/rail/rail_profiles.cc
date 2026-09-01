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
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/browser/ui/tabs/tab_enums.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/common/pref_names.h"
#include "components/tabs/public/tab_interface.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/navigation_controller.h"
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

content::WebContents* InsertTab(Browser* browser,
                                Profile* profile,
                                const GURL& url,
                                int index) {
  if (!browser || !profile) {
    return nullptr;
  }

  if (profile == browser->profile()) {
    return chrome::AddAndReturnTabAt(browser, url, index, true, std::nullopt,
                                     false);
  }

  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(content::WebContents::CreateParams(profile));
  contents->GetController().LoadURLWithParams(
      content::NavigationController::LoadURLParams(url));

  NavigateParams params(browser, std::move(contents));
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  params.transition = ui::PAGE_TRANSITION_TYPED;
  params.tabstrip_index = index;
  Navigate(&params);
  return params.navigated_or_inserted_contents;
}

void OnProfileResolved(base::WeakPtr<Browser> browser,
                       GURL url,
                       TabCreatedCallback callback,
                       Profile* profile) {
  std::move(callback).Run(InsertTab(browser.get(), profile, url, -1));
}

void OnMoveProfileResolved(base::WeakPtr<Browser> browser,
                           tabs::TabHandle handle,
                           GURL url,
                           TabCreatedCallback callback,
                           Profile* profile) {
  tabs::TabInterface* tab = handle.Get();
  if (!browser || !tab) {
    std::move(callback).Run(nullptr);
    return;
  }
  TabStripModel* model = browser->tab_strip_model();
  const int index = model->GetIndexOfTab(tab);
  if (index == TabStripModel::kNoTab) {
    std::move(callback).Run(nullptr);
    return;
  }
  content::WebContents* created =
      InsertTab(browser.get(), profile, url, index + 1);
  const int old_index = model->GetIndexOfTab(tab);
  if (old_index != TabStripModel::kNoTab) {
    model->CloseWebContentsAt(old_index, TabCloseTypes::CLOSE_NONE);
  }
  std::move(callback).Run(created);
}

void OnFallbackToShell(base::WeakPtr<Browser> browser,
                       ProfileResolvedCallback callback,
                       Profile* profile) {
  if (!profile && browser) {
    profile = browser->profile();
  }
  std::move(callback).Run(profile);
}

void OnProfileCreated(ProfileCreatedCallback callback, Profile* profile) {
  if (profile) {
    if (PrefService* local_state = g_browser_process->local_state()) {
      local_state->SetBoolean(prefs::kBrowserShowProfilePickerOnStartup, false);
    }
  }
  std::move(callback).Run(EntryForProfile(profile));
}

}  // namespace

std::vector<ProfileEntry> ListProfiles(Browser* browser) {
  std::vector<ProfileEntry> entries;
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!browser || !manager) {
    return entries;
  }

  const base::FilePath shell_path = browser->profile()->GetPath();
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

void ResolveProfile(Browser* browser,
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
    std::move(callback).Run(browser->profile());
    return;
  }

  if (Profile* loaded = manager->GetProfileByPath(path)) {
    std::move(callback).Run(loaded);
    return;
  }

  manager->CreateProfileAsync(
      path, base::BindOnce(&OnFallbackToShell, browser->AsWeakPtr(),
                           std::move(callback)));
}

std::string ProfileIdOfTab(Browser* browser, const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return std::string();
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  if (!contents || contents->GetBrowserContext() == browser->profile()) {
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

Profile* ProfileForNewTab(BrowserWindowInterface* browser,
                          content::WebContents* source) {
  if (!browser) {
    return nullptr;
  }
  if (source) {
    return Profile::FromBrowserContext(source->GetBrowserContext());
  }
  auto it = ActiveProfiles().find(browser);
  return it == ActiveProfiles().end() ? browser->GetProfile()
                                      : it->second.get();
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

void CreateTabInProfile(Browser* browser,
                        const std::string& profile_id,
                        const GURL& url,
                        TabCreatedCallback callback) {
  if (!browser || url.is_empty()) {
    std::move(callback).Run(nullptr);
    return;
  }

  ResolveProfile(browser, profile_id,
                 base::BindOnce(&OnProfileResolved, browser->AsWeakPtr(), url,
                                std::move(callback)));
}

void MoveTabToProfile(Browser* browser,
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
                 base::BindOnce(&OnMoveProfileResolved, browser->AsWeakPtr(),
                                *handle, url, std::move(callback)));
}

}  // namespace rail
