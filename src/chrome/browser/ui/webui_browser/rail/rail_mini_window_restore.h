#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_RESTORE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_RESTORE_H_

#include <memory>

class ChromeBrowserMainExtraParts;
class PrefService;

namespace rail {

extern const char kReopenMiniWindowsPref[];
extern const char kOpenMiniWindowsPref[];

bool GetReopenMiniWindows(PrefService* prefs);

void SetReopenMiniWindows(PrefService* prefs, bool reopen);

std::unique_ptr<ChromeBrowserMainExtraParts> CreateMiniWindowRestoreMainParts();

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MINI_WINDOW_RESTORE_H_
