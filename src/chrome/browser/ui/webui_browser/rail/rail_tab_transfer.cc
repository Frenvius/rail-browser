#include "chrome/browser/ui/webui_browser/rail/rail_tab_transfer.h"

#include <algorithm>
#include <optional>
#include <vector>

#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/rail/rail_mini_window.h"
#include "components/sessions/core/session_id.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/base_window.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"

namespace rail {

namespace {

std::vector<int> IndicesForIds(TabStripModel* model,
                               const std::vector<tabs_api::NodeId>& ids) {
  std::vector<int> indices;
  for (const tabs_api::NodeId& id : ids) {
    std::optional<tabs::TabHandle> handle = id.ToTabHandle();
    tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
    const int index = tab ? model->GetIndexOfTab(tab) : TabStripModel::kNoTab;
    if (index != TabStripModel::kNoTab) {
      indices.push_back(index);
    }
  }
  std::sort(indices.begin(), indices.end());
  return indices;
}

std::u16string TitleOf(BrowserWindowInterface* browser) {
  tabs::TabInterface* tab = browser->GetActiveTabInterface();
  content::WebContents* contents = tab ? tab->GetContents() : nullptr;
  return contents ? contents->GetTitle() : std::u16string();
}

tabs::TabInterface* RemoteTab(Browser* caller, const tabs_api::NodeId& id) {
  std::optional<tabs::TabHandle> handle = id.ToTabHandle();
  tabs::TabInterface* tab = handle ? handle->Get() : nullptr;
  BrowserWindowInterface* owner =
      tab ? tab->GetBrowserWindowInterface() : nullptr;
  if (!caller || !owner || owner == caller ||
      owner->GetProfile() != caller->profile()) {
    return nullptr;
  }
  return tab;
}

}

BrowserWindowInterface* WindowUnderPoint(Browser* source,
                                         const gfx::Point& screen_point) {
  BrowserWindowInterface* found = nullptr;
  ProfileBrowserCollection::GetForProfile(source->profile())
      ->ForEach(
          [&](BrowserWindowInterface* browser) {
            if (browser == source) {
              return true;
            }
            if (IsMiniWindow(browser->GetBrowserForMigrationOnly())) {
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

void DropTabsAtScreenPoint(Browser* source,
                           const gfx::Point& screen_point,
                           const std::vector<tabs_api::NodeId>& ids) {
  if (!source) {
    return;
  }
  TabStripModel* model = source->tab_strip_model();
  const std::vector<int> indices = IndicesForIds(model, ids);
  if (indices.empty()) {
    return;
  }
  if (BrowserWindowInterface* target = WindowUnderPoint(source, screen_point)) {
    chrome::MoveTabsToExistingWindow(source, target, indices);
    return;
  }

  if (indices.size() >= static_cast<size_t>(model->count())) {
    return;
  }

  gfx::Rect bounds = MiniWindowBoundsNear(source);
  bounds.set_origin(screen_point);
  Browser* mini = CreateMiniWindow(source->profile(), bounds);
  if (!mini) {
    return;
  }
  chrome::MoveTabsToExistingWindow(source, mini, indices);
  mini->GetWindow()->Show();
}

bool MoveTabsToNewWindow(Browser* source,
                         const std::vector<tabs_api::NodeId>& ids) {
  if (!source) {
    return false;
  }
  TabStripModel* model = source->tab_strip_model();
  const std::vector<int> indices = IndicesForIds(model, ids);
  if (indices.empty() ||
      indices.size() >= static_cast<size_t>(model->count())) {
    return false;
  }
  chrome::MoveTabsToNewWindow(source, indices);
  return true;
}

bool MoveTabsToMiniWindow(Browser* source,
                          const std::vector<tabs_api::NodeId>& ids) {
  if (!source) {
    return false;
  }
  const std::vector<int> indices = IndicesForIds(source->tab_strip_model(), ids);
  if (indices.empty()) {
    return false;
  }
  Browser* mini =
      CreateMiniWindow(source->profile(), MiniWindowBoundsNear(source));
  if (!mini) {
    return false;
  }
  chrome::MoveTabsToExistingWindow(source, mini, indices);
  mini->GetWindow()->Show();
  return true;
}

std::vector<WindowEntry> OtherWindows(Browser* source) {
  std::vector<WindowEntry> entries;
  if (!source) {
    return entries;
  }
  ProfileBrowserCollection::GetForProfile(source->profile())
      ->ForEach(
          [&](BrowserWindowInterface* browser) {
            if (browser != source &&
                !IsMiniWindow(browser->GetBrowserForMigrationOnly())) {
              entries.push_back({browser->GetSessionID().id(),
                                 base::UTF16ToUTF8(TitleOf(browser))});
            }
            return true;
          },
          BrowserCollection::Order::kActivation);
  return entries;
}

bool MoveTabsToWindow(Browser* source,
                      int window_id,
                      const std::vector<tabs_api::NodeId>& ids) {
  BrowserWindowInterface* target =
      BrowserWindowInterface::FromSessionID(SessionID::FromSerializedValue(
          window_id));
  if (!source || !target || target == source) {
    return false;
  }
  const std::vector<int> indices =
      IndicesForIds(source->tab_strip_model(), ids);
  if (indices.empty()) {
    return false;
  }
  chrome::MoveTabsToExistingWindow(source, target, indices);
  return true;
}

bool TakeTab(Browser* target, const tabs_api::NodeId& id) {
  tabs::TabInterface* tab = RemoteTab(target, id);
  if (!tab) {
    return false;
  }
  Browser* source =
      tab->GetBrowserWindowInterface()->GetBrowserForMigrationOnly();
  const int index = source->tab_strip_model()->GetIndexOfTab(tab);
  if (index == TabStripModel::kNoTab) {
    return false;
  }
  chrome::MoveTabsToExistingWindow(source, target, {index});
  return true;
}

bool CloseRemoteTab(Browser* caller, const tabs_api::NodeId& id) {
  tabs::TabInterface* tab = RemoteTab(caller, id);
  if (!tab) {
    return false;
  }
  tab->Close();
  return true;
}

std::vector<tabs_api::NodeId> LiveTabs(
    const std::vector<tabs_api::NodeId>& ids) {
  std::vector<tabs_api::NodeId> live;
  for (const tabs_api::NodeId& id : ids) {
    std::optional<tabs::TabHandle> handle = id.ToTabHandle();
    if (handle && handle->Get()) {
      live.push_back(id);
    }
  }
  return live;
}

}
