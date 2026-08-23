#include "chrome/browser/ui/webui_browser/rail/rail_drag_ghost.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui_browser/rail/rail_tab_transfer.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "third_party/skia/include/core/SkPath.h"
#include "ui/display/screen.h"
#include "ui/gfx/canvas.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/skia_conversions.h"
#include "ui/gfx/geometry/vector2d.h"
#include "ui/gfx/image/image_skia.h"
#include "ui/views/view.h"
#include "ui/views/widget/widget.h"

namespace rail {
namespace {

constexpr base::TimeDelta kSnapshotTimeout = base::Milliseconds(300);
constexpr base::TimeDelta kCursorPoll = base::Milliseconds(16);
constexpr float kCornerRadius = 6.0f;

class GhostView : public views::View {
 public:
  explicit GhostView(gfx::ImageSkia image) : image_(std::move(image)) {}

  void OnPaint(gfx::Canvas* canvas) override {
    canvas->ClipPath(SkPath::RRect(gfx::RectToSkRect(GetLocalBounds()),
                                   kCornerRadius, kCornerRadius),
                     true);
    canvas->DrawImageInt(image_, 0, 0);
  }

 private:
  gfx::ImageSkia image_;
};

std::unique_ptr<views::Widget> CreateGhostWidget(const SkBitmap& bitmap,
                                                 const gfx::Rect& bounds) {
  views::Widget::InitParams params(
      views::Widget::InitParams::WIDGET_OWNS_NATIVE_WIDGET,
      views::Widget::InitParams::TYPE_WINDOW_FRAMELESS);
  params.opacity = views::Widget::InitParams::WindowOpacity::kTranslucent;
  params.activatable = views::Widget::InitParams::Activatable::kNo;
  params.shadow_type = views::Widget::InitParams::ShadowType::kNone;
  params.z_order = ui::ZOrderLevel::kFloatingWindow;
  params.bounds = bounds;

  auto widget = std::make_unique<views::Widget>();
  widget->Init(std::move(params));
  widget->SetContentsView(std::make_unique<GhostView>(
      gfx::ImageSkia::CreateFrom1xBitmap(bitmap)));
  widget->SetOpacity(0.9f);
  widget->ShowInactive();
  return widget;
}

gfx::Point ClientPoint(content::RenderWidgetHostView* view,
                       const gfx::Point& screen) {
  gfx::Point point = screen;
  point -= view->GetViewBounds().OffsetFromOrigin();
  return point;
}

void SetDropTarget(BrowserWindowInterface* browser, bool visible) {
  WebUIBrowserWindow* window = WebUIBrowserWindow::FromBrowser(browser);
  WebUIBrowserUI* ui = window ? window->GetWebUIBrowserUI() : nullptr;
  if (ui && ui->page()) {
    ui->page()->OnTabDropTarget(visible);
  }
}

struct PollState {
  base::WeakPtr<Browser> source;
  base::WeakPtr<content::WebContents> shell;
  DragGhostObserver::MovedCallback moved;
  bool detachable = false;
  base::WeakPtr<BrowserWindowInterface> target;
};

void Poll(PollState* state) {
  const gfx::Point cursor = display::Screen::Get()->GetCursorScreenPoint();
  content::RenderWidgetHostView* view =
      state->shell ? state->shell->GetRenderWidgetHostView() : nullptr;
  if (view && state->moved) {
    state->moved.Run(ClientPoint(view, cursor));
  }
  if (!state->detachable) {
    return;
  }

  BrowserWindowInterface* target =
      state->source ? WindowUnderPoint(state->source.get(), cursor) : nullptr;
  if (target == state->target.get()) {
    return;
  }
  if (state->target) {
    SetDropTarget(state->target.get(), false);
  }
  state->target = target ? target->GetWeakPtr() : nullptr;
  if (target) {
    SetDropTarget(target, true);
  }
}

void RunGhostLoop(base::WeakPtr<Browser> source,
                  base::WeakPtr<content::WebContents> shell,
                  DragGhostObserver observer,
                  bool detachable,
                  const gfx::Size& size,
                  const gfx::Vector2d& drag_offset,
                  const content::CopyFromSurfaceResult& result) {
  content::RenderWidgetHostView* view =
      shell ? shell->GetRenderWidgetHostView() : nullptr;
  if (!source || !view || !result.has_value() ||
      result->bitmap.drawsNothing()) {
    if (observer.ended) {
      observer.ended.Run(gfx::Point(), true);
    }
    return;
  }

  const gfx::Point cursor = display::Screen::Get()->GetCursorScreenPoint();
  std::unique_ptr<views::Widget> ghost =
      CreateGhostWidget(result->bitmap, gfx::Rect(cursor - drag_offset, size));
  if (!ghost->IsMoveLoopSupported()) {
    if (observer.ended) {
      observer.ended.Run(gfx::Point(), true);
    }
    return;
  }

  PollState poll_state{source, shell, observer.moved, detachable, nullptr};
  base::RepeatingTimer poll;
  poll.Start(FROM_HERE, kCursorPoll,
             base::BindRepeating(&Poll, base::Unretained(&poll_state)));

  ghost->RunMoveLoop(drag_offset, views::Widget::MoveLoopSource::kMouse,
                     views::Widget::MoveLoopEscapeBehavior::kHide);
  poll.Stop();
  if (poll_state.target) {
    SetDropTarget(poll_state.target.get(), false);
  }

  const gfx::Point drop = display::Screen::Get()->GetCursorScreenPoint();
  ghost->Close();
  ghost.reset();

  view = shell ? shell->GetRenderWidgetHostView() : nullptr;
  const bool inside = view && view->GetViewBounds().Contains(drop);
  if (observer.ended) {
    observer.ended.Run(view ? ClientPoint(view, drop) : gfx::Point(), inside);
  }
  if (!inside && detachable && source) {
    DropActiveTabAtScreenPoint(source.get(), drop);
  }
}

}

DragGhostObserver::DragGhostObserver() = default;
DragGhostObserver::DragGhostObserver(const DragGhostObserver&) = default;
DragGhostObserver::~DragGhostObserver() = default;

void StartDragGhost(Browser* source,
                    content::WebContents* shell,
                    const gfx::Rect& row,
                    const gfx::Point& grab_offset,
                    bool detachable,
                    DragGhostObserver observer) {
  if (!source || !shell) {
    return;
  }
  content::RenderWidgetHostView* view = shell->GetRenderWidgetHostView();
  if (!view) {
    return;
  }

  view->CopyFromSurface(
      row, row.size(), kSnapshotTimeout,
      base::BindOnce(&RunGhostLoop, source->AsWeakPtr(), shell->GetWeakPtr(),
                     std::move(observer), detachable, row.size(),
                     grab_offset.OffsetFromOrigin()));
}

}
