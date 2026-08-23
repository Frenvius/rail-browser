#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"

#include "components/pref_registry/pref_registry_syncable.h"
#include "components/prefs/pref_service.h"

namespace rail {

namespace {

constexpr char kSidebarStatePref[] = "rail.sidebar_state";

}

void RegisterSidebarStateProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kSidebarStatePref, std::string());
}

std::string GetSidebarState(PrefService* prefs) {
  return prefs ? prefs->GetString(kSidebarStatePref) : std::string();
}

void SetSidebarState(PrefService* prefs, const std::string& value) {
  if (prefs) {
    prefs->SetString(kSidebarStatePref, value);
  }
}

}
