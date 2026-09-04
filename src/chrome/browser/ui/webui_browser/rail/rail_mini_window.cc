#include "chrome/browser/ui/webui_browser/rail/rail_mini_window.h"

#include <string>
#include <vector>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "components/browser_apis/tab_strip/types/node_id.h"
#include "components/tabs/public/tab_interface.h"
#include "ui/base/base_window.h"
#include "ui/gfx/geometry/rect.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr int kMiniWindowWidth = 720;
constexpr int kMiniWindowHeight = 620;

BrowserWindowInterface* LastActiveShellWindow(Profile* profile,
                                              Browser* except) {
  BrowserWindowInterface* found = nullptr;
  ProfileBrowserCollection::GetForProfile(profile)->ForEach(
      [&](BrowserWindowInterface* browser) {
        if (browser->GetBrowserForMigrationOnly() == except ||
            browser->GetType() != BrowserWindowInterface::TYPE_NORMAL) {
          return true;
        }
        found = browser;
        return false;
      },
      BrowserCollection::Order::kActivation);
  return found;
}

void ClaimTabsForSpace(Browser* target,
                       const std::vector<tabs_api::NodeId>& ids,
                       const std::string& space_id) {
  WebUIBrowserWindow* window = WebUIBrowserWindow::FromBrowser(target);
  webui_browser::mojom::Page* page =
      window ? window->GetWebUIBrowserUI()->page() : nullptr;
  if (!page) {
    return;
  }
  for (const tabs_api::NodeId& id : ids) {
    page->OnRailAdoptTab(id, space_id);
  }
}

}

bool IsMiniWindow(const Browser* browser) {
  return browser && browser->is_type_popup();
}

bool ShouldOpenLinkInMiniWindow(const Browser* source) {
  return source && source->is_type_normal() &&
         WebUIBrowserWindow::FromBrowser(const_cast<Browser*>(source));
}

gfx::Rect MiniWindowBoundsNear(const Browser* source) {
  const gfx::Size size(kMiniWindowWidth, kMiniWindowHeight);
  if (!source || !source->window()) {
    return gfx::Rect(size);
  }
  const gfx::Rect area = source->window()->GetBounds();
  return gfx::Rect(area.x() + (area.width() - size.width()) / 2,
                   area.y() + (area.height() - size.height()) / 2,
                   size.width(), size.height());
}

Browser* CreateMiniWindow(Profile* profile, const gfx::Rect& bounds) {
  if (!profile || Browser::GetCreationStatusForProfile(profile) !=
                      Browser::CreationStatus::kOk) {
    return nullptr;
  }
  Browser::CreateParams params(Browser::TYPE_POPUP, profile,
                               /*user_gesture=*/true);
  params.initial_bounds =
      bounds.IsEmpty() ? gfx::Rect(0, 0, kMiniWindowWidth, kMiniWindowHeight)
                       : bounds;
  return Browser::Create(params);
}

Browser* OpenMiniWindow(Profile* profile,
                        const GURL& url,
                        const gfx::Rect& bounds) {
  Browser* browser = CreateMiniWindow(profile, bounds);
  if (!browser) {
    return nullptr;
  }
  chrome::AddTabAt(browser, url, -1, /*foreground=*/true);
  browser->window()->Show();
  return browser;
}

Browser* OpenMiniWindowNear(Browser* source, const GURL& url) {
  if (!source) {
    return nullptr;
  }
  return OpenMiniWindow(source->profile(), url, MiniWindowBoundsNear(source));
}

Browser* OpenExternalUrlsInMiniWindows(Profile* profile,
                                       const std::vector<GURL>& urls) {
  if (!profile || urls.empty()) {
    return nullptr;
  }
  for (const GURL& url : urls) {
    if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
      return nullptr;
    }
  }
  BrowserWindowInterface* shell = LastActiveShellWindow(profile, nullptr);
  if (!shell) {
    return nullptr;
  }

  const gfx::Rect bounds =
      MiniWindowBoundsNear(shell->GetBrowserForMigrationOnly());
  Browser* last = nullptr;
  for (const GURL& url : urls) {
    if (Browser* mini = OpenMiniWindow(profile, url, bounds)) {
      last = mini;
    }
  }
  if (last) {
    last->window()->Activate();
  }
  return last;
}

bool AdoptMiniWindow(Browser* mini, const std::string& space_id) {
  if (!IsMiniWindow(mini)) {
    return false;
  }
  TabStripModel* model = mini->tab_strip_model();
  if (model->empty()) {
    return false;
  }

  BrowserWindowInterface* target =
      LastActiveShellWindow(mini->profile(), mini);
  if (!target) {
    if (Browser::GetCreationStatusForProfile(mini->profile()) !=
        Browser::CreationStatus::kOk) {
      return false;
    }
    target = Browser::Create(
        Browser::CreateParams(mini->profile(), /*user_gesture=*/true));
    target->GetWindow()->Show();
  }

  std::vector<int> indices;
  std::vector<tabs_api::NodeId> moved;
  indices.reserve(model->count());
  moved.reserve(model->count());
  for (int i = 0; i < model->count(); ++i) {
    indices.push_back(i);
    moved.push_back(tabs_api::NodeId::FromTabHandle(
        model->GetTabAtIndex(i)->GetHandle()));
  }
  TabStripModel* const targets = target->GetTabStripModel();
  const int landed = targets->count();
  chrome::MoveTabsToExistingWindow(mini, target, indices);
  if (landed < targets->count()) {
    targets->ActivateTabAt(landed);
  }
  if (!space_id.empty()) {
    ClaimTabsForSpace(target->GetBrowserForMigrationOnly(), moved, space_id);
  }
  target->GetWindow()->Activate();
  return true;
}

}
