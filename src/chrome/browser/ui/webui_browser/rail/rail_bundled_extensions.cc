#include "chrome/browser/ui/webui_browser/rail/rail_bundled_extensions.h"

#include <optional>
#include <string>
#include <utility>

#include "base/base_paths.h"
#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/location.h"
#include "base/memory/weak_ptr.h"
#include "base/one_shot_event.h"
#include "base/path_service.h"
#include "base/task/thread_pool.h"
#include "base/values.h"
#include "base/version.h"
#include "chrome/browser/profiles/profile.h"
#include "components/crx_file/id_util.h"
#include "extensions/browser/crx_file_info.h"
#include "extensions/browser/crx_installer.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/browser/extension_system.h"
#include "extensions/common/extension.h"
#include "extensions/common/mojom/manifest.mojom-shared.h"
#include "extensions/common/verifier_formats.h"

namespace rail {

namespace {

using extensions::mojom::ManifestLocation;

constexpr char kBundledDir[] = "default_apps";
constexpr char kBundledIndex[] = "external_extensions.json";
constexpr char kExternalCrx[] = "external_crx";
constexpr char kExternalVersion[] = "external_version";

std::optional<base::FilePath> BundledDir() {
  base::FilePath dir;
  if (!base::PathService::Get(base::DIR_EXE, &dir)) {
    return std::nullopt;
  }
  return dir.AppendASCII(kBundledDir);
}

std::optional<base::DictValue> ReadBundledIndex() {
  const std::optional<base::FilePath> dir = BundledDir();
  std::string text;
  if (!dir || !base::ReadFileToString(dir->AppendASCII(kBundledIndex), &text)) {
    return std::nullopt;
  }
  std::optional<base::Value> index =
      base::JSONReader::Read(text, base::JSON_PARSE_RFC);
  if (!index || !index->is_dict()) {
    return std::nullopt;
  }
  return std::move(*index).TakeDict();
}

void InstallBundled(base::WeakPtr<Profile> profile,
                    std::optional<base::DictValue> bundled) {
  const std::optional<base::FilePath> dir = BundledDir();
  if (!profile || !bundled || !dir) {
    return;
  }

  for (const auto [id, value] : *bundled) {
    const base::DictValue* entry = value.GetIfDict();
    const std::string* crx = entry ? entry->FindString(kExternalCrx) : nullptr;
    const std::string* version =
        entry ? entry->FindString(kExternalVersion) : nullptr;
    if (!crx || !version || !crx_file::id_util::IdIsValid(id) ||
        !base::Version(*version).IsValid() ||
        extensions::ExtensionRegistry::Get(profile.get())
            ->GetInstalledExtension(id)) {
      continue;
    }
    scoped_refptr<extensions::CrxInstaller> installer =
        extensions::CrxInstaller::CreateSilent(profile.get());
    installer->set_install_source(ManifestLocation::kInternal);
    installer->set_expected_id(id);
    installer->set_expected_version(base::Version(*version), true);
    installer->set_install_immediately(true);
    const int flags = extensions::Extension::FROM_WEBSTORE |
                      extensions::Extension::WAS_INSTALLED_BY_DEFAULT;
    installer->set_creation_flags(flags);
    installer->InstallCrxFile(extensions::CRXFileInfo(
        dir->AppendASCII(*crx), extensions::GetExternalVerifierFormat()));
  }
}

void ReadAndInstallBundled(base::WeakPtr<Profile> profile) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::BEST_EFFORT},
      base::BindOnce(&ReadBundledIndex),
      base::BindOnce(&InstallBundled, std::move(profile)));
}

}

void EnsureBundledExtensions(Profile* profile) {
  extensions::ExtensionSystem::Get(profile)->ready().Post(
      FROM_HERE, base::BindOnce(&ReadAndInstallBundled, profile->GetWeakPtr()));
}

}
