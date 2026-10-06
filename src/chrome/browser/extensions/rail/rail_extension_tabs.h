#ifndef CHROME_BROWSER_EXTENSIONS_RAIL_RAIL_EXTENSION_TABS_H_
#define CHROME_BROWSER_EXTENSIONS_RAIL_RAIL_EXTENSION_TABS_H_

#include <memory>

#include "components/tab_groups/tab_group_id.h"

class BrowserWindowInterface;
class GURL;
class TabListInterface;

namespace content {
class BrowserContext;
class WebContents;
}  // namespace content

namespace extensions {
class Extension;
class WindowController;
}  // namespace extensions

namespace rail {

bool WindowHoldsTabsOf(BrowserWindowInterface* window,
                       content::BrowserContext* context);

bool WindowHoldsTabsOf(const extensions::WindowController* window,
                       content::BrowserContext* context);

bool WindowVisibleTo(const extensions::WindowController* window,
                     content::BrowserContext* context);

bool TabVisibleTo(content::WebContents* contents,
                  content::BrowserContext* context,
                  bool include_incognito);

bool TabVisibleTo(content::WebContents* contents,
                  const extensions::Extension* extension);

bool GroupVisibleTo(TabListInterface& tab_list,
                    const tab_groups::TabGroupId& group,
                    content::BrowserContext* context,
                    bool include_incognito);

std::unique_ptr<content::WebContents> CreateExtensionTabContents(
    BrowserWindowInterface& window,
    content::BrowserContext* context,
    const GURL& url);

}  // namespace rail

#endif  // CHROME_BROWSER_EXTENSIONS_RAIL_RAIL_EXTENSION_TABS_H_
