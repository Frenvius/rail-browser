#include "chrome/browser/ui/webui_browser/rail/rail_pinned_tabs.h"

#include "components/pref_registry/pref_registry_syncable.h"
#include "components/prefs/pref_service.h"

namespace rail {

namespace {

constexpr char kPinnedTabsPref[] = "rail.pinned_tabs";

}  // namespace

void RegisterPinnedTabsProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kPinnedTabsPref, std::string());
}

std::string GetPinnedTabs(PrefService* prefs) {
  return prefs ? prefs->GetString(kPinnedTabsPref) : std::string();
}

void SetPinnedTabs(PrefService* prefs, const std::string& value) {
  if (prefs) {
    prefs->SetString(kPinnedTabsPref, value);
  }
}

}  // namespace rail
