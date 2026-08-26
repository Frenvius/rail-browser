#include "chrome/browser/ui/webui_browser/rail/rail_tab_transfer.h"

#include <algorithm>
#include <optional>
#include <vector>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "ui/base/base_window.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"

namespace rail {

BrowserWindowInterface* WindowUnderPoint(Browser* source,
                                         const gfx::Point& screen_point) {
  BrowserWindowInterface* found = nullptr;
  ProfileBrowserCollection::GetForProfile(source->profile())
      ->ForEach(
          [&](BrowserWindowInterface* browser) {
            if (browser == source) {
              return true;
            }
            ui::BaseWindow* window = browser->GetWindow();
            if (window && window->IsVisible() && !window->IsMinimized() &&
                window->GetBounds().Contains(screen_point)) {
              found = browser;
              return false;
            }
            return true;
          },
          BrowserCollection::Order::kActivation);
  return found;
}

void DropActiveTabAtScreenPoint(Browser* source,
                                const gfx::Point& screen_point) {
  if (!source) {
    return;
  }
  const int index = source->tab_strip_model()->active_index();
  if (index == TabStripModel::kNoTab) {
    return;
  }
  const std::vector<int> indices = {index};
  if (BrowserWindowInterface* target = WindowUnderPoint(source, screen_point)) {
    chrome::MoveTabsToExistingWindow(source, target, indices);
    return;
  }

  if (source->tab_strip_model()->count() < 2) {
    return;
  }

  const gfx::Rect from = source->GetWindow()->GetBounds();
  chrome::MoveTabsToNewWindow(source, indices);

  BrowserWindowInterface* created =
      ProfileBrowserCollection::GetForProfile(source->profile())
          ->GetLastActiveBrowser();
  if (created && created != source) {
    created->GetWindow()->SetBounds(
        gfx::Rect(screen_point, from.size()));
  }
}

bool MoveTabsToNewWindow(Browser* source,
                         const std::vector<tabs_api::NodeId>& ids) {
  if (!source) {
    return false;
  }
  TabStripModel* model = source->tab_strip_model();
  std::vector<int> indices;
  for (const tabs_api::NodeId& id : ids) {
    std::optional<tabs::TabHandle> handle = id.ToTabHandle();
    tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
    const int index = tab ? model->GetIndexOfTab(tab) : TabStripModel::kNoTab;
    if (index != TabStripModel::kNoTab) {
      indices.push_back(index);
    }
  }
  if (indices.empty() ||
      indices.size() >= static_cast<size_t>(model->count())) {
    return false;
  }
  std::sort(indices.begin(), indices.end());
  chrome::MoveTabsToNewWindow(source, indices);
  return true;
}

}
