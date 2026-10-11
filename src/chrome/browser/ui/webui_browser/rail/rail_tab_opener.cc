#include "chrome/browser/ui/webui_browser/rail/rail_tab_opener.h"

#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_delegate.h"
#include "ui/base/page_transition_types.h"

namespace rail {

std::optional<tabs_api::NodeId> OpenerOfTab(Browser* browser,
                                            const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return std::nullopt;
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  if (!tab) {
    return std::nullopt;
  }
  TabStripModel* model = browser->tab_strip_model();
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

void ForgetOpeners(Browser* browser,
                   const std::vector<tabs_api::NodeId>& tab_ids) {
  if (!browser) {
    return;
  }
  TabStripModel* model = browser->tab_strip_model();
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
    Browser* browser) {
  std::vector<std::pair<tabs_api::NodeId, tabs_api::NodeId>> openers;
  if (!browser) {
    return openers;
  }
  TabStripModel* model = browser->tab_strip_model();
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
    Browser* browser,
    const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)> navigation_callback) {
  content::WebContents* source =
      params.disposition == WindowOpenDisposition::CURRENT_TAB
          ? browser->tab_strip_model()->GetActiveWebContents()
          : nullptr;
  return static_cast<content::WebContentsDelegate*>(browser)->OpenURLFromTab(
      source, params, std::move(navigation_callback));
}

}
