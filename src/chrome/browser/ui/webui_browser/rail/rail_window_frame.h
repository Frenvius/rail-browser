#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_

#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)

namespace gfx {
class Point;
class Size;
}

namespace ui {
class MouseEvent;
}

namespace views {
class Widget;
}

namespace rail {

// Asks DWM for the Mica backdrop and matches the titlebar to the color mode.
// Does nothing on Windows versions without Mica.
void ApplyMicaBackdrop(views::Widget* widget);

// A frameless window has no native frame to grab, so the client area answers
// for the resize edges and the caption itself.

void InstallResizeCursorSubclass(views::Widget* widget);
void RemoveResizeCursorSubclass(views::Widget* widget);

// Returns the hit-test component for `point` in a client area of `size`, or
// HTNOWHERE when the point is not on an edge or the widget cannot resize.
int ResizeComponentForPoint(const views::Widget* widget,
                            const gfx::Size& size,
                            const gfx::Point& point);

// Applies the resize cursor on hover and hands a left press to the native
// move/resize loop. Returns true when the event was consumed.
bool HandleFramelessMouseEvent(views::Widget* widget, ui::MouseEvent* event);

}

#endif  // BUILDFLAG(IS_WIN)

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_WINDOW_FRAME_H_
