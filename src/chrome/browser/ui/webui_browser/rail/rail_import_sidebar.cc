#include "chrome/browser/ui/webui_browser/rail/rail_import_sidebar.h"

#include <optional>
#include <string>
#include <utility>

#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/strings/stringprintf.h"
#include "base/strings/strcat.h"
#include "base/values.h"

namespace rail {

namespace {

constexpr char kDefaultFolderName[] = "Folder";

std::string EscapedDir(const std::string& dir) {
  std::string escaped;
  for (const char c : dir) {
    const bool alnum = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                       (c >= '0' && c <= '9');
    if (alnum) {
      escaped.push_back(c);
    } else {
      escaped += base::StringPrintf("%%%02X", static_cast<unsigned char>(c));
    }
  }
  return escaped;
}

}

std::optional<base::Value> ReadJsonFile(const base::FilePath& path) {
  std::string text;
  if (!base::ReadFileToString(path, &text)) {
    return std::nullopt;
  }
  return base::JSONReader::Read(text, base::JSON_PARSE_RFC);
}

std::string ImportId(const std::string& source_id,
                     const std::string& dir,
                     const std::string& key) {
  return base::StrCat({source_id, "-", EscapedDir(dir), "-", key});
}

bool IsImportedId(const SidebarInput& input, const std::string& id) {
  return input.imported.contains(id);
}

bool HasRows(const SpaceRows& rows) {
  return !rows.pinned.empty() || !rows.folders.empty() ||
         !rows.tidy_groups.empty() || !rows.tabs.empty();
}

base::DictValue PinEntry(const std::string& id,
                         const std::string& url,
                         const std::string& title,
                         const std::string& favicon,
                         const std::string& folder) {
  base::DictValue pin;
  pin.Set("id", id);
  pin.Set("home", url);
  pin.Set("homeTitle", title);
  pin.Set("homeFavicon", favicon);
  pin.Set("url", url);
  pin.Set("title", title);
  pin.Set("favicon", favicon);
  pin.Set("folder", folder);
  return pin;
}

base::DictValue FolderEntry(const std::string& id,
                            const std::string& name,
                            const std::string& after,
                            const std::string& parent) {
  base::DictValue folder;
  folder.Set("id", id);
  folder.Set("name", name.empty() ? kDefaultFolderName : name);
  folder.Set("expanded", true);
  folder.Set("after", after);
  if (!parent.empty()) {
    folder.Set("parent", parent);
  }
  return folder;
}

base::DictValue SpaceEntry(const SpaceInfo& info, SpaceRows rows) {
  base::DictValue entry;
  entry.Set("id", info.id);
  entry.Set("name", info.name);
  entry.Set("color", info.color);
  entry.Set("icon", info.icon);
  entry.Set("profile", info.profile);
  entry.Set("activeUrl", std::string());
  entry.Set("pinned", std::move(rows.pinned));
  entry.Set("folders", std::move(rows.folders));
  entry.Set("tidyGroups", std::move(rows.tidy_groups));
  entry.Set("tabs", std::move(rows.tabs));
  return entry;
}

}
