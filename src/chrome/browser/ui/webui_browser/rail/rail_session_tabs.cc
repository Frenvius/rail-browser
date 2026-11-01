#include "chrome/browser/ui/webui_browser/rail/rail_session_tabs.h"

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"

namespace rail {

Profile* SessionProfileOf(content::WebContents* contents) {
  tabs::TabInterface* tab = tabs::TabInterface::MaybeGetFromContents(contents);
  BrowserWindowInterface* window =
      tab ? tab->GetBrowserWindowInterface() : nullptr;
  return window ? window->GetProfile()
                : Profile::FromBrowserContext(contents->GetBrowserContext());
}

}
