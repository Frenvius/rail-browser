#include "chrome/browser/ui/webui_browser/rail/rail_tab_audio.h"

#include <optional>
#include <string>

#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_enums.h"
#include "chrome/browser/ui/tabs/tab_muted_utils.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"

namespace rail {

namespace {

content::WebContents* ContentsOf(BrowserWindowInterface* browser,
                                 const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return nullptr;
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  if (!tab || browser->GetTabStripModel()->GetIndexOfTab(tab) ==
                  TabStripModel::kNoTab) {
    return nullptr;
  }
  return tab->GetContents();
}

}

bool ToggleTabMuted(BrowserWindowInterface* browser,
                    const tabs_api::NodeId& tab_id) {
  content::WebContents* contents = ContentsOf(browser, tab_id);
  if (!contents) {
    return false;
  }
  SetTabAudioMuted(contents, !contents->IsAudioMuted(),
                   TabMutedReason::kAudioIndicator, std::string());
  return contents->IsAudioMuted();
}

bool IsTabMuted(BrowserWindowInterface* browser,
                const tabs_api::NodeId& tab_id) {
  content::WebContents* contents = ContentsOf(browser, tab_id);
  return contents && contents->IsAudioMuted();
}

}
