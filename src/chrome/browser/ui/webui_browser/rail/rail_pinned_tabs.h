#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PINNED_TABS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PINNED_TABS_H_

#include <string>

class PrefService;

namespace user_prefs {
class PrefRegistrySyncable;
}  // namespace user_prefs

namespace rail {

void RegisterPinnedTabsProfilePrefs(user_prefs::PrefRegistrySyncable* registry);

std::string GetPinnedTabs(PrefService* prefs);

void SetPinnedTabs(PrefService* prefs, const std::string& value);

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PINNED_TABS_H_
