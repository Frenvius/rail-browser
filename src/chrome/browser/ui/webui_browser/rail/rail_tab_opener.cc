#include "chrome/browser/ui/webui_browser/rail/rail_tab_opener.h"

#include "chrome/browser/ui/browser_web_contents_delegate/browser_web_contents_delegate.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/page_transition_types.h"

namespace rail {

std::optional<tabs_api::NodeId> OpenerOfTab(BrowserWindowInterface* browser,
                                            const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return std::nullopt;
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  if (!tab) {
    return std::nullopt;
  }
  TabStripModel* model = browser->GetTabStripModel();
  const int index = model->GetIndexOfTab(tab);
  if (index == TabStripModel::kNoTab) {
    return std::nullopt;
  }
  tabs::TabInterface* opener = model->GetOpenerOfTabAt(index);
  if (!opener) {
    return std::nullopt;
  }
  return tabs_api::NodeId::FromTabHandle(opener->GetHandle());
}

bool OpenedFromLink(const tabs_api::NodeId& tab_id) {
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  if (!tab) {
    return false;
  }
  content::NavigationController& controller =
      tab->GetContents()->GetController();
  content::NavigationEntry* entry = controller.GetPendingEntry();
  if (!entry) {
    entry = controller.GetLastCommittedEntry();
  }
  return entry && ui::PageTransitionCoreTypeIs(entry->GetTransitionType(),
                                               ui::PAGE_TRANSITION_LINK);
}

void ForgetOpeners(BrowserWindowInterface* browser,
                   const std::vector<tabs_api::NodeId>& tab_ids) {
  if (!browser) {
    return;
  }
  TabStripModel* model = browser->GetTabStripModel();
  for (const tabs_api::NodeId& tab_id : tab_ids) {
    std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
    tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
    const int index = tab ? model->GetIndexOfTab(tab) : TabStripModel::kNoTab;
    if (index != TabStripModel::kNoTab) {
      model->SetOpenerOfTabAt(index, nullptr);
    }
  }
}

std::vector<std::pair<tabs_api::NodeId, tabs_api::NodeId>> OpenersOfTabs(
    BrowserWindowInterface* browser) {
  std::vector<std::pair<tabs_api::NodeId, tabs_api::NodeId>> openers;
  if (!browser) {
    return openers;
  }
  TabStripModel* model = browser->GetTabStripModel();
  for (int index = 0; index < model->count(); ++index) {
    tabs::TabInterface* tab = model->GetTabAtIndex(index);
    tabs::TabInterface* opener = model->GetOpenerOfTabAt(index);
    if (tab && opener) {
      openers.emplace_back(tabs_api::NodeId::FromTabHandle(tab->GetHandle()),
                           tabs_api::NodeId::FromTabHandle(opener->GetHandle()));
    }
  }
  return openers;
}

content::WebContents* OpenFromShell(
    BrowserWindowInterface* browser,
    const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)> navigation_callback) {
  content::WebContents* source =
      params.disposition == WindowOpenDisposition::CURRENT_TAB
          ? browser->GetTabStripModel()->GetActiveWebContents()
          : nullptr;
  return BrowserWebContentsDelegate::From(browser)->OpenURLFromTab(
      source, params, std::move(navigation_callback));
}

}
