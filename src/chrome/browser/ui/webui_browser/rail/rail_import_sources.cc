#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"

#include <windows.h>

#include <appmodel.h>

#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/base_paths.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/json/json_reader.h"
#include "base/path_service.h"
#include "base/process/process_iterator.h"
#include "base/strings/stringprintf.h"
#include "base/values.h"
#include "base/win/scoped_handle.h"

namespace rail {

namespace {

constexpr char kDefaultDir[] = "Default";

base::FilePath LocalAppData() {
  base::FilePath path;
  base::PathService::Get(base::DIR_LOCAL_APP_DATA, &path);
  return path;
}

base::FilePath RoamingAppData() {
  base::FilePath path;
  base::PathService::Get(base::DIR_ROAMING_APP_DATA, &path);
  return path;
}

base::FilePath ProgramDir(int key) {
  base::FilePath path;
  base::PathService::Get(key, &path);
  return path;
}

base::FilePath ArcRoot() {
  return LocalAppData()
      .AppendASCII("Packages")
      .AppendASCII("TheBrowserCompany.Arc_ttt1ap7aakyb4")
      .AppendASCII("LocalCache")
      .AppendASCII("Local")
      .AppendASCII("Arc");
}

base::FilePath ImagePathOf(base::ProcessId pid) {
  base::win::ScopedHandle process(
      ::OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid));
  if (!process.is_valid()) {
    return base::FilePath();
  }
  std::wstring buffer(MAX_PATH * 4, L'\0');
  DWORD size = static_cast<DWORD>(buffer.size());
  if (!::QueryFullProcessImageNameW(process.get(), 0, buffer.data(), &size)) {
    return base::FilePath();
  }
  buffer.resize(size);
  return base::FilePath(buffer);
}

base::FilePath PackageInstallPath(const base::FilePath::StringType& family) {
  UINT32 count = 0;
  UINT32 names_length = 0;
  if (::GetPackagesByPackageFamily(family.c_str(), &count, nullptr,
                                   &names_length, nullptr) !=
      ERROR_INSUFFICIENT_BUFFER) {
    return base::FilePath();
  }
  std::vector<PWSTR> full_names(count);
  std::vector<wchar_t> names(names_length);
  if (::GetPackagesByPackageFamily(family.c_str(), &count, full_names.data(),
                                   &names_length, names.data()) !=
      ERROR_SUCCESS) {
    return base::FilePath();
  }
  UINT32 path_length = 0;
  if (::GetPackagePathByFullName(full_names.front(), &path_length, nullptr) !=
      ERROR_INSUFFICIENT_BUFFER) {
    return base::FilePath();
  }
  std::vector<wchar_t> path(path_length);
  if (::GetPackagePathByFullName(full_names.front(), &path_length,
                                 path.data()) != ERROR_SUCCESS) {
    return base::FilePath();
  }
  return base::FilePath(path.data());
}

base::FilePath PackagedExecutable(const ImportSourceSpec& spec) {
  if (spec.package_family.empty()) {
    return base::FilePath();
  }
  const base::FilePath install = PackageInstallPath(spec.package_family);
  if (install.empty()) {
    return base::FilePath();
  }
  const base::FilePath exe = install.Append(spec.exe);
  return base::PathExists(exe) ? exe : base::FilePath();
}

constexpr size_t kMaxLogoBytes = 64 * 1024;
constexpr std::string_view kLogoAttribute = "Square44x44Logo=\"";
constexpr int kLogoSizes[] = {48, 36, 40, 60, 64, 72, 80, 96, 256, 32};

std::string ManifestLogo(const std::string& manifest) {
  const size_t begin = manifest.find(kLogoAttribute);
  if (begin == std::string::npos) {
    return std::string();
  }
  const size_t value = begin + kLogoAttribute.size();
  const size_t end = manifest.find('"', value);
  if (end == std::string::npos) {
    return std::string();
  }
  return manifest.substr(value, end - value);
}

std::optional<std::string> ReadLogo(const base::FilePath& path) {
  std::string png;
  if (!base::ReadFileToStringWithMaxSize(path, &png, kMaxLogoBytes)) {
    return std::nullopt;
  }
  return png;
}

std::optional<std::string> PackageLogo(const base::FilePath& install) {
  std::string manifest;
  if (!base::ReadFileToString(install.AppendASCII("AppxManifest.xml"),
                              &manifest)) {
    return std::nullopt;
  }
  const std::string logo = ManifestLogo(manifest);
  if (logo.empty()) {
    return std::nullopt;
  }
  const base::FilePath stem = install.AppendASCII(logo).RemoveFinalExtension();
  std::vector<base::FilePath> candidates;
  for (const int size : kLogoSizes) {
    candidates.push_back(stem.AddExtensionASCII(
        base::StringPrintf("targetsize-%d_altform-unplated.png", size)));
    candidates.push_back(
        stem.AddExtensionASCII(base::StringPrintf("targetsize-%d.png", size)));
  }
  candidates.push_back(install.AppendASCII(logo));
  for (const base::FilePath& candidate : candidates) {
    if (std::optional<std::string> png = ReadLogo(candidate)) {
      return png;
    }
  }
  return std::nullopt;
}

bool RunsOutsideRail(const base::FilePath::StringType& exe) {
  base::FilePath self;
  base::PathService::Get(base::FILE_EXE, &self);
  base::NamedProcessIterator processes(exe, nullptr);
  while (const base::ProcessEntry* entry = processes.NextProcessEntry()) {
    const base::FilePath image = ImagePathOf(entry->pid());
    if (image.empty() || image != self) {
      return true;
    }
  }
  return false;
}

std::optional<base::DictValue> ReadLocalState(const base::FilePath& root) {
  std::string text;
  if (!base::ReadFileToString(root.AppendASCII("Local State"), &text)) {
    return std::nullopt;
  }
  return base::JSONReader::ReadDict(text, base::JSON_PARSE_RFC);
}

std::vector<SourceProfile> InfoCacheProfiles(const base::FilePath& root) {
  std::vector<SourceProfile> profiles;
  const std::optional<base::DictValue> state = ReadLocalState(root);
  const base::DictValue* cache =
      state ? state->FindDictByDottedPath("profile.info_cache") : nullptr;
  if (!cache) {
    return profiles;
  }
  for (const auto [dir, entry] : *cache) {
    const base::DictValue* info = entry.GetIfDict();
    const std::string* name = info ? info->FindString("name") : nullptr;
    const base::FilePath path = root.AppendASCII(dir);
    if (!base::DirectoryExists(path)) {
      continue;
    }
    profiles.push_back(SourceProfile{
        .dir = dir,
        .name = name && !name->empty() ? *name : dir,
        .path = path,
    });
  }
  return profiles;
}

}

std::vector<ImportSourceSpec> ImportSourceSpecs() {
  const base::FilePath local = LocalAppData();
  const base::FilePath arc = ArcRoot();
  return {
      ImportSourceSpec{
          .id = "arc",
          .name = "Arc",
          .root = arc.AppendASCII("User Data"),
          .sidebar_root = arc,
          .exe = FILE_PATH_LITERAL("Arc.exe"),
          .install_dir = FILE_PATH_LITERAL("Microsoft\\WindowsApps"),
          .package_family =
              FILE_PATH_LITERAL("TheBrowserCompany.Arc_ttt1ap7aakyb4"),
      },
      ImportSourceSpec{
          .id = "chrome",
          .name = "Chrome",
          .root = local.AppendASCII("Google")
                      .AppendASCII("Chrome")
                      .AppendASCII("User Data"),
          .exe = FILE_PATH_LITERAL("chrome.exe"),
          .install_dir = FILE_PATH_LITERAL("Google\\Chrome\\Application"),
          .bookmarks = true,
      },
      ImportSourceSpec{
          .id = "edge",
          .name = "Edge",
          .root = local.AppendASCII("Microsoft")
                      .AppendASCII("Edge")
                      .AppendASCII("User Data"),
          .exe = FILE_PATH_LITERAL("msedge.exe"),
          .install_dir = FILE_PATH_LITERAL("Microsoft\\Edge\\Application"),
          .bookmarks = true,
      },
      ImportSourceSpec{
          .id = "brave",
          .name = "Brave",
          .root = local.AppendASCII("BraveSoftware")
                      .AppendASCII("Brave-Browser")
                      .AppendASCII("User Data"),
          .exe = FILE_PATH_LITERAL("brave.exe"),
          .install_dir =
              FILE_PATH_LITERAL("BraveSoftware\\Brave-Browser\\Application"),
          .bookmarks = true,
      },
      ImportSourceSpec{
          .id = "vivaldi",
          .name = "Vivaldi",
          .root = local.AppendASCII("Vivaldi").AppendASCII("User Data"),
          .exe = FILE_PATH_LITERAL("vivaldi.exe"),
          .install_dir = FILE_PATH_LITERAL("Vivaldi\\Application"),
          .bookmarks = true,
      },
      ImportSourceSpec{
          .id = "opera",
          .name = "Opera",
          .root = RoamingAppData()
                      .AppendASCII("Opera Software")
                      .AppendASCII("Opera Stable"),
          .exe = FILE_PATH_LITERAL("opera.exe"),
          .install_dir = FILE_PATH_LITERAL("Programs\\Opera"),
          .single_profile = true,
          .bookmarks = true,
      },
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
  return RunsOutsideRail(spec.exe);
}

std::string ExecutablePath(const ImportSourceSpec& spec) {
  const base::FilePath packaged = PackagedExecutable(spec);
  if (!packaged.empty()) {
    return packaged.AsUTF8Unsafe();
  }
  if (spec.install_dir.empty()) {
    return std::string();
  }
  const base::FilePath relative =
      base::FilePath(spec.install_dir).Append(spec.exe);
  const base::FilePath bases[] = {
      LocalAppData(),
      ProgramDir(base::DIR_PROGRAM_FILES),
      ProgramDir(base::DIR_PROGRAM_FILESX86),
  };
  for (const base::FilePath& base_dir : bases) {
    const base::FilePath candidate = base_dir.Append(relative);
    if (base::PathExists(candidate)) {
      return candidate.AsUTF8Unsafe();
    }
  }
  return std::string();
}

std::string PackagedIconDataUrl(const ImportSourceSpec& spec) {
  if (spec.package_family.empty()) {
    return std::string();
  }
  const base::FilePath install = PackageInstallPath(spec.package_family);
  if (install.empty()) {
    return std::string();
  }
  const std::optional<std::string> png = PackageLogo(install);
  if (!png) {
    return std::string();
  }
  return "data:image/png;base64," + base::Base64Encode(*png);
}

std::vector<SourceProfile> SourceProfiles(const ImportSourceSpec& spec) {
  if (spec.single_profile) {
    return {SourceProfile{
        .dir = kDefaultDir,
        .name = spec.name,
        .path = spec.root,
    }};
  }
  return InfoCacheProfiles(spec.root);
}

}
