#include "chrome/browser/ui/webui_browser/rail/rail_docked_devtools.h"

#include "chrome/browser/devtools/devtools_window.h"
#include "components/guest_contents/browser/guest_contents_handle.h"
#include "content/public/browser/web_contents.h"

namespace rail {

void DetachDockedDevTools(content::WebContents* shell) {
  for (content::WebContents* inner : shell->GetInnerWebContents()) {
    if (!DevToolsWindow::IsDevToolsWindow(inner)) {
      continue;
    }
    if (auto* handle =
            guest_contents::GuestContentsHandle::FromWebContents(inner)) {
      handle->DetachFromOuterWebContents();
    }
  }
}

}
