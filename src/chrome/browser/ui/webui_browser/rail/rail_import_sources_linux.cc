#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"

#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/environment.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/nix/xdg_util.h"
#include "base/process/process_handle.h"
#include "base/process/process_iterator.h"
#include "base/values.h"

namespace rail {
namespace {

base::FilePath ConfigRoot() {
  std::unique_ptr<base::Environment> env = base::Environment::Create();
  return base::nix::GetXDGDirectory(env.get(), base::nix::kXdgConfigHomeEnvVar,
                                    base::nix::kDotConfigDir);
}

base::FilePath InstallDir(const ImportSourceSpec& spec) {
  return base::FilePath(spec.install_dir);
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
  const base::FilePath config = ConfigRoot();
  return {
      {.id = "chrome", .name = "Chrome",
       .root = config.AppendASCII("google-chrome"),
       .exe = "chrome", .install_dir = "/opt/google/chrome",
       .bookmarks = true},
      {.id = "edge", .name = "Edge",
       .root = config.AppendASCII("microsoft-edge"),
       .exe = "msedge", .install_dir = "/opt/microsoft/msedge",
       .bookmarks = true},
      {.id = "brave", .name = "Brave",
       .root = config.AppendASCII("BraveSoftware").AppendASCII("Brave-Browser"),
       .exe = "brave", .install_dir = "/opt/brave.com/brave",
       .bookmarks = true},
      {.id = "vivaldi", .name = "Vivaldi",
       .root = config.AppendASCII("vivaldi"),
       .exe = "vivaldi-bin", .install_dir = "/opt/vivaldi",
       .bookmarks = true},
      {.id = "opera", .name = "Opera",
       .root = config.AppendASCII("opera"),
       .exe = "opera", .install_dir = "/usr/lib/x86_64-linux-gnu/opera-stable",
       .bookmarks = true},
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
  const base::FilePath install = InstallDir(spec);
  base::NamedProcessIterator processes(spec.exe, nullptr);
  while (const base::ProcessEntry* entry = processes.NextProcessEntry()) {
    if (install.IsParent(base::GetProcessExecutablePath(entry->pid()))) {
      return true;
    }
  }
  return false;
}

std::string ExecutablePath(const ImportSourceSpec& spec) {
  const base::FilePath candidate = InstallDir(spec).Append(spec.exe);
  return base::PathExists(candidate) ? candidate.value() : std::string();
}

std::string PackagedIconDataUrl(const ImportSourceSpec& spec) {
  std::string png;
  if (!base::ReadFileToString(
          InstallDir(spec).AppendASCII("product_logo_64.png"), &png)) {
    return {};
  }
  return "data:image/png;base64," + base::Base64Encode(png);
}

std::vector<SourceProfile> SourceProfiles(const ImportSourceSpec& spec) {
  if (spec.single_profile) {
    return {{.dir = "Default", .name = spec.name, .path = spec.root}};
  }
  return InfoCacheProfiles(spec.root);
}

}
