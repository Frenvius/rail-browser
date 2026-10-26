#include "chrome/browser/ui/webui_browser/rail/rail_arc_extensions.h"

#include <memory>
#include <optional>
#include <string>
#include <utility>

#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/location.h"
#include "base/memory/ref_counted.h"
#include "base/memory/weak_ptr.h"
#include "base/one_shot_event.h"
#include "base/strings/string_util.h"
#include "base/strings/strcat.h"
#include "chrome/browser/profiles/profile.h"
#include "components/crx_file/id_util.h"
#include "content/public/browser/browser_thread.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/disable_reason.h"
#include "extensions/browser/extension_registrar.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/browser/extension_system.h"
#include "extensions/browser/install_approval.h"
#include "extensions/browser/webstore_installer.h"
#include "extensions/common/mojom/manifest.mojom-shared.h"
#include "mojo/public/cpp/bindings/callback_helpers.h"

namespace rail {

namespace {

using extensions::mojom::ManifestLocation;

constexpr char kArcSecurePreferences[] = "Secure Preferences";
constexpr char kUblockOriginRail[] = "fkgkibajhfbepljeaefdnfnegdcjomkh";
constexpr char kUblockOriginStore[] = "cjpalhdlnbpafiamejdnhcphjbkeiagm";
constexpr char kUblockLiteStore[] = "ddkjiahejlhfcafbddmgiahcphecmpfh";
constexpr char kInstallDidNotFinish[] = "Web Store install did not finish";

bool IsRailProvided(const std::string& id) {
  return id == kUblockOriginRail || id == kUblockOriginStore ||
         id == kUblockLiteStore;
}

std::string NameOf(const std::string& id, const base::DictValue& entry) {
  const base::DictValue* manifest = entry.FindDict("manifest");
  const std::string* name = manifest ? manifest->FindString("name") : nullptr;
  if (!name || name->empty() || base::StartsWith(*name, "__MSG_")) {
    return id;
  }
  return *name;
}

std::string SkipReasonOf(const std::string& id, const base::DictValue& entry) {
  if (!crx_file::id_util::IdIsValid(id)) {
    return "invalid id";
  }
  if (IsRailProvided(id)) {
    return "provided by Rail";
  }
  switch (static_cast<ManifestLocation>(
      entry.FindInt("location").value_or(0))) {
    case ManifestLocation::kInternal:
      break;
    case ManifestLocation::kUnpacked:
      return "unpacked";
    case ManifestLocation::kComponent:
      return "component";
    default:
      return "external";
  }
  if (!entry.FindBool("from_webstore").value_or(false)) {
    return "not from the Web Store";
  }
  if (!entry.FindDict("manifest")) {
    return "no manifest";
  }
  return std::string();
}

bool EnabledOf(const base::DictValue& entry) {
  return entry.FindInt("state").value_or(1) == 1 &&
         entry.FindInt("disable_reasons").value_or(0) == 0;
}

struct ArcExtensionBatch : public base::RefCounted<ArcExtensionBatch> {
  base::WeakPtr<Profile> profile;
  std::vector<ArcExtension> queue;
  ArcExtensionResult result;
  ArcExtensionInstallCallback callback;
  std::unique_ptr<content::WebContents> web_contents;
  scoped_refptr<extensions::WebstoreInstaller> installer;
};

void InstallNext(scoped_refptr<ArcExtensionBatch> batch);

void ContinueBatch(scoped_refptr<ArcExtensionBatch> batch) {
  content::GetUIThreadTaskRunner({})->PostTask(
      FROM_HERE, base::BindOnce(&InstallNext, std::move(batch)));
}

void FinishBatch(scoped_refptr<ArcExtensionBatch> batch) {
  batch->installer.reset();
  batch->web_contents.reset();
  std::move(batch->callback).Run(std::move(batch->result));
}

void OnArcExtensionInstalled(scoped_refptr<ArcExtensionBatch> batch,
                             ArcExtension extension,
                             const std::string& id) {
  if (!extension.enabled && batch->profile) {
    extensions::ExtensionRegistrar::Get(batch->profile.get())
        ->DisableExtension(
            id, {extensions::disable_reason::DISABLE_USER_ACTION});
  }
  batch->result.installed.push_back(extension.name);
  ContinueBatch(std::move(batch));
}

void OnArcExtensionFailed(scoped_refptr<ArcExtensionBatch> batch,
                          std::string name,
                          const std::string&,
                          const std::string& error,
                          extensions::WebstoreInstaller::FailureReason) {
  batch->result.failed.push_back(base::StrCat({name, " (", error, ")"}));
  ContinueBatch(std::move(batch));
}

void InstallNext(scoped_refptr<ArcExtensionBatch> batch) {
  if (batch->queue.empty() || !batch->profile) {
    FinishBatch(std::move(batch));
    return;
  }
  ArcExtension next = std::move(batch->queue.front());
  batch->queue.erase(batch->queue.begin());
  if (extensions::ExtensionRegistry::Get(batch->profile.get())
          ->GetInstalledExtension(next.id)) {
    batch->result.present.push_back(next.name);
    ContinueBatch(std::move(batch));
    return;
  }

  const std::string id = next.id;
  const std::string name = next.name;
  std::unique_ptr<extensions::InstallApproval> approval =
      extensions::InstallApproval::CreateWithNoInstallPrompt(
          batch->profile.get(), id, next.manifest.Clone(), false);
  approval->skip_post_install_ui = true;
  batch->installer = base::MakeRefCounted<extensions::WebstoreInstaller>(
      batch->profile.get(),
      base::BindOnce(&OnArcExtensionInstalled, batch, std::move(next)),
      base::BindOnce(&OnArcExtensionFailed, batch, name),
      batch->web_contents.get(), id, std::move(approval),
      extensions::WebstoreInstaller::INSTALL_SOURCE_OTHER);
  batch->installer->Start();
}

void StartBatch(base::WeakPtr<Profile> profile,
                ArcExtensionScan scan,
                ArcExtensionInstallCallback callback) {
  auto batch = base::MakeRefCounted<ArcExtensionBatch>();
  batch->profile = profile;
  batch->queue = std::move(scan.installable);
  batch->result.skipped = std::move(scan.skipped);
  batch->callback = std::move(callback);
  if (batch->queue.empty() || !profile) {
    FinishBatch(std::move(batch));
    return;
  }
  batch->web_contents = content::WebContents::Create(
      content::WebContents::CreateParams(profile.get()));
  InstallNext(std::move(batch));
}

}

ArcExtensionScan ReadArcExtensions(const base::FilePath& profile_dir) {
  ArcExtensionScan scan;
  std::string text;
  if (!base::ReadFileToString(profile_dir.AppendASCII(kArcSecurePreferences),
                              &text)) {
    return scan;
  }
  const std::optional<base::Value> prefs =
      base::JSONReader::Read(text, base::JSON_PARSE_RFC);
  const base::DictValue* top = prefs ? prefs->GetIfDict() : nullptr;
  const base::DictValue* settings =
      top ? top->FindDictByDottedPath("extensions.settings") : nullptr;
  if (!settings) {
    return scan;
  }
  for (const auto [id, value] : *settings) {
    const base::DictValue* entry = value.GetIfDict();
    if (!entry) {
      continue;
    }
    const std::string name = NameOf(id, *entry);
    const std::string reason = SkipReasonOf(id, *entry);
    if (!reason.empty()) {
      scan.skipped.push_back(base::StrCat({name, " (", reason, ")"}));
      continue;
    }
    scan.installable.push_back(ArcExtension{
        .id = id,
        .name = name,
        .enabled = EnabledOf(*entry),
        .manifest = entry->FindDict("manifest")->Clone(),
    });
  }
  return scan;
}

void InstallArcExtensions(Profile* profile,
                          ArcExtensionScan scan,
                          ArcExtensionInstallCallback callback) {
  extensions::ExtensionSystem::Get(profile)->ready().Post(
      FROM_HERE,
      base::BindOnce(
          &StartBatch, profile->GetWeakPtr(), std::move(scan),
          mojo::WrapCallbackWithDefaultInvokeIfNotRun(
              std::move(callback),
              ArcExtensionResult{.failed = {kInstallDidNotFinish}})));
}

}
