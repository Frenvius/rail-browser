#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_

#include <string>
#include <vector>

#include "components/browser_apis/tab_strip/types/node_id.h"

class BrowserWindowInterface;

namespace gfx {
class Point;
}

namespace rail {

struct WindowEntry {
  int id = 0;
  std::string title;
};

BrowserWindowInterface* WindowUnderPoint(BrowserWindowInterface* source,
                                         const gfx::Point& screen_point);

void DropTabsAtScreenPoint(BrowserWindowInterface* source,
                           const gfx::Point& screen_point,
                           const std::vector<tabs_api::NodeId>& ids);

bool MoveTabsToNewWindow(BrowserWindowInterface* source,
                         const std::vector<tabs_api::NodeId>& ids);

bool MoveTabsToMiniWindow(BrowserWindowInterface* source,
                          const std::vector<tabs_api::NodeId>& ids);

std::vector<WindowEntry> OtherWindows(BrowserWindowInterface* source);

bool MoveTabsToWindow(BrowserWindowInterface* source,
                      int window_id,
                      const std::vector<tabs_api::NodeId>& ids);

bool TakeTab(BrowserWindowInterface* target, const tabs_api::NodeId& id);

bool CloseRemoteTab(BrowserWindowInterface* caller,
                    const tabs_api::NodeId& id);

std::vector<tabs_api::NodeId> LiveTabs(
    const std::vector<tabs_api::NodeId>& ids);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
