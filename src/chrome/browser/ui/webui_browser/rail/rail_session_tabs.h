#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SESSION_TABS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SESSION_TABS_H_

class Profile;

namespace content {
class WebContents;
}

namespace rail {

Profile* SessionProfileOf(content::WebContents* contents);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SESSION_TABS_H_
