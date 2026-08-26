#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_

#include <vector>

#include "components/browser_apis/tab_strip/types/node_id.h"

class Browser;
class BrowserWindowInterface;

namespace gfx {
class Point;
}

namespace rail {

BrowserWindowInterface* WindowUnderPoint(Browser* source,
                                         const gfx::Point& screen_point);

void DropActiveTabAtScreenPoint(Browser* source, const gfx::Point& screen_point);

bool MoveTabsToNewWindow(Browser* source,
                         const std::vector<tabs_api::NodeId>& ids);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
