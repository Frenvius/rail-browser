#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_IMPORT_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_IMPORT_H_

#include "base/files/file_path.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_sidebar.h"

namespace rail {

void AddArcSidebar(const base::FilePath& arc_root,
                   const SidebarInput& input,
                   SidebarBuild& build);

}

#endif
