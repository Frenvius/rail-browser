#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_MOJO_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_MOJO_H_

#include <vector>

#include "chrome/browser/ui/webui_browser/rail/rail_import.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import.mojom.h"
#include "mojo/public/cpp/bindings/shared_remote.h"

namespace rail {

std::vector<rail_import::mojom::ImportSourcePtr> ToMojoSources(
    const std::vector<ImportSourceInfo>& sources);

rail_import::mojom::ImportSummaryPtr ToMojoSummary(ImportSummary summary);

ImportEventCallback ForwardImportEvents(
    mojo::SharedRemote<rail_import::mojom::ImportObserver> observer);

ImportSummaryCallback ForwardImportSummary(
    mojo::SharedRemote<rail_import::mojom::ImportObserver> observer);

}

#endif
