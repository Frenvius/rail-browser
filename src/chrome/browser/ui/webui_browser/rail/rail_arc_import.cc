#include "chrome/browser/ui/webui_browser/rail/rail_arc_import.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/files/file_util.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/stringprintf.h"
#include "base/strings/strcat.h"
#include "base/values.h"
#include "third_party/boringssl/src/include/openssl/md5.h"

namespace rail {

namespace {

constexpr char kArcIdPrefix[] = "arc-";
constexpr char kArcDefaultSpaceName[] = "Space";
constexpr char kArcDefaultFolderName[] = "Folder";
constexpr char kArcUrlScheme[] = "arc://";
constexpr char kArcAccentPath[] =
    "customInfo.windowTheme.primaryColorPalette.midTone";
constexpr char kArcEmojiPath[] = "customInfo.iconType";
constexpr char kArcIconCacheDir[] = "SidebarItemsFaviconCache";
constexpr size_t kArcIconLimit = 8192;
constexpr char kArcTidyTopAnchor[] = "top";

struct ArcTree {
  std::map<std::string, const base::DictValue*> items;
  std::vector<std::pair<std::string, const base::DictValue*>> spaces;
  std::map<std::string, std::string> top_apps;
};

using Children = std::vector<std::pair<std::string, const base::DictValue*>>;

struct Walk {
  const ArcTree& tree;
  const SidebarInput& input;
  base::FilePath icon_dir;
};

struct SpaceBuild {
  SpaceRows rows;
  std::string pinned_above;
  std::string tidy_above = kArcTidyTopAnchor;
  std::set<std::string> visited_folders;
  int pin_count = 0;
  int tab_count = 0;
};

struct TabRow {
  std::string id;
  std::string url;
  std::string title;
  std::string favicon;
};

template <typename Visit>
void ForEachPair(const base::ListValue& list, Visit visit) {
  for (size_t index = 0; index + 1 < list.size(); index += 2) {
    visit(list[index], list[index + 1]);
  }
}

std::string StableId(const std::string& arc_id) {
  return base::StrCat({kArcIdPrefix, arc_id});
}

std::string IconDataUrl(const base::FilePath& icon_dir,
                        const std::string& arc_id) {
  std::array<uint8_t, MD5_DIGEST_LENGTH> digest;
  MD5(reinterpret_cast<const uint8_t*>(arc_id.data()), arc_id.size(),
      digest.data());
  std::string png;
  const base::FilePath file =
      icon_dir.AppendASCII(base::ToLowerASCII(base::HexEncode(digest)));
  if (!base::ReadFileToString(file, &png) || png.empty()) {
    return std::string();
  }
  std::string url =
      base::StrCat({"data:image/png;base64,", base::Base64Encode(png)});
  return url.size() > kArcIconLimit ? std::string() : url;
}

std::optional<std::string> ProfileDirOf(const base::DictValue& profile) {
  if (profile.contains("default")) {
    return std::string("Default");
  }
  const base::DictValue* custom = profile.FindDict("custom");
  const base::DictValue* inner = custom ? custom->FindDict("_0") : nullptr;
  const std::string* dir =
      inner ? inner->FindString("directoryBasename") : nullptr;
  if (!dir || dir->empty()) {
    return std::nullopt;
  }
  return *dir;
}

ArcTree IndexTree(const base::DictValue& sidebar) {
  ArcTree tree;
  const base::ListValue* containers = sidebar.FindList("containers");
  if (!containers) {
    return tree;
  }
  for (const base::Value& entry : *containers) {
    const base::DictValue* container = entry.GetIfDict();
    if (!container) {
      continue;
    }
    if (const base::ListValue* spaces = container->FindList("spaces")) {
      ForEachPair(*spaces, [&tree](const base::Value& key,
                                   const base::Value& value) {
        if (key.is_string() && value.is_dict()) {
          tree.spaces.emplace_back(key.GetString(), &value.GetDict());
        }
      });
    }
    if (const base::ListValue* items = container->FindList("items")) {
      ForEachPair(*items, [&tree](const base::Value& key,
                                  const base::Value& value) {
        if (key.is_string() && value.is_dict()) {
          tree.items.emplace(key.GetString(), &value.GetDict());
        }
      });
    }
    if (const base::ListValue* apps =
            container->FindList("topAppsContainerIDs")) {
      ForEachPair(*apps, [&tree](const base::Value& key,
                                 const base::Value& value) {
        const base::DictValue* profile = key.GetIfDict();
        const std::string* container_id = value.GetIfString();
        const std::optional<std::string> dir =
            profile ? ProfileDirOf(*profile) : std::nullopt;
        if (dir && container_id) {
          tree.top_apps.emplace(*container_id, *dir);
        }
      });
    }
  }
  return tree;
}

std::string ContainerOf(const base::DictValue& space, std::string_view kind) {
  std::string id;
  const base::ListValue* containers = space.FindList("newContainerIDs");
  if (!containers) {
    return id;
  }
  ForEachPair(*containers, [&id, kind](const base::Value& key,
                                       const base::Value& value) {
    const base::DictValue* type = key.GetIfDict();
    const std::string* container = value.GetIfString();
    if (type && container && type->contains(kind)) {
      id = *container;
    }
  });
  return id;
}

Children ChildrenOf(const ArcTree& tree, const std::string& id) {
  Children children;
  const auto found = tree.items.find(id);
  if (found == tree.items.end()) {
    return children;
  }
  const base::ListValue* ids = found->second->FindList("childrenIds");
  if (!ids) {
    return children;
  }
  for (const base::Value& child : *ids) {
    const std::string* child_id = child.GetIfString();
    if (!child_id) {
      continue;
    }
    const auto item = tree.items.find(*child_id);
    if (item != tree.items.end()) {
      children.emplace_back(*child_id, item->second);
    }
  }
  return children;
}

bool IsFolder(const base::DictValue& item) {
  const base::DictValue* data = item.FindDict("data");
  return data && data->contains("list");
}

std::string StringOr(const base::DictValue& dict,
                     std::string_view key,
                     std::string_view fallback) {
  const std::string* value = dict.FindString(key);
  return value && !value->empty() ? *value : std::string(fallback);
}

std::optional<TabRow> TabRowOf(const std::string& arc_id,
                               const base::DictValue& item) {
  const base::DictValue* data = item.FindDict("data");
  const base::DictValue* tab = data ? data->FindDict("tab") : nullptr;
  if (!tab) {
    return std::nullopt;
  }
  std::string url = StringOr(*tab, "savedURL", "");
  if (url.empty() || base::StartsWith(url, kArcUrlScheme)) {
    return std::nullopt;
  }
  std::string title = StringOr(*tab, "savedTitle", "");
  if (title.empty()) {
    title = StringOr(item, "title", url);
  }
  return TabRow{StableId(arc_id), std::move(url), std::move(title)};
}

bool WasImported(const Walk& walk, const std::string& arc_id) {
  return IsImportedId(walk.input, StableId(arc_id));
}

void AddPinnedTab(Walk& walk,
                  const std::string& arc_id,
                  const base::DictValue& item,
                  const std::string& folder,
                  SpaceBuild& build) {
  std::optional<TabRow> row = TabRowOf(arc_id, item);
  if (!row || WasImported(walk, arc_id)) {
    return;
  }
  row->favicon = IconDataUrl(walk.icon_dir, arc_id);
  build.rows.pinned.Append(PinEntry(row->id, row->url, row->title,
                                    row->favicon, folder));
  ++build.pin_count;
  build.pinned_above = row->id;
}

void AddPinnedFolder(Walk& walk,
                     const std::string& arc_id,
                     const base::DictValue& item,
                     const std::string& parent,
                     SpaceBuild& build) {
  if (!build.visited_folders.insert(arc_id).second) {
    return;
  }
  const std::string folder_id = StableId(arc_id);
  if (!WasImported(walk, arc_id)) {
    build.rows.folders.Append(FolderEntry(
        folder_id, StringOr(item, "title", kArcDefaultFolderName),
        build.pinned_above, parent));
  }
  for (const auto& [child_id, child] : ChildrenOf(walk.tree, arc_id)) {
    if (IsFolder(*child)) {
      AddPinnedFolder(walk, child_id, *child, folder_id, build);
    } else {
      AddPinnedTab(walk, child_id, *child, folder_id, build);
    }
  }
}

void AddTab(Walk& walk,
            const std::string& arc_id,
            const base::DictValue& item,
            const std::string& group,
            SpaceBuild& build) {
  std::optional<TabRow> row = TabRowOf(arc_id, item);
  if (!row || WasImported(walk, arc_id)) {
    return;
  }
  row->favicon = IconDataUrl(walk.icon_dir, arc_id);
  base::DictValue tab;
  tab.Set("id", row->id);
  tab.Set("url", row->url);
  tab.Set("title", row->title);
  tab.Set("favicon", row->favicon);
  tab.Set("group", group);
  build.rows.tabs.Append(std::move(tab));
  ++build.tab_count;
  build.tidy_above = row->id;
}

void CollectTidyTabs(Walk& walk,
                     const std::string& arc_id,
                     const std::string& group,
                     SpaceBuild& build) {
  if (!build.visited_folders.insert(arc_id).second) {
    return;
  }
  for (const auto& [child_id, child] : ChildrenOf(walk.tree, arc_id)) {
    if (IsFolder(*child)) {
      CollectTidyTabs(walk, child_id, group, build);
    } else {
      AddTab(walk, child_id, *child, group, build);
    }
  }
}

void AddTidyFolder(Walk& walk,
                   const std::string& arc_id,
                   const base::DictValue& item,
                   SpaceBuild& build) {
  if (build.visited_folders.contains(arc_id)) {
    return;
  }
  const std::string folder_id = StableId(arc_id);
  if (!WasImported(walk, arc_id)) {
    build.rows.tidy_groups.Append(FolderEntry(
        folder_id, StringOr(item, "title", kArcDefaultFolderName),
        build.tidy_above));
  }
  CollectTidyTabs(walk, arc_id, folder_id, build);
}

SpaceBuild BuildSpaceRows(Walk& walk, const base::DictValue& space) {
  SpaceBuild build;
  for (const auto& [arc_id, item] :
       ChildrenOf(walk.tree, ContainerOf(space, "pinned"))) {
    if (IsFolder(*item)) {
      AddPinnedFolder(walk, arc_id, *item, std::string(), build);
    } else {
      AddPinnedTab(walk, arc_id, *item, std::string(), build);
    }
  }
  for (const auto& [arc_id, item] :
       ChildrenOf(walk.tree, ContainerOf(space, "unpinned"))) {
    if (IsFolder(*item)) {
      AddTidyFolder(walk, arc_id, *item, build);
    } else {
      AddTab(walk, arc_id, *item, std::string(), build);
    }
  }
  return build;
}

int ToByte(double channel) {
  return std::clamp(static_cast<int>(std::lround(channel * 255)), 0, 255);
}

std::optional<double> ChannelOf(const base::DictValue& color,
                                std::string_view key) {
  const base::Value* value = color.Find(key);
  if (!value) {
    return std::nullopt;
  }
  if (value->is_int()) {
    return value->GetInt();
  }
  return value->GetIfDouble();
}

std::string AccentOf(const base::DictValue& space) {
  const base::DictValue* color = space.FindDictByDottedPath(kArcAccentPath);
  if (!color) {
    return std::string();
  }
  const std::optional<double> red = ChannelOf(*color, "red");
  const std::optional<double> green = ChannelOf(*color, "green");
  const std::optional<double> blue = ChannelOf(*color, "blue");
  if (!red || !green || !blue) {
    return std::string();
  }
  return base::StringPrintf("#%02x%02x%02x", ToByte(*red), ToByte(*green),
                            ToByte(*blue));
}

std::string EmojiOf(const base::DictValue& space) {
  const base::DictValue* icon = space.FindDictByDottedPath(kArcEmojiPath);
  const std::string* emoji = icon ? icon->FindString("emoji_v2") : nullptr;
  return emoji ? *emoji : std::string();
}

void AddSpace(Walk& walk,
              const std::string& arc_id,
              const base::DictValue& space,
              const std::string& profile_dir,
              SidebarBuild& build) {
  const std::string space_id = StableId(arc_id);
  const bool known = WasImported(walk, arc_id);
  SpaceBuild rows = BuildSpaceRows(walk, space);
  if (known && !HasRows(rows.rows)) {
    return;
  }
  build.spaces.Append(SpaceEntry(
      SpaceInfo{
          .id = space_id,
          .name = StringOr(space, "title", kArcDefaultSpaceName),
          .color = AccentOf(space),
          .icon = EmojiOf(space),
          .profile = profile_dir,
      },
      std::move(rows.rows)));
  ImportCounts& counts = build.counts[profile_dir];
  counts.pins += rows.pin_count;
  if (known) {
    build.known_spaces.push_back(space_id);
    return;
  }
  ++counts.spaces;
}

void AddFavorites(Walk& walk,
                  const std::string& container_id,
                  const std::string& profile_dir,
                  SidebarBuild& build) {
  base::ListValue& pins = build.favorites[profile_dir];
  for (const auto& [arc_id, item] : ChildrenOf(walk.tree, container_id)) {
    std::optional<TabRow> row = TabRowOf(arc_id, *item);
    if (!row || WasImported(walk, arc_id)) {
      continue;
    }
    row->favicon = IconDataUrl(walk.icon_dir, arc_id);
    pins.Append(PinEntry(row->id, row->url, row->title, row->favicon,
                         std::string()));
    ++build.counts[profile_dir].favorites;
  }
}

}

void AddArcSidebar(const base::FilePath& arc_root,
                   const SidebarInput& input,
                   SidebarBuild& build) {
  const std::optional<base::Value> document =
      ReadJsonFile(arc_root.AppendASCII("StorableSidebar.json"));
  const base::DictValue* top = document ? document->GetIfDict() : nullptr;
  const base::DictValue* sidebar = top ? top->FindDict("sidebar") : nullptr;
  if (!sidebar) {
    return;
  }

  const ArcTree tree = IndexTree(*sidebar);
  Walk walk{tree, input, arc_root.AppendASCII(kArcIconCacheDir)};
  for (const auto& [arc_id, space] : tree.spaces) {
    const base::DictValue* profile = space->FindDict("profile");
    const std::optional<std::string> dir =
        profile ? ProfileDirOf(*profile) : std::nullopt;
    if (dir && input.dirs.contains(*dir)) {
      AddSpace(walk, arc_id, *space, *dir, build);
    }
  }
  for (const auto& [container_id, dir] : tree.top_apps) {
    if (input.dirs.contains(dir)) {
      AddFavorites(walk, container_id, dir, build);
    }
  }
  std::erase_if(build.favorites, [](const auto& entry) {
    return entry.second.empty();
  });
}

}
