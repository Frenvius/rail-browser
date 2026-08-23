#include "chrome/browser/ui/webui_browser/rail/rail_window_frame.h"

#if BUILDFLAG(IS_WIN)

#include <windows.h>

#include <commctrl.h>
#include <dwmapi.h>

#include "chrome/browser/win/mica_titlebar.h"

#include "ui/events/event.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_delegate.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr UINT_PTR kResizeCursorSubclassId = 0x57425549;
constexpr int kResizeBorder = 6;
constexpr int kResizeCorner = 16;

int ResizeCommandForComponent(int component) {
  switch (component) {
    case HTLEFT:
      return WMSZ_LEFT;
    case HTRIGHT:
      return WMSZ_RIGHT;
    case HTTOP:
      return WMSZ_TOP;
    case HTTOPLEFT:
      return WMSZ_TOPLEFT;
    case HTTOPRIGHT:
      return WMSZ_TOPRIGHT;
    case HTBOTTOM:
      return WMSZ_BOTTOM;
    case HTBOTTOMLEFT:
      return WMSZ_BOTTOMLEFT;
    case HTBOTTOMRIGHT:
      return WMSZ_BOTTOMRIGHT;
    default:
      return 0;
  }
}

wchar_t* ResizeCursorForComponent(int component) {
  switch (component) {
    case HTLEFT:
    case HTRIGHT:
      return IDC_SIZEWE;
    case HTTOP:
    case HTBOTTOM:
      return IDC_SIZENS;
    case HTTOPLEFT:
    case HTBOTTOMRIGHT:
      return IDC_SIZENWSE;
    case HTTOPRIGHT:
    case HTBOTTOMLEFT:
      return IDC_SIZENESW;
    default:
      return nullptr;
  }
}

// Views answers WM_SETCURSOR asynchronously, which leaves the arrow cursor on
// the edge until the next mouse move. This subclass answers synchronously.
LRESULT CALLBACK ResizeCursorSubclassProc(HWND hwnd,
                                          UINT message,
                                          WPARAM w_param,
                                          LPARAM l_param,
                                          UINT_PTR subclass_id,
                                          DWORD_PTR ref_data) {
  if (message == WM_SETCURSOR) {
    const LPARAM cursor_position = static_cast<LPARAM>(::GetMessagePos());
    const int component = static_cast<int>(
        ::SendMessage(hwnd, WM_NCHITTEST, 0, cursor_position));
    if (wchar_t* cursor = ResizeCursorForComponent(component)) {
      ::SetCursor(::LoadCursor(nullptr, cursor));
      return TRUE;
    }
  }

  if (message == WM_NCDESTROY) {
    ::RemoveWindowSubclass(hwnd, ResizeCursorSubclassProc, subclass_id);
  }
  return ::DefSubclassProc(hwnd, message, w_param, l_param);
}

}

void ApplyMicaBackdrop(views::Widget* widget) {
  if (!SystemTitlebarCanUseMicaMaterial()) {
    return;
  }
  HWND hwnd = views::HWNDForWidget(widget);
  const BOOL use_dark_mode =
      widget->GetColorMode() == ui::ColorProviderKey::ColorMode::kDark;
  ::DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &use_dark_mode,
                          sizeof(use_dark_mode));
  const DWM_SYSTEMBACKDROP_TYPE backdrop = DWMSBT_TABBEDWINDOW;
  ::DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop,
                          sizeof(backdrop));
}

void InstallResizeCursorSubclass(views::Widget* widget) {
  CHECK(::SetWindowSubclass(views::HWNDForWidget(widget),
                            ResizeCursorSubclassProc, kResizeCursorSubclassId,
                            0));
}

void RemoveResizeCursorSubclass(views::Widget* widget) {
  ::RemoveWindowSubclass(views::HWNDForWidget(widget), ResizeCursorSubclassProc,
                         kResizeCursorSubclassId);
}

int ResizeComponentForPoint(const views::Widget* widget,
                            const gfx::Size& size,
                            const gfx::Point& point) {
  if (!widget || !widget->widget_delegate()->CanResize() ||
      widget->IsMaximized() || widget->IsFullscreen()) {
    return HTNOWHERE;
  }

  bool in_top = point.y() < kResizeBorder;
  bool in_bottom = point.y() >= size.height() - kResizeBorder;
  bool in_left = point.x() < kResizeBorder;
  bool in_right = point.x() >= size.width() - kResizeBorder;
  if (!in_top && !in_bottom && !in_left && !in_right) {
    return HTNOWHERE;
  }

  in_top |= point.y() < kResizeCorner;
  in_left |= point.x() < kResizeCorner;
  in_right |= point.x() >= size.width() - kResizeCorner;

  if (in_top) {
    if (in_left) {
      return HTTOPLEFT;
    }
    return in_right ? HTTOPRIGHT : HTTOP;
  }
  if (in_bottom) {
    if (in_left) {
      return HTBOTTOMLEFT;
    }
    return in_right ? HTBOTTOMRIGHT : HTBOTTOM;
  }
  return in_left ? HTLEFT : HTRIGHT;
}

bool HandleFramelessMouseEvent(views::Widget* widget, ui::MouseEvent* event) {
  const bool is_hover_event = event->type() == ui::EventType::kMouseMoved ||
                              event->type() == ui::EventType::kMouseEntered;
  const bool is_left_press = event->type() == ui::EventType::kMousePressed &&
                             event->IsOnlyLeftMouseButton();
  if (!is_hover_event && !is_left_press) {
    return false;
  }

  HWND hwnd = views::HWNDForWidget(widget);
  if (!hwnd) {
    return false;
  }

  const LPARAM cursor_position = static_cast<LPARAM>(::GetMessagePos());
  const int component =
      static_cast<int>(::SendMessage(hwnd, WM_NCHITTEST, 0, cursor_position));

  if (is_hover_event) {
    if (wchar_t* cursor = ResizeCursorForComponent(component)) {
      ::SetCursor(::LoadCursor(nullptr, cursor));
    }
    return false;
  }

  const int resize_command = ResizeCommandForComponent(component);
  if (component != HTCAPTION && resize_command == 0) {
    return false;
  }

  event->StopPropagation();
  ::ReleaseCapture();
  if (component == HTCAPTION) {
    if (event->GetClickCount() == 2) {
      ::PostMessage(hwnd, WM_SYSCOMMAND,
                    widget->IsMaximized() ? SC_RESTORE : SC_MAXIMIZE, 0);
      return true;
    }
    ::PostMessage(hwnd, WM_SYSCOMMAND, SC_MOVE | HTCAPTION, cursor_position);
    return true;
  }

  ::SetCursor(::LoadCursor(nullptr, ResizeCursorForComponent(component)));
  ::PostMessage(hwnd, WM_SYSCOMMAND, SC_SIZE | resize_command,
                cursor_position);
  return true;
}

}

#endif  // BUILDFLAG(IS_WIN)
