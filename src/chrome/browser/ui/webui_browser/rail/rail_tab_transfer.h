#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_

#include <string>
#include <vector>

#include "components/browser_apis/tab_strip/types/node_id.h"

class Browser;
class BrowserWindowInterface;

namespace gfx {
class Point;
}

namespace rail {

struct WindowEntry {
  int id = 0;
  std::string title;
};

BrowserWindowInterface* WindowUnderPoint(Browser* source,
                                         const gfx::Point& screen_point);

void DropTabsAtScreenPoint(Browser* source,
                           const gfx::Point& screen_point,
                           const std::vector<tabs_api::NodeId>& ids);

bool MoveTabsToNewWindow(Browser* source,
                         const std::vector<tabs_api::NodeId>& ids);

std::vector<WindowEntry> OtherWindows(Browser* source);

bool MoveTabsToWindow(Browser* source,
                      int window_id,
                      const std::vector<tabs_api::NodeId>& ids);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
