#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_

#include <string>
#include <vector>

class PrefService;

namespace user_prefs {
class PrefRegistrySyncable;
}

namespace rail {

extern const char kSidebarStatePref[];
extern const char kSidebarIconsOnlyPref[];
extern const char kThemedTitlebarPref[];
extern const char kTrailDepthPref[];
extern const char kTabSleepMinutesPref[];
extern const char kTabSleepExceptionsPref[];
extern const char kTabArchiveHoursPref[];

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry);

std::string GetSidebarState(PrefService* prefs);

void SetSidebarState(PrefService* prefs, const std::string& value);

bool GetSidebarIconsOnly(PrefService* prefs);

void SetSidebarIconsOnly(PrefService* prefs, bool icons_only);

bool GetThemedTitlebar(PrefService* prefs);

void SetThemedTitlebar(PrefService* prefs, bool themed);

bool GetGroupOpenedLinks(PrefService* prefs);

void SetGroupOpenedLinks(PrefService* prefs, bool grouped);

int GetTrailDepth(PrefService* prefs);

void SetTrailDepth(PrefService* prefs, int depth);

int GetTabSleepMinutes(PrefService* prefs);

void SetTabSleepMinutes(PrefService* prefs, int minutes);

std::vector<std::string> GetTabSleepExceptions(PrefService* prefs);

void SetTabSleepExceptions(PrefService* prefs,
                           const std::vector<std::string>& sites);

int GetTabArchiveHours(PrefService* prefs);

void SetTabArchiveHours(PrefService* prefs, int hours);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
