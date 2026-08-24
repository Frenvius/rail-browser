#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PARTITION_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PARTITION_H_

#include <string>

class Browser;
class GURL;

namespace content {
class WebContents;
}

namespace rail {

content::WebContents* CreateTabInPartition(Browser* browser,
                                           const std::string& partition,
                                           const GURL& url);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PARTITION_H_
