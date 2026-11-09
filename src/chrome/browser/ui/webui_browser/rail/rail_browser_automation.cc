#include "chrome/browser/ui/webui_browser/rail/rail_browser_automation.h"

#include "chrome/browser/browser_process.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"

namespace rail {

namespace {

constexpr char kApproveConnectionsAutomaticallyPref[] =
    "rail.browser_automation.approve_automatically";

}

void RegisterBrowserAutomationLocalStatePrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(kApproveConnectionsAutomaticallyPref, false);
}

bool GetApproveConnectionsAutomatically() {
  PrefService* state = g_browser_process->local_state();
  return state && state->GetBoolean(kApproveConnectionsAutomaticallyPref);
}

void SetApproveConnectionsAutomatically(bool approve) {
  if (PrefService* state = g_browser_process->local_state()) {
    state->SetBoolean(kApproveConnectionsAutomaticallyPref, approve);
  }
}

}
