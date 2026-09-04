#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_

#include <string>
#include <vector>

#include "ui/gfx/geometry/rect.h"
#include "url/gurl.h"

class Browser;
class Profile;

namespace rail {

inline constexpr char kRailMiniShellURL[] = "chrome://webui-browser/?mini";

bool IsMiniWindow(const Browser* browser);

bool ShouldOpenLinkInMiniWindow(const Browser* source);

gfx::Rect MiniWindowBoundsNear(const Browser* source);

Browser* CreateMiniWindow(Profile* profile, const gfx::Rect& bounds);

Browser* OpenMiniWindow(Profile* profile,
                        const GURL& url,
                        const gfx::Rect& bounds);

Browser* OpenMiniWindowNear(Browser* source, const GURL& url);

Browser* OpenExternalUrlsInMiniWindows(Profile* profile,
                                       const std::vector<GURL>& urls);

bool AdoptMiniWindow(Browser* mini, const std::string& space_id);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_H_
