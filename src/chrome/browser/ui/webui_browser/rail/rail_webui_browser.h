#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WEBUI_BROWSER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WEBUI_BROWSER_H_

class BrowserWindowInterface;
class PrefService;

namespace content {
class WebUI;
}

namespace rail {

BrowserWindowInterface* BrowserFor(content::WebUI* web_ui);

PrefService* PrefsFor(content::WebUI* web_ui);

}

#endif
