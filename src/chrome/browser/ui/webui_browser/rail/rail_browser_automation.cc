#include "chrome/browser/ui/webui_browser/rail/rail_browser_automation.h"

#include <optional>

#include "chrome/browser/browser_process.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/devtools_agent_host.h"
#include "content/public/browser/web_contents.h"

namespace rail {

namespace {

constexpr char kApproveConnectionsAutomaticallyPref[] =
    "rail.browser_automation.approve_automatically";

}

std::string TargetIdOfTab(const tabs_api::NodeId& tab_id) {
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  if (!contents) {
    return std::string();
  }
  return content::DevToolsAgentHost::GetOrCreateFor(contents)->GetId();
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
