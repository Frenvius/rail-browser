#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_

class PrefRegistrySimple;

namespace rail {

void RegisterBrowserAutomationLocalStatePrefs(PrefRegistrySimple* registry);

bool GetApproveConnectionsAutomatically();

void SetApproveConnectionsAutomatically(bool approve);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_BROWSER_AUTOMATION_H_
