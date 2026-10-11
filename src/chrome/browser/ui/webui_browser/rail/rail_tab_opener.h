#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_OPENER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_OPENER_H_

#include <optional>
#include <utility>
#include <vector>

#include "base/functional/callback.h"
#include "components/browser_apis/tab_strip/types/node_id.h"

class Browser;

namespace content {
class NavigationHandle;
class WebContents;
struct OpenURLParams;
}

namespace rail {

std::optional<tabs_api::NodeId> OpenerOfTab(Browser* browser,
                                            const tabs_api::NodeId& tab_id);

bool OpenedFromLink(const tabs_api::NodeId& tab_id);

std::vector<std::pair<tabs_api::NodeId, tabs_api::NodeId>> OpenersOfTabs(
    Browser* browser);

void ForgetOpeners(Browser* browser,
                   const std::vector<tabs_api::NodeId>& tab_ids);

content::WebContents* OpenFromShell(
    Browser* browser,
    const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)> navigation_callback);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_OPENER_H_
