#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_SOURCES_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_SOURCES_H_

#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"

namespace rail {

struct ImportSourceSpec {
  std::string id;
  std::string name;
  base::FilePath root;
  base::FilePath sidebar_root;
  base::FilePath::StringType exe;
  base::FilePath::StringType install_dir;
  base::FilePath::StringType package_family;
  bool single_profile = false;
  bool bookmarks = false;
};

struct SourceProfile {
  std::string dir;
  std::string name;
  base::FilePath path;
};

std::vector<ImportSourceSpec> ImportSourceSpecs();

std::optional<ImportSourceSpec> FindImportSource(const std::string& id);

bool SourceInstalled(const ImportSourceSpec& spec);

bool SourceRunning(const ImportSourceSpec& spec);

std::string ExecutablePath(const ImportSourceSpec& spec);

std::string PackagedIconDataUrl(const ImportSourceSpec& spec);

std::vector<SourceProfile> SourceProfiles(const ImportSourceSpec& spec);

}

#endif
