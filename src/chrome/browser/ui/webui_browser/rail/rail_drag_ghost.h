#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_

#include "base/functional/callback.h"

class Browser;

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

void StartDragGhost(Browser* source,
                    content::WebContents* shell,
                    const gfx::Rect& row,
                    const gfx::Point& grab_offset,
                    bool detachable,
                    DragGhostObserver observer);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DRAG_GHOST_H_
