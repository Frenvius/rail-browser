#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_

#include <string>
#include <vector>

#include "ui/gfx/geometry/rect.h"
#include "url/gurl.h"

class BrowserWindowInterface;
class Profile;

namespace rail {

inline constexpr char kRailMiniShellURL[] = "chrome://webui-browser/?mini";

bool IsMiniWindow(const BrowserWindowInterface* browser);

bool ShouldOpenLinkInMiniWindow(BrowserWindowInterface* source);

gfx::Rect MiniWindowBoundsNear(const BrowserWindowInterface* source);

BrowserWindowInterface* CreateMiniWindow(Profile* profile,
                                         const gfx::Rect& bounds);

BrowserWindowInterface* OpenMiniWindow(Profile* profile,
                                       const GURL& url,
                                       const gfx::Rect& bounds);

BrowserWindowInterface* OpenMiniWindowNear(BrowserWindowInterface* source,
                                           const GURL& url);

BrowserWindowInterface* OpenExternalUrlsInMiniWindows(
    Profile* profile,
    const std::vector<GURL>& urls);

bool AdoptMiniWindow(BrowserWindowInterface* mini, const std::string& space_id);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_
