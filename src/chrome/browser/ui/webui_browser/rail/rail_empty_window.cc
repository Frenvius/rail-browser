#include "chrome/browser/ui/webui_browser/rail/rail_empty_window.h"

#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"

namespace rail {

bool KeepsWindowOpenWhenEmpty(Browser* browser) {
  return browser->is_type_normal() &&
         WebUIBrowserWindow::FromBrowser(browser) != nullptr;
}

}
