#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_

#include <string>

#include "components/browser_apis/tab_strip/types/node_id.h"

class PrefRegistrySimple;

namespace rail {

std::string TargetIdOfTab(const tabs_api::NodeId& tab_id);

void RegisterBrowserAutomationLocalStatePrefs(PrefRegistrySimple* registry);

bool GetApproveConnectionsAutomatically();

void SetApproveConnectionsAutomatically(bool approve);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_
