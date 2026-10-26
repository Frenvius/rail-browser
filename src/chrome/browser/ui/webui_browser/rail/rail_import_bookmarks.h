#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_BOOKMARKS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_BOOKMARKS_H_

#include <string>

#include "base/files/file_path.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_sidebar.h"

namespace rail {

struct BookmarkSpaceSource {
  std::string source_id;
  std::string dir;
  std::string name;
  base::FilePath file;
};

void AddBookmarkSpace(const BookmarkSpaceSource& source,
                      const SidebarInput& input,
                      SidebarBuild& build);

}

#endif
