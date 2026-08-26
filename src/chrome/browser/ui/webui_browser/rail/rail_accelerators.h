#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACCELERATORS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACCELERATORS_H_

#include "chrome/browser/ui/webui_browser/browser.mojom.h"

namespace ui {
class Accelerator;
}

namespace rail {

// Runs the shell command bound to `accelerator`, if any. Shortcuts that only
// the shell knows about have no Chromium command id, so they never reach the
// window's accelerator table; they are matched here and forwarded to the WebUI
// by name. Returns whether the accelerator was consumed.
bool HandleRailAccelerator(const ui::Accelerator& accelerator,
                           webui_browser::mojom::Page* page);

bool IsCommandDisabledInShell(int command_id);

const char* RailCommandForBrowserCommand(int command_id);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACCELERATORS_H_
