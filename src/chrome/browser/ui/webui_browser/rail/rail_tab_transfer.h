#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_

class Browser;
class BrowserWindowInterface;

namespace gfx {
class Point;
}

namespace rail {

BrowserWindowInterface* WindowUnderPoint(Browser* source,
                                         const gfx::Point& screen_point);

void DropActiveTabAtScreenPoint(Browser* source, const gfx::Point& screen_point);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_TRANSFER_H_
