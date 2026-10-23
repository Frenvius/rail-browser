#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_AUDIO_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_AUDIO_H_

#include "components/browser_apis/tab_strip/types/node_id.h"

class BrowserWindowInterface;

namespace rail {

bool ToggleTabMuted(BrowserWindowInterface* browser,
                    const tabs_api::NodeId& tab_id);

bool IsTabMuted(BrowserWindowInterface* browser,
                const tabs_api::NodeId& tab_id);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_AUDIO_H_
