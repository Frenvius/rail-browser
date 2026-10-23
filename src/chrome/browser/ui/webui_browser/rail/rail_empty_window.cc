#include "chrome/browser/ui/webui_browser/rail/rail_empty_window.h"

#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"

namespace rail {

bool KeepsWindowOpenWhenEmpty(BrowserWindowInterface* browser) {
  return browser->GetType() == BrowserWindowInterface::TYPE_NORMAL &&
         WebUIBrowserWindow::FromBrowser(browser) != nullptr;
}

}
