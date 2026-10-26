#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_SIDEBAR_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_SIDEBAR_H_

#include <map>
#include <optional>
#include <set>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/values.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import.h"

namespace rail {

struct SidebarInput {
  std::string source_id;
  std::set<std::string> imported;
  std::set<std::string> dirs;
};

struct SidebarBuild {
  base::ListValue spaces;
  std::map<std::string, base::ListValue> favorites;
  std::vector<std::string> known_spaces;
  std::map<std::string, ImportCounts> counts;
};

struct SpaceInfo {
  std::string id;
  std::string name;
  std::string color;
  std::string icon;
  std::string profile;
};

struct SpaceRows {
  base::ListValue pinned;
  base::ListValue folders;
  base::ListValue tidy_groups;
  base::ListValue tabs;
};

std::optional<base::Value> ReadJsonFile(const base::FilePath& path);

std::string ImportId(const std::string& source_id,
                     const std::string& dir,
                     const std::string& key);

bool IsImportedId(const SidebarInput& input, const std::string& id);

bool HasRows(const SpaceRows& rows);

base::DictValue PinEntry(const std::string& id,
                         const std::string& url,
                         const std::string& title,
                         const std::string& favicon,
                         const std::string& folder);

base::DictValue FolderEntry(const std::string& id,
                            const std::string& name,
                            const std::string& after);

base::DictValue SpaceEntry(const SpaceInfo& info, SpaceRows rows);

}

#endif
