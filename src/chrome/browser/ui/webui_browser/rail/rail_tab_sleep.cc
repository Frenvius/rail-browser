#include "chrome/browser/ui/webui_browser/rail/rail_tab_sleep.h"

#include <utility>

#include "chrome/browser/resource_coordinator/lifecycle_unit.h"
#include "chrome/browser/resource_coordinator/lifecycle_unit_state.mojom.h"
#include "chrome/browser/resource_coordinator/tab_lifecycle_unit_external.h"
#include "chrome/browser/resource_coordinator/tab_lifecycle_unit_source.h"
#include "chrome/browser/resource_coordinator/utils.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"

namespace rail {

namespace {

resource_coordinator::TabLifecycleUnitExternal* LifecycleOf(
    tabs::TabInterface* tab) {
  if (!tab) {
    return nullptr;
  }
  return resource_coordinator::TabLifecycleUnitExternal::FromWebContents(
      tab->GetContents());
}

bool IsDiscarded(resource_coordinator::TabLifecycleUnitExternal* lifecycle) {
  return lifecycle &&
         lifecycle->GetTabState() == mojom::LifecycleUnitState::DISCARDED;
}

}

bool SleepTab(BrowserWindowInterface* browser, const tabs_api::NodeId& tab_id) {
  if (!browser) {
    return false;
  }
  std::optional<tabs::TabHandle> handle = tab_id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  TabStripModel* model = browser->GetTabStripModel();
  if (!tab || model->GetIndexOfTab(tab) == TabStripModel::kNoTab ||
      tab == model->GetActiveTab()) {
    return false;
  }
  resource_coordinator::TabLifecycleUnitExternal* lifecycle = LifecycleOf(tab);
  if (!lifecycle) {
    return false;
  }
  if (IsDiscarded(lifecycle)) {
    return true;
  }
  return lifecycle->DiscardTab(mojom::LifecycleUnitDiscardReason::PROACTIVE);
}

std::vector<tabs_api::NodeId> SleepingTabs(BrowserWindowInterface* browser) {
  std::vector<tabs_api::NodeId> sleeping;
  if (!browser) {
    return sleeping;
  }
  TabStripModel* model = browser->GetTabStripModel();
  for (int index = 0; index < model->count(); ++index) {
    tabs::TabInterface* tab = model->GetTabAtIndex(index);
    if (tab && IsDiscarded(LifecycleOf(tab))) {
      sleeping.push_back(tabs_api::NodeId::FromTabHandle(tab->GetHandle()));
    }
  }
  return sleeping;
}

TabDiscardWatcher::TabDiscardWatcher(BrowserWindowInterface* browser,
                                     Callback on_discarded)
    : browser_(browser), on_discarded_(std::move(on_discarded)) {
  resource_coordinator::GetTabLifecycleUnitSource()->AddLifecycleObserver(this);
}

TabDiscardWatcher::~TabDiscardWatcher() {
  resource_coordinator::GetTabLifecycleUnitSource()->RemoveLifecycleObserver(
      this);
}

void TabDiscardWatcher::OnLifecycleUnitStateChanged(
    resource_coordinator::LifecycleUnit* lifecycle_unit,
    resource_coordinator::LifecycleUnitState last_state) {
  if (lifecycle_unit->GetState() != mojom::LifecycleUnitState::DISCARDED ||
      last_state == mojom::LifecycleUnitState::DISCARDED) {
    return;
  }
  resource_coordinator::TabLifecycleUnitExternal* external =
      lifecycle_unit->AsTabLifecycleUnitExternal();
  tabs::TabInterface* tab =
      external ? tabs::TabInterface::MaybeGetFromContents(
                     external->GetWebContents())
               : nullptr;
  if (!tab || browser_->GetTabStripModel()->GetIndexOfTab(tab) ==
                  TabStripModel::kNoTab) {
    return;
  }
  on_discarded_.Run(tabs_api::NodeId::FromTabHandle(tab->GetHandle()));
}

}
