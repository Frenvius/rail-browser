#include "chrome/browser/ui/webui_browser/rail/rail_import_bookmarks.h"

#include <optional>
#include <string>
#include <utility>

#include "base/values.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr char kBarKey[] = "bookmark_bar";
constexpr char kOtherKey[] = "other";
constexpr char kSyncedKey[] = "synced";
constexpr char kSpaceKey[] = "bookmarks";
constexpr char kOtherName[] = "Other bookmarks";
constexpr char kSyncedName[] = "Mobile bookmarks";

struct BookmarkWalk {
  const BookmarkSpaceSource& source;
  const SidebarInput& input;
  SpaceRows rows;
  std::string pinned_above;
  int bookmarks = 0;
};

std::optional<std::string> ImportableUrl(const base::DictValue& node) {
  const std::string* url = node.FindString("url");
  if (!url) {
    return std::nullopt;
  }
  const GURL parsed(*url);
  if (!parsed.is_valid() || !parsed.SchemeIsHTTPOrHTTPS()) {
    return std::nullopt;
  }
  return parsed.spec();
}

std::optional<std::string> KeyOf(const base::DictValue& node) {
  const std::string* guid = node.FindString("guid");
  if (!guid || guid->empty()) {
    return std::nullopt;
  }
  return *guid;
}

bool IsUrlNode(const base::DictValue& node) {
  return node.contains("url");
}

bool HasUrls(const base::DictValue& node) {
  const base::ListValue* children = node.FindList("children");
  if (!children) {
    return false;
  }
  for (const base::Value& child : *children) {
    const base::DictValue* entry = child.GetIfDict();
    if (entry && (IsUrlNode(*entry) || HasUrls(*entry))) {
      return true;
    }
  }
  return false;
}

void AddPin(BookmarkWalk& walk,
            const base::DictValue& node,
            const std::string& folder) {
  const std::optional<std::string> key = KeyOf(node);
  const std::optional<std::string> url = ImportableUrl(node);
  if (!key || !url) {
    return;
  }
  const std::string id = ImportId(walk.source.source_id, walk.source.dir, *key);
  if (IsImportedId(walk.input, id)) {
    return;
  }
  const std::string* name = node.FindString("name");
  const std::string title = name && !name->empty() ? *name : *url;
  walk.rows.pinned.Append(PinEntry(id, *url, title, std::string(), folder));
  ++walk.bookmarks;
  if (folder.empty()) {
    walk.pinned_above = id;
  }
}

void CollectPins(BookmarkWalk& walk,
                 const base::DictValue& node,
                 const std::string& folder) {
  const base::ListValue* children = node.FindList("children");
  if (!children) {
    return;
  }
  for (const base::Value& child : *children) {
    const base::DictValue* entry = child.GetIfDict();
    if (!entry) {
      continue;
    }
    if (IsUrlNode(*entry)) {
      AddPin(walk, *entry, folder);
    } else {
      CollectPins(walk, *entry, folder);
    }
  }
}

void AddFolder(BookmarkWalk& walk,
               const std::string& id,
               const std::string& name,
               const base::DictValue& node) {
  if (!IsImportedId(walk.input, id)) {
    walk.rows.folders.Append(FolderEntry(id, name, walk.pinned_above));
  }
  CollectPins(walk, node, id);
}

void AddBarItem(BookmarkWalk& walk, const base::DictValue& node) {
  if (IsUrlNode(node)) {
    AddPin(walk, node, std::string());
    return;
  }
  const std::optional<std::string> key = KeyOf(node);
  if (!key) {
    return;
  }
  const std::string* name = node.FindString("name");
  AddFolder(walk,
            ImportId(walk.source.source_id, walk.source.dir, *key),
            name ? *name : std::string(), node);
}

void AddRootFolder(BookmarkWalk& walk,
                   const base::DictValue& node,
                   const std::string& key,
                   const std::string& name) {
  if (!HasUrls(node)) {
    return;
  }
  AddFolder(walk, ImportId(walk.source.source_id, walk.source.dir, key), name,
            node);
}

}

void AddBookmarkSpace(const BookmarkSpaceSource& source,
                      const SidebarInput& input,
                      SidebarBuild& build) {
  const std::optional<base::Value> document = ReadJsonFile(source.file);
  const base::DictValue* top = document ? document->GetIfDict() : nullptr;
  const base::DictValue* roots = top ? top->FindDict("roots") : nullptr;
  if (!roots) {
    return;
  }
  const std::string space_id =
      ImportId(source.source_id, source.dir, kSpaceKey);
  const bool known = IsImportedId(input, space_id);

  BookmarkWalk walk{source, input, {}, {}, 0};
  if (const base::DictValue* bar = roots->FindDict(kBarKey)) {
    if (const base::ListValue* children = bar->FindList("children")) {
      for (const base::Value& child : *children) {
        if (const base::DictValue* entry = child.GetIfDict()) {
          AddBarItem(walk, *entry);
        }
      }
    }
  }
  if (const base::DictValue* other = roots->FindDict(kOtherKey)) {
    AddRootFolder(walk, *other, kOtherKey, kOtherName);
  }
  if (const base::DictValue* synced = roots->FindDict(kSyncedKey)) {
    AddRootFolder(walk, *synced, kSyncedKey, kSyncedName);
  }

  if (!HasRows(walk.rows)) {
    return;
  }
  build.spaces.Append(SpaceEntry(
      SpaceInfo{
          .id = space_id,
          .name = source.name,
          .profile = source.dir,
      },
      std::move(walk.rows)));
  ImportCounts& counts = build.counts[source.dir];
  counts.bookmarks += walk.bookmarks;
  if (known) {
    build.known_spaces.push_back(space_id);
    return;
  }
  ++counts.spaces;
}

}
