#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PROFILES_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PROFILES_H_

#include <optional>
#include <string>
#include <vector>

#include "base/functional/callback.h"

class Browser;
class BrowserWindowInterface;
class GURL;
class Profile;

namespace content {
class WebContents;
}

namespace rail {

struct ProfileEntry {
  std::string id;
  std::string name;
};

std::vector<ProfileEntry> ListProfiles(Browser* browser);

using ProfileCreatedCallback =
    base::OnceCallback<void(std::optional<ProfileEntry>)>;

void CreateProfile(const std::string& name, ProfileCreatedCallback callback);

using ProfileResolvedCallback = base::OnceCallback<void(Profile*)>;

void ResolveProfile(Browser* browser,
                    const std::string& profile_id,
                    ProfileResolvedCallback callback);

using TabCreatedCallback = base::OnceCallback<void(content::WebContents*)>;

void CreateTabInProfile(Browser* browser,
                        const std::string& profile_id,
                        const GURL& url,
                        TabCreatedCallback callback);

void SetActiveProfile(BrowserWindowInterface* browser, Profile* profile);

void ForgetActiveProfile(BrowserWindowInterface* browser);

Profile* ProfileForNewTab(BrowserWindowInterface* browser,
                          content::WebContents* source);

BrowserWindowInterface* WindowHostingProfile(Profile* profile);

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PROFILES_H_
