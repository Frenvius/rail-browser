#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_

#include <cstdint>
#include <string>
#include <vector>

#include "base/containers/flat_map.h"

class PrefService;

namespace user_prefs {
class PrefRegistrySyncable;
}

namespace rail {

extern const char kSidebarStatePref[];
extern const char kSidebarIconsOnlyPref[];
extern const char kSidebarExpandOnHoverPref[];
extern const char kThemedTitlebarPref[];
extern const char kTrailDepthPref[];
extern const char kTabSleepMinutesPref[];
extern const char kTabSleepExceptionsPref[];
extern const char kTabArchiveHoursPref[];
extern const char kProfileTabArchiveHoursPref[];

const std::string& BrowserRunId();

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry);

std::string GetSidebarState(PrefService* prefs);

void SetSidebarState(PrefService* prefs, const std::string& value);

bool GetSidebarIconsOnly(PrefService* prefs);

void SetSidebarIconsOnly(PrefService* prefs, bool icons_only);

bool GetSidebarExpandOnHover(PrefService* prefs);

void SetSidebarExpandOnHover(PrefService* prefs, bool expand);

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

base::flat_map<std::string, int32_t> GetTabArchiveHours(PrefService* prefs);

void SetTabArchiveHours(PrefService* prefs,
                        const std::string& profile_id,
                        int hours);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDEBAR_STATE_H_
