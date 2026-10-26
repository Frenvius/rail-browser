#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_EXTENSIONS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_EXTENSIONS_H_

#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/values.h"

class Profile;

namespace rail {

struct ArcExtension {
  std::string id;
  std::string name;
  bool enabled = true;
  base::DictValue manifest;
};

struct ArcExtensionScan {
  std::vector<ArcExtension> installable;
  std::vector<std::string> skipped;
};

struct ArcExtensionResult {
  std::vector<std::string> installed;
  std::vector<std::string> present;
  std::vector<std::string> skipped;
  std::vector<std::string> failed;
};

using ArcExtensionInstallCallback =
    base::OnceCallback<void(ArcExtensionResult result)>;

ArcExtensionScan ReadArcExtensions(const base::FilePath& profile_dir);

void InstallArcExtensions(Profile* profile,
                          ArcExtensionScan scan,
                          ArcExtensionInstallCallback callback);

}

#endif
