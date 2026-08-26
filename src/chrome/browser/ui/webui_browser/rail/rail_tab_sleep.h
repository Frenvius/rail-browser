#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_

#include <vector>

#include "components/browser_apis/tab_strip/types/node_id.h"

class Browser;

namespace rail {

bool SleepTab(Browser* browser, const tabs_api::NodeId& tab_id);

std::vector<tabs_api::NodeId> SleepingTabs(Browser* browser);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_
