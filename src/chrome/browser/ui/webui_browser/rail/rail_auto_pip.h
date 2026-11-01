#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_AUTO_PIP_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_AUTO_PIP_H_

#include <optional>

namespace content {
class WebContents;
}

namespace rail {

void TrackAutoPipVideo(content::WebContents* contents);
std::optional<bool> AutoPipVideoAllowed(content::WebContents* contents);

}

#endif
