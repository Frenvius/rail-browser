#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_KEY_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_KEY_H_

#include <map>
#include <string>

#include "components/sessions/core/session_id.h"

class BrowserWindowInterface;

namespace rail {

extern const char kWindowKeyExtraData[];

void RememberEarlierWindowKey(
    SessionID window_id,
    const std::map<std::string, std::string>& extra_data);

std::string ExchangeWindowKey(BrowserWindowInterface* browser,
                              const std::string& key);

std::string WindowKeyOf(SessionID window_id);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_KEY_H_
