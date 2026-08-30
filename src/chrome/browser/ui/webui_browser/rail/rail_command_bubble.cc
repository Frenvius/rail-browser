#include "chrome/browser/ui/webui_browser/rail/rail_command_bubble.h"

#include <algorithm>
#include <string_view>
#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_command_ui.h"
#include "chrome/browser/ui/webui_browser/rail/rail_tab_opener.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/generated_resources.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/common/referrer.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/base/page_transition_types.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/controls/webview/webview.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr int kBubbleMaxWidth = 720;
constexpr int kBubbleMinWidth = 320;
constexpr int kBubbleSideMargin = 24;
constexpr int kBubbleMinHeight = 56;
constexpr float kTopFraction = 0.12f;
constexpr base::TimeDelta kFirstFrameTimeout = base::Milliseconds(250);

}

class RailCommandBubble::Contents : public WebUIContentsWrapper {
 public:
  Contents(const GURL& url, Profile* profile)
      : WebUIContentsWrapper(url,
                             profile,
                             IDS_TASK_MANAGER_BACKGROUND_PREFIX,
                             /*webui_resizes_host=*/true,
                             /*esc_closes_ui=*/true,
                             /*supports_draggable_regions=*/false,
                             std::string_view()),
        url_(url) {
    if (RailCommandUI* controller = GetController()) {
      controller->set_embedder(weak_ptr_factory_.GetWeakPtr());
    }
  }

  Contents(const Contents&) = delete;
  Contents& operator=(const Contents&) = delete;
  ~Contents() override = default;

  void ReloadWebContents() override {
    web_contents()->GetController().LoadURL(url_, content::Referrer(),
                                            ui::PAGE_TRANSITION_AUTO_TOPLEVEL,
                                            std::string());
    if (RailCommandUI* controller = GetController()) {
      controller->set_embedder(weak_ptr_factory_.GetWeakPtr());
    }
  }

  base::WeakPtr<WebUIContentsWrapper> GetWeakPtr() override {
    return weak_ptr_factory_.GetWeakPtr();
  }

  RailCommandUI* GetController() {
    content::WebUI* const webui = web_contents()->GetWebUI();
    return webui && webui->GetController()
               ? webui->GetController()->GetAs<RailCommandUI>()
               : nullptr;
  }

 private:
  const GURL url_;
  base::WeakPtrFactory<WebUIContentsWrapper> weak_ptr_factory_{this};
};

RailCommandBubble::RailCommandBubble(WebUIBrowserWindow* window)
    : window_(window),
      context_(rail_command::mojom::CommandContext::New()) {}

RailCommandBubble::~RailCommandBubble() {
  observation_.Reset();
  if (web_view_) {
    web_view_->SetWebContents(nullptr);
    web_view_ = nullptr;
  }
  shadow_.reset();
  backdrop_.reset();
  widget_.reset();
}

bool RailCommandBubble::visible() const {
  return showing_;
}

void RailCommandBubble::SetCommandContext(
    rail_command::mojom::CommandContextPtr context) {
  context_ = std::move(context);
  EnsureContents();
}

void RailCommandBubble::EnsureContents() {
  if (contents_) {
    return;
  }
  contents_ = std::make_unique<Contents>(GURL(kRailCommandURL),
                                         window_->browser()->profile());
  webui::SetBrowserWindowInterface(contents_->web_contents(),
                                   window_->browser());
  contents_->SetHost(weak_factory_.GetWeakPtr());
}

RailCommandUI* RailCommandBubble::controller() {
  return contents_ ? contents_->GetController() : nullptr;
}

void RailCommandBubble::Show(const std::string& text,
                             bool select_all,
                             bool new_tab_mode) {
  pending_text_ = text;
  pending_select_all_ = select_all;
  pending_new_tab_mode_ = new_tab_mode;

  EnsureContents();
  CreateWidget();
  if (!widget_) {
    return;
  }
  PositionWidget(content_size_);
  DeliverOpen();
  if (showing_) {
    widget_->Activate();
    return;
  }
  waiting_ready_ = true;
  contents_->web_contents()->WasShown();
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&RailCommandBubble::OnPageReady,
                     weak_factory_.GetWeakPtr(), 0),
      kFirstFrameTimeout);
}

void RailCommandBubble::OnPageReady(int height) {
  if (!waiting_ready_ || !widget_) {
    return;
  }
  waiting_ready_ = false;
  if (height > 0) {
    content_size_.set_height(height);
  }
  PositionWidget(content_size_);
  if (waiting_first_frame_) {
    return;
  }
  waiting_first_frame_ = true;
  contents_->web_contents()->GetPrimaryMainFrame()->InsertVisualStateCallback(
      base::BindOnce(&RailCommandBubble::OnFirstFrame,
                     weak_factory_.GetWeakPtr()));
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&RailCommandBubble::OnFirstFrame,
                     weak_factory_.GetWeakPtr(), false),
      kFirstFrameTimeout);
}

void RailCommandBubble::OnFirstFrame(bool) {
  if (!waiting_first_frame_) {
    return;
  }
  waiting_first_frame_ = false;
  ShowUI();
}

void RailCommandBubble::CreateWidget() {
  if (widget_) {
    return;
  }
  views::Widget* parent = window_->widget();
  if (!parent) {
    return;
  }

  views::Widget::InitParams params(
      views::Widget::InitParams::CLIENT_OWNS_WIDGET,
      views::Widget::InitParams::TYPE_POPUP);
  params.opacity = views::Widget::InitParams::WindowOpacity::kTranslucent;
  params.shadow_type = views::Widget::InitParams::ShadowType::kNone;
  params.activatable = views::Widget::InitParams::Activatable::kYes;
  params.parent = parent->GetNativeView();
  params.bounds = gfx::Rect(gfx::Size(DesiredWidth(), kBubbleMinHeight));

  widget_ = std::make_unique<views::Widget>();
  widget_->Init(std::move(params));

  auto web_view =
      std::make_unique<views::WebView>(window_->browser()->profile());
  web_view->SetWebContents(contents_->web_contents());
  web_view->SetBackground(nullptr);
  web_view_ = widget_->SetContentsView(std::move(web_view));

  if (content::RenderWidgetHostView* view =
          contents_->web_contents()->GetRenderWidgetHostView()) {
    view->SetBackgroundColor(SK_ColorTRANSPARENT);
  }

  widget_->SetVisibilityChangedAnimationsEnabled(false);
  backdrop_ = ApplyAcrylicBackdrop(widget_.get());
  observation_.Observe(widget_.get());
}

gfx::Rect RailCommandBubble::WindowArea() const {
  views::Widget* const parent = window_->widget();
  return parent ? parent->GetWindowBoundsInScreen()
                : window_->GetContentsBoundsInScreen();
}

int RailCommandBubble::DesiredWidth() const {
  const gfx::Rect area = WindowArea();
  return std::clamp(area.width() - 2 * kBubbleSideMargin, kBubbleMinWidth,
                    kBubbleMaxWidth);
}

void RailCommandBubble::PositionWidget(const gfx::Size& contents_size) {
  if (!widget_) {
    return;
  }
  const gfx::Rect area = WindowArea();
  const int height = contents_size.height() > 0 ? contents_size.height()
                                                : kBubbleMinHeight;
  const int width = DesiredWidth();
  gfx::Rect bounds(area.x() + (area.width() - width) / 2,
                   area.y() + static_cast<int>(area.height() * kTopFraction),
                   width, height);
  widget_->SetBounds(bounds);
  if (backdrop_) {
    backdrop_->UpdateClip();
  }

  if (shadow_) {
    gfx::Rect shadow_bounds = bounds;
    shadow_bounds.Inset(-kAcrylicShadowMargin);
    shadow_->SetBounds(shadow_bounds);
  }
}

void RailCommandBubble::DeliverOpen() {
  if (RailCommandUI* ui = controller()) {
    ui->set_ready_callback(base::BindRepeating(&RailCommandBubble::OnPageReady,
                                               weak_factory_.GetWeakPtr()));
    ui->Open(pending_text_, pending_select_all_, pending_new_tab_mode_,
             DesiredWidth(),
             context_ ? context_->Clone()
                      : rail_command::mojom::CommandContext::New());
  }
}

void RailCommandBubble::ShowUI() {
  if (!widget_) {
    return;
  }
  if (showing_) {
    widget_->Activate();
    return;
  }

  showing_ = true;
  PositionWidget(content_size_);
  if (!shadow_) {
    shadow_ = CreateAcrylicShadow(window_->widget(), widget_.get());
  }
  RevealAcrylic(widget_.get(), shadow_.get(), backdrop_.get(),
                -kAcrylicSlideDistance);
  widget_->Show();
  shadow_->ShowInactive();
  widget_->Activate();
  if (web_view_) {
    web_view_->RequestFocus();
  }
}

void RailCommandBubble::CloseUI() {
  Dismiss();
}

void RailCommandBubble::Dismiss() {
  const bool was_active = widget_ && widget_->IsActive();
  Hide();
  if (was_active && window_->widget()) {
    window_->widget()->Activate();
  }
}

void RailCommandBubble::Hide() {
  waiting_ready_ = false;
  waiting_first_frame_ = false;
  if (!showing_) {
    return;
  }
  showing_ = false;
  if (shadow_) {
    shadow_->Hide();
  }
  if (widget_) {
    widget_->Hide();
  }
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RailCommandBubble::DestroyWidget,
                                weak_factory_.GetWeakPtr()));
}

void RailCommandBubble::DestroyWidget() {
  if (showing_ || waiting_ready_ || !widget_) {
    return;
  }
  observation_.Reset();
  if (web_view_) {
    web_view_->SetWebContents(nullptr);
    web_view_ = nullptr;
  }
  shadow_.reset();
  backdrop_.reset();
  widget_.reset();
}

void RailCommandBubble::ResizeDueToAutoResize(content::WebContents* source,
                                              const gfx::Size& new_size) {
  content_size_ = new_size;
  PositionWidget(new_size);
}

content::WebContents* RailCommandBubble::OpenURLFromTab(
    content::WebContents* source,
    const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)>
        navigation_handle_callback) {
  Dismiss();
  return OpenFromShell(window_->browser(), params,
                       std::move(navigation_handle_callback));
}

void RailCommandBubble::OnWidgetActivationChanged(views::Widget* widget,
                                                  bool active) {
  if (!active) {
    Hide();
  }
}

void RailCommandBubble::OnWidgetDestroying(views::Widget* widget) {
  observation_.Reset();
  showing_ = false;
}

}
