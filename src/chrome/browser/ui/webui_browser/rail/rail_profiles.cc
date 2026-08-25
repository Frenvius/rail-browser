#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"

#include <map>
#include <memory>
#include <utility>

#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_attributes_entry.h"
#include "chrome/browser/profiles/profile_attributes_storage.h"
#include "chrome/browser/profiles/profile_avatar_icon_util.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "chrome/common/pref_names.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

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

void InsertTab(Browser* browser,
               Profile* profile,
               const GURL& url,
               TabCreatedCallback callback) {
  if (!browser || !profile) {
    std::move(callback).Run(nullptr);
    return;
  }

  if (profile == browser->profile()) {
    std::move(callback).Run(
        chrome::AddAndReturnTabAt(browser, url, -1, true, std::nullopt, false));
    return;
  }

  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(content::WebContents::CreateParams(profile));
  contents->GetController().LoadURLWithParams(
      content::NavigationController::LoadURLParams(url));

  NavigateParams params(browser, std::move(contents));
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  params.transition = ui::PAGE_TRANSITION_TYPED;
  params.tabstrip_index = -1;
  Navigate(&params);
  std::move(callback).Run(params.navigated_or_inserted_contents);
}

void OnProfileResolved(base::WeakPtr<Browser> browser,
                       GURL url,
                       TabCreatedCallback callback,
                       Profile* profile) {
  InsertTab(browser.get(), profile, url, std::move(callback));
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

}  // namespace rail
