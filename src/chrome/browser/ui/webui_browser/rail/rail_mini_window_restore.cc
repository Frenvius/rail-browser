#include "chrome/browser/ui/webui_browser/rail/rail_mini_window_restore.h"

#include <map>
#include <optional>
#include <set>
#include <string>
#include <utility>

#include "base/callback_list.h"
#include "base/functional/bind.h"
#include "base/memory/weak_ptr.h"
#include "base/values.h"
#include "chrome/browser/chrome_browser_main_extra_parts.h"
#include "chrome/browser/lifetime/application_lifetime_desktop.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/rail/rail_mini_window.h"
#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"
#include "components/browser_apis/tab_strip/types/node_id.h"
#include "components/prefs/pref_service.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/base_window.h"
#include "ui/display/display.h"
#include "ui/display/screen.h"
#include "ui/gfx/geometry/rect.h"
#include "url/gurl.h"

namespace rail {

const char kReopenMiniWindowsPref[] = "rail.reopen_mini_windows";
const char kOpenMiniWindowsPref[] = "rail.open_mini_windows";

namespace {

constexpr char kUrlKey[] = "url";
constexpr char kProfileKey[] = "profile";
constexpr char kXKey[] = "x";
constexpr char kYKey[] = "y";
constexpr char kWidthKey[] = "width";
constexpr char kHeightKey[] = "height";

std::optional<base::DictValue> RecordOf(BrowserWindowInterface* mini) {
  tabs::TabInterface* tab = mini->GetTabStripModel()->GetActiveTab();
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  if (!contents || contents->HasOpener() ||
      contents->GetBrowserContext()->IsOffTheRecord()) {
    return std::nullopt;
  }
  const GURL url = contents->GetLastCommittedURL().is_empty()
                       ? contents->GetVisibleURL()
                       : contents->GetLastCommittedURL();
  if (!url.SchemeIsHTTPOrHTTPS()) {
    return std::nullopt;
  }

  const gfx::Rect bounds = mini->GetWindow()->GetRestoredBounds();
  base::DictValue record;
  record.Set(kUrlKey, url.spec());
  record.Set(kProfileKey,
             ProfileIdOfTab(mini, tabs_api::NodeId::FromTabHandle(
                                      tab->GetHandle())));
  record.Set(kXKey, bounds.x());
  record.Set(kYKey, bounds.y());
  record.Set(kWidthKey, bounds.width());
  record.Set(kHeightKey, bounds.height());
  return record;
}

void SaveOpenMiniWindows(bool closing) {
  if (!closing) {
    return;
  }
  std::map<Profile*, base::ListValue> records;
  for (BrowserWindowInterface* browser : GetAllBrowserWindowInterfaces()) {
    Profile* profile = browser->GetProfile();
    if (profile->IsOffTheRecord()) {
      continue;
    }
    base::ListValue& list = records[profile];
    if (!IsMiniWindow(browser) || !GetReopenMiniWindows(profile->GetPrefs())) {
      continue;
    }
    if (std::optional<base::DictValue> record = RecordOf(browser)) {
      list.Append(std::move(*record));
    }
  }
  for (auto& [profile, list] : records) {
    profile->GetPrefs()->SetList(kOpenMiniWindowsPref, std::move(list));
  }
}

gfx::Rect VisibleBoundsOf(const base::DictValue& record) {
  gfx::Rect bounds(record.FindInt(kXKey).value_or(0),
                   record.FindInt(kYKey).value_or(0),
                   record.FindInt(kWidthKey).value_or(0),
                   record.FindInt(kHeightKey).value_or(0));
  if (bounds.IsEmpty()) {
    return gfx::Rect();
  }
  bounds.AdjustToFit(
      display::Screen::Get()->GetDisplayMatching(bounds).work_area());
  return bounds;
}

void ShowReopenedMiniWindow(base::WeakPtr<BrowserWindowInterface> mini,
                            content::WebContents* contents) {
  if (!mini) {
    return;
  }
  if (!contents) {
    mini->GetWindow()->Close();
    return;
  }
  mini->GetWindow()->Show();
}

void ReopenMiniWindows(Profile* profile) {
  PrefService* prefs = profile->GetPrefs();
  const base::ListValue records = prefs->GetList(kOpenMiniWindowsPref).Clone();
  prefs->ClearPref(kOpenMiniWindowsPref);
  if (!GetReopenMiniWindows(prefs)) {
    return;
  }

  for (const base::Value& value : records) {
    const base::DictValue* record = value.GetIfDict();
    const std::string* spec = record ? record->FindString(kUrlKey) : nullptr;
    const GURL url(spec ? *spec : std::string());
    if (!url.SchemeIsHTTPOrHTTPS()) {
      continue;
    }
    const std::string* stored_profile = record->FindString(kProfileKey);
    const std::string profile_id =
        stored_profile ? *stored_profile : std::string();
    if (!profile_id.empty() && !ProfileExists(profile_id)) {
      continue;
    }

    BrowserWindowInterface* mini =
        CreateMiniWindow(profile, VisibleBoundsOf(*record));
    if (!mini) {
      return;
    }
    CreateTabInProfile(
        mini, profile_id, url,
        base::BindOnce(&ShowReopenedMiniWindow, mini->GetWeakPtr()));
  }
}

class MiniWindowRestoreMainParts : public ChromeBrowserMainExtraParts {
 public:
  void PostBrowserStart() override {
    closing_subscription_ = chrome::AddClosingAllBrowsersCallback(
        base::BindRepeating(&SaveOpenMiniWindows));

    std::set<Profile*> profiles;
    for (BrowserWindowInterface* browser : GetAllBrowserWindowInterfaces()) {
      if (browser->GetType() == BrowserWindowInterface::TYPE_NORMAL &&
          !browser->GetProfile()->IsOffTheRecord()) {
        profiles.insert(browser->GetProfile());
      }
    }
    for (Profile* profile : profiles) {
      ReopenMiniWindows(profile);
    }
  }

 private:
  base::CallbackListSubscription closing_subscription_;
};

}

bool GetReopenMiniWindows(PrefService* prefs) {
  return prefs && prefs->GetBoolean(kReopenMiniWindowsPref);
}

void SetReopenMiniWindows(PrefService* prefs, bool reopen) {
  if (prefs) {
    prefs->SetBoolean(kReopenMiniWindowsPref, reopen);
  }
}

std::unique_ptr<ChromeBrowserMainExtraParts>
CreateMiniWindowRestoreMainParts() {
  return std::make_unique<MiniWindowRestoreMainParts>();
}

}
