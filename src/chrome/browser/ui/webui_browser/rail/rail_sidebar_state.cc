#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"

#include <algorithm>

#include "base/values.h"
#include "components/pref_registry/pref_registry_syncable.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"

namespace rail {

const char kSidebarStatePref[] = "rail.sidebar_state";
const char kSidebarIconsOnlyPref[] = "rail.sidebar_icons_only";
const char kThemedTitlebarPref[] = "rail.titlebar_themed";
const char kGroupOpenedLinksPref[] = "rail.group_opened_links";
const char kTrailDepthPref[] = "rail.trail_depth";
const char kTabSleepMinutesPref[] = "rail.tab_sleep_minutes";
const char kTabSleepExceptionsPref[] = "rail.tab_sleep_exceptions";
const char kTabArchiveHoursPref[] = "rail.tab_archive_hours";
const char kProfileTabArchiveHoursPref[] = "rail.profile_tab_archive_hours";

constexpr int kDefaultTabArchiveHours = 12;

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kSidebarStatePref, std::string());
  registry->RegisterBooleanPref(kSidebarIconsOnlyPref, false);
  registry->RegisterBooleanPref(kThemedTitlebarPref, true);
  registry->RegisterBooleanPref(kGroupOpenedLinksPref, true);
  registry->RegisterIntegerPref(kTrailDepthPref, 1);
  registry->RegisterIntegerPref(kTabSleepMinutesPref, 30);
  registry->RegisterListPref(kTabSleepExceptionsPref);
  registry->RegisterIntegerPref(kTabArchiveHoursPref, kDefaultTabArchiveHours);
  registry->RegisterDictionaryPref(kProfileTabArchiveHoursPref);
}

std::string GetSidebarState(PrefService* prefs) {
  return prefs ? prefs->GetString(kSidebarStatePref) : std::string();
}

void SetSidebarState(PrefService* prefs, const std::string& value) {
  if (prefs) {
    prefs->SetString(kSidebarStatePref, value);
  }
}

bool GetSidebarIconsOnly(PrefService* prefs) {
  return prefs && prefs->GetBoolean(kSidebarIconsOnlyPref);
}

void SetSidebarIconsOnly(PrefService* prefs, bool icons_only) {
  if (prefs) {
    prefs->SetBoolean(kSidebarIconsOnlyPref, icons_only);
  }
}

bool GetThemedTitlebar(PrefService* prefs) {
  return prefs && prefs->GetBoolean(kThemedTitlebarPref);
}

void SetThemedTitlebar(PrefService* prefs, bool themed) {
  if (prefs) {
    prefs->SetBoolean(kThemedTitlebarPref, themed);
  }
}

bool GetGroupOpenedLinks(PrefService* prefs) {
  return prefs && prefs->GetBoolean(kGroupOpenedLinksPref);
}

void SetGroupOpenedLinks(PrefService* prefs, bool grouped) {
  if (prefs) {
    prefs->SetBoolean(kGroupOpenedLinksPref, grouped);
  }
}

int GetTrailDepth(PrefService* prefs) {
  return prefs ? std::clamp(prefs->GetInteger(kTrailDepthPref), 0, 5) : 1;
}

void SetTrailDepth(PrefService* prefs, int depth) {
  if (prefs) {
    prefs->SetInteger(kTrailDepthPref, std::clamp(depth, 0, 5));
  }
}

int GetTabSleepMinutes(PrefService* prefs) {
  return prefs ? prefs->GetInteger(kTabSleepMinutesPref) : 30;
}

void SetTabSleepMinutes(PrefService* prefs, int minutes) {
  if (prefs) {
    prefs->SetInteger(kTabSleepMinutesPref, std::max(minutes, 0));
  }
}

std::vector<std::string> GetTabSleepExceptions(PrefService* prefs) {
  std::vector<std::string> sites;
  if (!prefs) {
    return sites;
  }
  for (const base::Value& site : prefs->GetList(kTabSleepExceptionsPref)) {
    if (site.is_string()) {
      sites.push_back(site.GetString());
    }
  }
  return sites;
}

void SetTabSleepExceptions(PrefService* prefs,
                           const std::vector<std::string>& sites) {
  if (!prefs) {
    return;
  }
  base::ListValue list;
  for (const std::string& site : sites) {
    if (!site.empty()) {
      list.Append(site);
    }
  }
  prefs->SetList(kTabSleepExceptionsPref, std::move(list));
}

base::flat_map<std::string, int32_t> GetTabArchiveHours(PrefService* prefs) {
  base::flat_map<std::string, int32_t> hours;
  if (!prefs) {
    hours[std::string()] = kDefaultTabArchiveHours;
    return hours;
  }
  for (const auto [id, value] : prefs->GetDict(kProfileTabArchiveHoursPref)) {
    if (!id.empty() && value.is_int()) {
      hours[id] = std::max(value.GetInt(), 0);
    }
  }
  hours[std::string()] = std::max(prefs->GetInteger(kTabArchiveHoursPref), 0);
  return hours;
}

void SetTabArchiveHours(PrefService* prefs,
                        const std::string& profile_id,
                        int hours) {
  if (!prefs) {
    return;
  }
  if (profile_id.empty()) {
    prefs->SetInteger(kTabArchiveHoursPref, std::max(hours, 0));
    return;
  }
  ScopedDictPrefUpdate update(prefs, kProfileTabArchiveHoursPref);
  update->Set(profile_id, std::max(hours, 0));
}

}
