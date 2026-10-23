#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_

#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "chrome/browser/resource_coordinator/lifecycle_unit_observer.h"
#include "components/browser_apis/tab_strip/types/node_id.h"

class BrowserWindowInterface;

namespace rail {

bool SleepTab(BrowserWindowInterface* browser, const tabs_api::NodeId& tab_id);

std::vector<tabs_api::NodeId> SleepingTabs(BrowserWindowInterface* browser);

class TabDiscardWatcher : public resource_coordinator::LifecycleUnitObserver {
 public:
  using Callback = base::RepeatingCallback<void(const tabs_api::NodeId&)>;

  TabDiscardWatcher(BrowserWindowInterface* browser, Callback on_discarded);
  TabDiscardWatcher(const TabDiscardWatcher&) = delete;
  TabDiscardWatcher& operator=(const TabDiscardWatcher&) = delete;
  ~TabDiscardWatcher() override;

  void OnLifecycleUnitStateChanged(
      resource_coordinator::LifecycleUnit* lifecycle_unit,
      resource_coordinator::LifecycleUnitState last_state) override;

 private:
  raw_ptr<BrowserWindowInterface> browser_;
  Callback on_discarded_;
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_SLEEP_H_
