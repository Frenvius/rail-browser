#include "chrome/browser/ui/webui_browser/rail/rail_window_frame.h"

#if BUILDFLAG(IS_WIN)

#include <shobjidl.h>
#include <windows.h>

#include <commctrl.h>
#include <dwmapi.h>
#include <wrl/client.h>

#include <optional>

#include "base/supports_user_data.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/aura/window.h"
#include "ui/aura/window_tree_host.h"
#include "ui/compositor/compositor.h"
#include "ui/display/screen.h"
#include "ui/display/win/screen_win.h"
#include "ui/events/event.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
#include "ui/gfx/geometry/size_conversions.h"
#include "ui/gfx/geometry/size_f.h"
#include "ui/gfx/win/hwnd_util.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_delegate.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr UINT_PTR kResizeCursorSubclassId = 0x57425549;
constexpr int kResizeBorder = 6;
constexpr int kResizeCorner = 16;

bool g_backdrop_enabled = false;

constexpr char kShellTransparencyKey[] = "rail_shell_transparency";

class ShellTransparency : public content::WebContentsObserver,
                          public base::SupportsUserData::Data {
 public:
  explicit ShellTransparency(content::WebContents* contents)
      : content::WebContentsObserver(contents) {
    Apply();
  }

  void RenderViewReady() override { Apply(); }

  void RenderFrameHostChanged(content::RenderFrameHost* old_host,
                              content::RenderFrameHost* new_host) override {
    Apply();
  }

  void PrimaryMainFrameRenderProcessGone(
      base::TerminationStatus status) override {
    Apply();
  }

 private:
  void Apply() {
    content::WebContents* contents = web_contents();
    if (!contents) {
      return;
    }
    contents->SetPageBaseBackgroundColor(SK_ColorTRANSPARENT);
    if (content::RenderWidgetHostView* view =
            contents->GetRenderWidgetHostView()) {
      view->SetBackgroundColor(SK_ColorTRANSPARENT);
    }
  }
};

void EnsureBackdropStyles(HWND hwnd, const views::Widget* widget) {
  if (!g_backdrop_enabled || (widget && widget->IsFullscreen())) {
    return;
  }
  const LONG style = ::GetWindowLong(hwnd, GWL_STYLE);
  const LONG wanted = style | WS_CAPTION | WS_THICKFRAME | WS_MAXIMIZEBOX;
  if (wanted == style) {
    return;
  }
  ::SetWindowLong(hwnd, GWL_STYLE, wanted);
  ::SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE |
                     SWP_FRAMECHANGED);
}

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
    const int component =
        static_cast<int>(::SendMessage(hwnd, WM_NCHITTEST, 0, cursor_position));
    if (wchar_t* cursor = ResizeCursorForComponent(component)) {
      ::SetCursor(::LoadCursor(nullptr, cursor));
      return TRUE;
    }
  }

  POINT cursor;
  if (message == WM_RBUTTONUP && ::GetCursorPos(&cursor)) {
    const LPARAM cursor_position =
        MAKELPARAM(static_cast<WORD>(cursor.x), static_cast<WORD>(cursor.y));
    if (static_cast<int>(::SendMessage(hwnd, WM_NCHITTEST, 0,
                                       cursor_position)) == HTCAPTION) {
      ::ReleaseCapture();
      return 0;
    }
  }

  if (message == WM_NCDESTROY) {
    ::RemoveWindowSubclass(hwnd, ResizeCursorSubclassProc, subclass_id);
  }

  if (message == WM_NCACTIVATE && g_backdrop_enabled) {
    const LRESULT result = ::DefSubclassProc(hwnd, message, w_param, l_param);
    ::DefWindowProc(hwnd, WM_NCACTIVATE, w_param, static_cast<LPARAM>(-1));
    return result;
  }

  if (message == WM_WINDOWPOSCHANGED || message == WM_SIZE ||
      message == WM_DWMCOMPOSITIONCHANGED || message == WM_THEMECHANGED) {
    const LRESULT result = ::DefSubclassProc(hwnd, message, w_param, l_param);
    EnsureBackdropStyles(hwnd,
                         reinterpret_cast<views::Widget*>(ref_data));
    return result;
  }

  return ::DefSubclassProc(hwnd, message, w_param, l_param);
}

}  // namespace

void PrepareSystemBackdropWindow(views::Widget* widget) {
  HWND hwnd = views::HWNDForWidget(widget);
  g_backdrop_enabled = true;
  EnsureBackdropStyles(hwnd, widget);
  const COLORREF caption_color = DWMWA_COLOR_NONE;
  ::DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &caption_color,
                          sizeof(caption_color));

  aura::Window* window = widget->GetNativeWindow();
  if (!window) {
    return;
  }
  window->SetTransparent(true);
  if (aura::Window* root = window->GetRootWindow()) {
    root->SetTransparent(true);
  }
  if (aura::WindowTreeHost* host = window->GetHost();
      host && host->compositor()) {
    host->compositor()->SetBackgroundColor(SK_ColorTRANSPARENT);
  }
}

void MakeShellContentsTransparent(content::WebContents* contents) {
  if (!g_backdrop_enabled || !contents ||
      contents->GetUserData(kShellTransparencyKey)) {
    return;
  }
  contents->SetUserData(kShellTransparencyKey,
                        std::make_unique<ShellTransparency>(contents));
}

bool IsWidgetOnCurrentWorkspace(const views::Widget* widget) {
  if (!widget) {
    return true;
  }
  gfx::NativeWindow window = widget->GetNativeWindow();
  if (!window || !window->GetHost()) {
    return true;
  }
  const std::optional<bool> cached = window->GetHost()->on_current_workspace();
  if (cached.has_value()) {
    return cached.value();
  }
  const HWND hwnd = window->GetHost()->GetAcceleratedWidget();
  if (!gfx::IsWindowCloaked(hwnd)) {
    return true;
  }
  Microsoft::WRL::ComPtr<IVirtualDesktopManager> virtual_desktop_manager;
  if (!SUCCEEDED(::CoCreateInstance(__uuidof(VirtualDesktopManager), nullptr,
                                    CLSCTX_ALL,
                                    IID_PPV_ARGS(&virtual_desktop_manager)))) {
    return true;
  }
  return gfx::IsWindowOnCurrentVirtualDesktop(hwnd, virtual_desktop_manager) !=
         false;
}

gfx::Rect StableSavedBounds(const views::Widget* widget,
                            const gfx::Rect& bounds) {
  if (!widget || !widget->GetNativeWindow()) {
    return bounds;
  }
  const HWND hwnd = views::HWNDForNativeWindow(widget->GetNativeWindow());
  WINDOWPLACEMENT placement = {};
  placement.length = sizeof(placement);
  if (!hwnd || !::GetWindowPlacement(hwnd, &placement)) {
    return bounds;
  }
  RECT rect = placement.rcNormalPosition;
  if (placement.showCmd == SW_SHOWNORMAL && !::GetWindowRect(hwnd, &rect)) {
    return bounds;
  }
  const float scale =
      display::win::GetScreenWin()->GetScaleFactorForHWND(hwnd);
  if (scale <= 0.f) {
    return bounds;
  }
  gfx::Rect stable = bounds;
  stable.set_size(gfx::ToFlooredSize(
      gfx::SizeF(static_cast<float>(rect.right - rect.left) / scale,
                 static_cast<float>(rect.bottom - rect.top) / scale)));
  return stable;
}

void InstallResizeCursorSubclass(views::Widget* widget) {
  CHECK(::SetWindowSubclass(views::HWNDForWidget(widget),
                            ResizeCursorSubclassProc, kResizeCursorSubclassId,
                            reinterpret_cast<DWORD_PTR>(widget)));
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

bool HandleFramelessContextMenu(views::Widget* widget,
                                ui::MouseEvent* event,
                                webui_browser::mojom::Page* page) {
  if (!page || event->type() != ui::EventType::kMousePressed ||
      !event->IsOnlyRightMouseButton()) {
    return false;
  }

  HWND hwnd = views::HWNDForWidget(widget);
  if (!hwnd) {
    return false;
  }

  POINT physical;
  if (!::GetCursorPos(&physical)) {
    return false;
  }
  const LPARAM cursor_position =
      MAKELPARAM(static_cast<WORD>(physical.x), static_cast<WORD>(physical.y));
  if (static_cast<int>(::SendMessage(hwnd, WM_NCHITTEST, 0, cursor_position)) !=
      HTCAPTION) {
    return false;
  }

  event->StopPropagation();
  const gfx::Point cursor = display::Screen::Get()->GetCursorScreenPoint();
  page->OnSidebarContextMenu(
      cursor - widget->GetClientAreaBoundsInScreen().OffsetFromOrigin());
  return true;
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
                    ::IsZoomed(hwnd) ? SC_RESTORE : SC_MAXIMIZE, 0);
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

}  // namespace rail

#endif  // BUILDFLAG(IS_WIN)
