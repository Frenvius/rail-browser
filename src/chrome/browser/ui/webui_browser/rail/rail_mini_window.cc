#include "chrome/browser/ui/webui_browser/rail/rail_mini_window.h"

#include <string>
#include <vector>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/create_browser_window.h"
#include "chrome/browser/ui/browser_window/public/profile_browser_collection.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/rail/rail_site_routes.h"
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
                                              BrowserWindowInterface* except) {
  BrowserWindowInterface* found = nullptr;
  ProfileBrowserCollection::GetForProfile(profile)->ForEach(
      [&](BrowserWindowInterface* browser) {
        if (browser == except ||
            browser->GetType() != BrowserWindowInterface::TYPE_NORMAL) {
          return true;
        }
        found = browser;
        return false;
      },
      BrowserCollection::Order::kActivation);
  return found;
}

void ClaimTabsForSpace(BrowserWindowInterface* target,
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

bool CanCreateWindow(Profile* profile) {
  return profile && GetBrowserWindowCreationStatusForProfile(*profile) ==
                        BrowserWindowInterface::CreationStatus::kOk;
}

}

bool IsMiniWindow(const BrowserWindowInterface* browser) {
  return browser &&
         browser->GetType() == BrowserWindowInterface::Type::TYPE_POPUP;
}

bool ShouldOpenLinkInMiniWindow(BrowserWindowInterface* source) {
  return source && source->GetType() == BrowserWindowInterface::TYPE_NORMAL &&
         WebUIBrowserWindow::FromBrowser(source);
}

gfx::Rect MiniWindowBoundsNear(const BrowserWindowInterface* source) {
  const gfx::Size size(kMiniWindowWidth, kMiniWindowHeight);
  if (!source || !source->GetWindow()) {
    return gfx::Rect(size);
  }
  const gfx::Rect area = source->GetWindow()->GetBounds();
  return gfx::Rect(area.x() + (area.width() - size.width()) / 2,
                   area.y() + (area.height() - size.height()) / 2,
                   size.width(), size.height());
}

BrowserWindowInterface* CreateMiniWindow(Profile* profile,
                                         const gfx::Rect& bounds) {
  if (!CanCreateWindow(profile)) {
    return nullptr;
  }
  BrowserWindowCreateParams params(BrowserWindowInterface::TYPE_POPUP, profile,
                                   /*from_user_gesture=*/true);
  params.initial_bounds =
      bounds.IsEmpty() ? gfx::Rect(0, 0, kMiniWindowWidth, kMiniWindowHeight)
                       : bounds;
  params.omit_from_session_restore = true;
  return CreateBrowserWindow(std::move(params));
}

BrowserWindowInterface* OpenMiniWindow(Profile* profile,
                                       const GURL& url,
                                       const gfx::Rect& bounds) {
  BrowserWindowInterface* browser = CreateMiniWindow(profile, bounds);
  if (!browser) {
    return nullptr;
  }
  chrome::AddTabAt(browser, url, -1, /*foreground=*/true);
  browser->GetWindow()->Show();
  return browser;
}

BrowserWindowInterface* OpenMiniWindowNear(BrowserWindowInterface* source,
                                           const GURL& url) {
  if (!source) {
    return nullptr;
  }
  return OpenMiniWindow(source->GetProfile(), url,
                        MiniWindowBoundsNear(source));
}

BrowserWindowInterface* OpenExternalUrlsInMiniWindows(
    Profile* profile,
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

  const gfx::Rect bounds = MiniWindowBoundsNear(shell);
  BrowserWindowInterface* last = nullptr;
  for (const GURL& url : urls) {
    if (RouteToSpace(shell, url)) {
      last = shell;
    } else if (BrowserWindowInterface* mini =
                   OpenMiniWindow(profile, url, bounds)) {
      last = mini;
    }
  }
  if (last) {
    last->GetWindow()->Activate();
  }
  return last;
}

bool AdoptMiniWindow(BrowserWindowInterface* mini,
                     const std::string& space_id) {
  if (!IsMiniWindow(mini)) {
    return false;
  }
  TabStripModel* model = mini->GetTabStripModel();
  if (model->empty()) {
    return false;
  }

  BrowserWindowInterface* target =
      LastActiveShellWindow(mini->GetProfile(), mini);
  if (!target) {
    if (!CanCreateWindow(mini->GetProfile())) {
      return false;
    }
    target = CreateBrowserWindow(BrowserWindowCreateParams(
        mini->GetProfile(), /*from_user_gesture=*/true));
    if (!target) {
      return false;
    }
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
    ClaimTabsForSpace(target, moved, space_id);
  }
  target->GetWindow()->Activate();
  return true;
}

}
