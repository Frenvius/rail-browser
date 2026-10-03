#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_

#include <string>

class PrefService;

namespace user_prefs {
class PrefRegistrySyncable;
}

namespace rail {

extern const char kSidebarStatePref[];
extern const char kSidebarIconsOnlyPref[];

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry);

std::string GetSidebarState(PrefService* prefs);

void SetSidebarState(PrefService* prefs, const std::string& value);

bool GetSidebarIconsOnly(PrefService* prefs);

void SetSidebarIconsOnly(PrefService* prefs, bool icons_only);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
