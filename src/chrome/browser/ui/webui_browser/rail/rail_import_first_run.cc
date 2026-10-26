#include "chrome/browser/ui/webui_browser/rail/rail_import_first_run.h"

#include "chrome/browser/browser_process.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"

namespace rail {

namespace {

constexpr char kImportFirstRunDonePref[] = "rail.import_first_run_done";

}

void RegisterImportFirstRunPrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(kImportFirstRunDonePref, false);
}

bool ImportFirstRunPending() {
  PrefService* local_state = g_browser_process->local_state();
  return local_state && !local_state->GetBoolean(kImportFirstRunDonePref);
}

void MarkImportFirstRunShown() {
  PrefService* local_state = g_browser_process->local_state();
  if (local_state) {
    local_state->SetBoolean(kImportFirstRunDonePref, true);
  }
}

}
