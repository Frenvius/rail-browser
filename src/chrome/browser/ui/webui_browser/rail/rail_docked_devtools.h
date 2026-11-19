#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DOCKED_DEVTOOLS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DOCKED_DEVTOOLS_H_

namespace content {
class WebContents;
}

namespace rail {

void DetachDockedDevTools(content::WebContents* shell);

}

#endif
