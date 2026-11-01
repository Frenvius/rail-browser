#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"

#import <AppKit/AppKit.h>

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "base/apple/foundation_util.h"
#include "base/base64.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/process/process_iterator.h"
#include "base/values.h"
#include "ui/gfx/codec/png_codec.h"
#include "ui/gfx/image/image_skia.h"
#include "ui/gfx/image/image_skia_rep.h"
#include "ui/gfx/image/image_skia_util_mac.h"

namespace rail {
namespace {

base::FilePath SupportRoot() {
  return base::apple::GetUserLibraryPath().AppendASCII("Application Support");
}

std::vector<SourceProfile> InfoCacheProfiles(const base::FilePath& root) {
  std::string text;
  if (!base::ReadFileToString(root.AppendASCII("Local State"), &text)) {
    return {};
  }
  const std::optional<base::DictValue> state =
      base::JSONReader::ReadDict(text, base::JSON_PARSE_RFC);
  const base::DictValue* cache =
      state ? state->FindDictByDottedPath("profile.info_cache") : nullptr;
  if (!cache) {
    return {};
  }
  std::vector<SourceProfile> profiles;
  for (const auto [dir, entry] : *cache) {
    const base::DictValue* info = entry.GetIfDict();
    const std::string* name = info ? info->FindString("name") : nullptr;
    const base::FilePath path = root.AppendASCII(dir);
    if (base::DirectoryExists(path)) {
      profiles.push_back({.dir = dir,
                          .name = name && !name->empty() ? *name : dir,
                          .path = path});
    }
  }
  return profiles;
}

}

std::vector<ImportSourceSpec> ImportSourceSpecs() {
  const base::FilePath support = SupportRoot();
  const base::FilePath arc = support.AppendASCII("Arc");
  return {
      {.id = "arc", .name = "Arc", .root = arc.AppendASCII("User Data"),
       .sidebar_root = arc, .exe = FILE_PATH_LITERAL("Arc"),
       .install_dir = FILE_PATH_LITERAL("Arc.app/Contents/MacOS")},
      {.id = "chrome", .name = "Chrome",
       .root = support.AppendASCII("Google").AppendASCII("Chrome"),
       .exe = FILE_PATH_LITERAL("Google Chrome"),
       .install_dir = FILE_PATH_LITERAL("Google Chrome.app/Contents/MacOS"),
       .bookmarks = true},
      {.id = "edge", .name = "Edge",
       .root = support.AppendASCII("Microsoft Edge"),
       .exe = FILE_PATH_LITERAL("Microsoft Edge"),
       .install_dir = FILE_PATH_LITERAL("Microsoft Edge.app/Contents/MacOS"),
       .bookmarks = true},
      {.id = "brave", .name = "Brave",
       .root = support.AppendASCII("BraveSoftware").AppendASCII("Brave-Browser"),
       .exe = FILE_PATH_LITERAL("Brave Browser"),
       .install_dir = FILE_PATH_LITERAL("Brave Browser.app/Contents/MacOS"),
       .bookmarks = true},
      {.id = "vivaldi", .name = "Vivaldi",
       .root = support.AppendASCII("Vivaldi"),
       .exe = FILE_PATH_LITERAL("Vivaldi"),
       .install_dir = FILE_PATH_LITERAL("Vivaldi.app/Contents/MacOS"),
       .bookmarks = true},
      {.id = "opera", .name = "Opera",
       .root = support.AppendASCII("com.operasoftware.Opera"),
       .exe = FILE_PATH_LITERAL("Opera"),
       .install_dir = FILE_PATH_LITERAL("Opera.app/Contents/MacOS"),
       .single_profile = true, .bookmarks = true},
  };
}

std::optional<ImportSourceSpec> FindImportSource(const std::string& id) {
  for (ImportSourceSpec& spec : ImportSourceSpecs()) {
    if (spec.id == id) {
      return std::move(spec);
    }
  }
  return std::nullopt;
}

bool SourceInstalled(const ImportSourceSpec& spec) {
  return base::PathExists(spec.root.AppendASCII("Local State"));
}

bool SourceRunning(const ImportSourceSpec& spec) {
  base::NamedProcessIterator processes(spec.exe, nullptr);
  return processes.NextProcessEntry() != nullptr;
}

std::string ExecutablePath(const ImportSourceSpec& spec) {
  const base::FilePath relative =
      base::FilePath(spec.install_dir).Append(spec.exe);
  for (const base::FilePath& root : {
           base::FilePath(FILE_PATH_LITERAL("/Applications")),
           base::apple::GetUserLibraryPath().DirName().AppendASCII("Applications")}) {
    const base::FilePath candidate = root.Append(relative);
    if (base::PathExists(candidate)) {
      return candidate.AsUTF8Unsafe();
    }
  }
  return {};
}

std::string PackagedIconDataUrl(const ImportSourceSpec& spec) {
  const std::string path = ExecutablePath(spec);
  if (path.empty()) {
    return {};
  }
  const base::FilePath bundle = base::FilePath::FromUTF8Unsafe(path)
                                    .DirName()
                                    .DirName()
                                    .DirName();
  NSImage* image = [NSWorkspace.sharedWorkspace
      iconForFile:base::apple::FilePathToNSString(bundle)];
  gfx::ImageSkia icon =
      gfx::ImageSkiaFromResizedNSImage(image, NSMakeSize(64, 64));
  if (icon.isNull()) {
    return {};
  }
  std::optional<std::vector<uint8_t>> png = gfx::PNGCodec::EncodeBGRASkBitmap(
      icon.GetRepresentation(1.0f).GetBitmap(), false);
  return png ? "data:image/png;base64," + base::Base64Encode(*png)
             : std::string();
}

std::vector<SourceProfile> SourceProfiles(const ImportSourceSpec& spec) {
  if (spec.single_profile) {
    return {{.dir = "Default", .name = spec.name, .path = spec.root}};
  }
  return InfoCacheProfiles(spec.root);
}

}
