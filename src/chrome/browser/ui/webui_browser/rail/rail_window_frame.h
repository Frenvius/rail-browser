#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_

#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)

#include "base/memory/raw_ptr.h"
#include "base/scoped_observation.h"
#include "chrome/browser/ui/webui_browser/browser.mojom.h"
#include "ui/views/widget/widget_observer.h"

namespace aura {
class Window;
}

namespace content {
class WebContents;
}

namespace gfx {
class Point;
class Rect;
class Size;
}  // namespace gfx

namespace ui {
class EventHandler;
class MouseEvent;
}  // namespace ui

namespace views {
class Widget;
}

namespace rail {

class WidgetPreTargetHandler : public views::WidgetObserver {
 public:
  WidgetPreTargetHandler(views::Widget* widget, ui::EventHandler* handler);
  WidgetPreTargetHandler(const WidgetPreTargetHandler&) = delete;
  WidgetPreTargetHandler& operator=(const WidgetPreTargetHandler&) = delete;
  ~WidgetPreTargetHandler() override;

  void OnWidgetDestroying(views::Widget* widget) override;

 private:
  void Remove();

  raw_ptr<aura::Window> target_;
  raw_ptr<ui::EventHandler> handler_;
  base::ScopedObservation<views::Widget, views::WidgetObserver> observation_{
      this};
};

void PrepareSystemBackdropWindow(views::Widget* widget);

void MakeShellContentsTransparent(content::WebContents* contents);

bool IsWidgetOnCurrentWorkspace(const views::Widget* widget);

gfx::Rect StableSavedBounds(const views::Widget* widget,
                            const gfx::Rect& bounds);

// A frameless window has no native frame to grab, so the client area answers
// for the resize edges and the caption itself.

int PointerDistanceOutsideWidget(const views::Widget* widget);

void InstallResizeCursorSubclass(views::Widget* widget);
void RemoveResizeCursorSubclass(views::Widget* widget);

// Returns the hit-test component for `point` in a client area of `size`, or
// HTNOWHERE when the point is not on an edge or the widget cannot resize.
int ResizeComponentForPoint(const views::Widget* widget,
                            const gfx::Size& size,
                            const gfx::Point& point);

// Applies the resize cursor on hover and hands a left press to the native
// move/resize loop. Returns true when the event was consumed.
bool HandleFramelessMouseEvent(views::Widget* widget,
                               ui::MouseEvent* event,
                               webui_browser::mojom::Page* page);

bool HandleFramelessContextMenu(views::Widget* widget,
                                ui::MouseEvent* event,
                                webui_browser::mojom::Page* page);

}  // namespace rail

#endif  // BUILDFLAG(IS_WIN)

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_
