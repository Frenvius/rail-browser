#include "chrome/browser/ui/webui_browser/rail/rail_default_browser.h"

#include "base/functional/bind.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "chrome/browser/shell_integration.h"

namespace rail {

namespace {

void ReportState(base::OnceCallback<void(bool)> callback,
                 shell_integration::DefaultWebClientState state) {
  std::move(callback).Run(state == shell_integration::IS_DEFAULT);
}

}

void CheckIsDefaultBrowser(base::OnceCallback<void(bool)> callback) {
  base::MakeRefCounted<shell_integration::DefaultBrowserWorker>()
      ->StartCheckIsDefault(
          base::BindOnce(&ReportState, std::move(callback)));
}

void SetAsDefaultBrowser() {
  auto worker = base::MakeRefCounted<shell_integration::DefaultBrowserWorker>();
  worker->set_interactive_permitted(true);
  worker->StartSetAsDefault(shell_integration::DefaultWebClientWorkerCallback());
}

}
