#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_BACKGROUND_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_BACKGROUND_H_

#include <memory>

class ChromeBrowserMainExtraParts;
class PrefRegistrySimple;
class Profile;

namespace rail {

void RegisterPushBackgroundLocalStatePrefs(PrefRegistrySimple* registry);
void SetPushBackgroundWanted(Profile* profile, bool wanted);
std::unique_ptr<ChromeBrowserMainExtraParts> CreatePushBackgroundMainParts();

}

#endif
