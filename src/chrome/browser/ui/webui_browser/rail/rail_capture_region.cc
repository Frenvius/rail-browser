#include "chrome/browser/ui/webui_browser/rail/rail_capture_region.h"

#if BUILDFLAG(IS_WIN)

#include <windows.h>

#include <algorithm>

#include "base/functional/bind.h"
#include "base/numerics/safe_conversions.h"
#include "base/win/wrapped_window_proc.h"
#include "chrome/browser/ui/browser_element_identifiers.h"
#include "ui/base/interaction/element_events.h"
#include "ui/display/win/screen_win.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/interaction/element_tracker_views.h"
#include "ui/views/widget/widget.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr wchar_t kCaptureRegionClassName[] = L"RailCaptureRegion";
constexpr float kTopBarInset = 6.0f;

LRESULT CALLBACK CaptureRegionProc(HWND hwnd,
                                   UINT message,
                                   WPARAM wparam,
                                   LPARAM lparam) {
  return ::DefWindowProc(hwnd, message, wparam, lparam);
}

HINSTANCE RegisterCaptureRegionClass() {
  static const HINSTANCE instance = [] {
    WNDCLASSEX window_class;
    base::win::InitializeWindowClass(
        kCaptureRegionClassName,
        &base::win::WrappedWindowProc<CaptureRegionProc>, 0, 0, 0, nullptr,
        nullptr, nullptr, nullptr, nullptr, &window_class);
    ::RegisterClassEx(&window_class);
    return window_class.hInstance;
  }();
  return instance;
}

}  // namespace

CaptureRegion::CaptureRegion(views::Widget* widget) : widget_(widget) {
  hwnd_ = ::CreateWindowEx(
      WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_NOPARENTNOTIFY,
      kCaptureRegionClassName, L"", WS_CHILD | WS_DISABLED | WS_CLIPSIBLINGS,
      0, 0, 0, 0, views::HWNDForWidget(widget), nullptr,
      RegisterCaptureRegionClass(), nullptr);
  if (!hwnd_) {
    return;
  }

  const ui::ElementContext context =
      views::ElementTrackerViews::GetContextForWidget(widget);
  auto* tracker = ui::ElementTracker::GetElementTracker();
  shown_subscription_ = tracker->AddElementShownCallback(
      kContentsContainerViewElementId, context,
      base::BindRepeating(&CaptureRegion::Place, base::Unretained(this)));
  bounds_subscription_ = tracker->AddCustomEventCallback(
      ui::kElementBoundsChangedEvent, kContentsContainerViewElementId, context,
      base::BindRepeating(&CaptureRegion::Place, base::Unretained(this)));
  hidden_subscription_ = tracker->AddElementHiddenCallback(
      kContentsContainerViewElementId, context,
      base::BindRepeating(&CaptureRegion::Hide, base::Unretained(this)));
}

CaptureRegion::~CaptureRegion() {
  if (hwnd_ && ::IsWindow(hwnd_)) {
    ::DestroyWindow(hwnd_);
  }
}

void CaptureRegion::Place(ui::TrackedElement* element) {
  HWND parent = views::HWNDForWidget(widget_);
  if (!parent) {
    return;
  }
  const gfx::Rect bounds = display::win::GetScreenWin()->DIPToScreenRect(
      parent, element->GetScreenBounds());
  POINT origin = bounds.origin().ToPOINT();
  ::ScreenToClient(parent, &origin);
  const int top = std::min<int>(
      origin.y,
      base::ClampRound(kTopBarInset *
                       display::win::GetScreenWin()->GetScaleFactorForHWND(
                           parent)));
  ::SetWindowPos(hwnd_, HWND_TOP, origin.x, top, bounds.width(),
                 origin.y + bounds.height() - top,
                 SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

void CaptureRegion::Hide(ui::TrackedElement* element) {
  ui::TrackedElement* current =
      ui::ElementTracker::GetElementTracker()->GetFirstMatchingElement(
          kContentsContainerViewElementId, element->context());
  if (current && current != element) {
    Place(current);
    return;
  }
  ::ShowWindow(hwnd_, SW_HIDE);
}

}  // namespace rail

#endif
