#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"

#include "components/pref_registry/pref_registry_syncable.h"
#include "components/prefs/pref_service.h"

namespace rail {

const char kSidebarStatePref[] = "rail.sidebar_state";
const char kSidebarIconsOnlyPref[] = "rail.sidebar_icons_only";
const char kThemedTitlebarPref[] = "rail.titlebar_themed";
const char kGroupOpenedLinksPref[] = "rail.group_opened_links";

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kSidebarStatePref, std::string());
  registry->RegisterBooleanPref(kSidebarIconsOnlyPref, false);
  registry->RegisterBooleanPref(kThemedTitlebarPref, true);
  registry->RegisterBooleanPref(kGroupOpenedLinksPref, true);
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

}
