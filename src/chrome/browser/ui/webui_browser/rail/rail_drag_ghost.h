#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_

#include <vector>

#include "base/functional/callback.h"
#include "components/browser_apis/tab_strip/types/node_id.h"

class BrowserWindowInterface;

namespace content {
class WebContents;
}

namespace gfx {
class Point;
class Rect;
}

namespace rail {

struct DragGhostObserver {
  using MovedCallback = base::RepeatingCallback<void(const gfx::Point&)>;
  using EndedCallback =
      base::RepeatingCallback<void(const gfx::Point&, bool inside)>;

  DragGhostObserver();
  DragGhostObserver(const DragGhostObserver&);
  ~DragGhostObserver();

  MovedCallback moved;
  EndedCallback ended;
};

void StartDragGhost(BrowserWindowInterface* source,
                    content::WebContents* shell,
                    const gfx::Rect& row,
                    const gfx::Point& grab_offset,
                    const std::vector<tabs_api::NodeId>& ids,
                    DragGhostObserver observer);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_
