#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDE_PANEL_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDE_PANEL_H_

#include <string>

class Profile;
class SidePanelEntryKey;

namespace content {
class WebContents;
}

namespace rail {

std::string ExtensionSidePanelTitle(Profile* profile,
                                    const SidePanelEntryKey& key);

void LoadExtensionSidePanel(content::WebContents* contents);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SIDE_PANEL_H_
