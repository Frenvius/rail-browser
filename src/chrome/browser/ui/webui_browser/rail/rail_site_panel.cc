#include "chrome/browser/ui/webui_browser/rail/rail_site_panel.h"

#include <algorithm>
#include <string>
#include <string_view>
#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_site_panel_ui.h"
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

constexpr int kPanelWidth = 292;
constexpr int kPanelMinHeight = 48;
constexpr int kPanelMargin = 8;
constexpr int kPanelSlideDistance = 12;
constexpr base::TimeDelta kFirstFrameTimeout = base::Milliseconds(250);
constexpr base::TimeDelta kReopenGuard = base::Milliseconds(300);

}

class RailSitePanel::Contents : public WebUIContentsWrapper {
 public:
  Contents(const GURL& url, Profile* profile)
      : WebUIContentsWrapper(url,
                             profile,
                             IDS_TASK_MANAGER_BACKGROUND_PREFIX,
                             true,
                             true,
                             false,
                             std::string_view()),
        url_(url) {
    if (RailSitePanelUI* controller = GetController()) {
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
    if (RailSitePanelUI* controller = GetController()) {
      controller->set_embedder(weak_ptr_factory_.GetWeakPtr());
    }
  }

  base::WeakPtr<WebUIContentsWrapper> GetWeakPtr() override {
    return weak_ptr_factory_.GetWeakPtr();
  }

  RailSitePanelUI* GetController() {
    content::WebUI* const webui = web_contents()->GetWebUI();
    return webui && webui->GetController()
               ? webui->GetController()->GetAs<RailSitePanelUI>()
               : nullptr;
  }

 private:
  const GURL url_;
  base::WeakPtrFactory<WebUIContentsWrapper> weak_ptr_factory_{this};
};

RailSitePanel::RailSitePanel(WebUIBrowserWindow* window) : window_(window) {}

RailSitePanel::~RailSitePanel() {
  showing_ = false;
  waiting_ready_ = false;
  DestroyWidget();
}

void RailSitePanel::DestroyWidget() {
  if (showing_ || waiting_ready_) {
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
  content_size_ = gfx::Size();
}

void RailSitePanel::EnsureContents() {
  if (contents_) {
    return;
  }
  contents_ = std::make_unique<Contents>(GURL(kRailSitePanelURL),
                                         window_->browser()->profile());
  webui::SetBrowserWindowInterface(contents_->web_contents(),
                                   window_->browser());
  contents_->SetHost(weak_factory_.GetWeakPtr());
}

RailSitePanelUI* RailSitePanel::controller() {
  return contents_ ? contents_->GetController() : nullptr;
}

void RailSitePanel::Show(const gfx::Point& anchor,
                         const std::string& space_color) {
  if (showing_ || base::TimeTicks::Now() - hidden_at_ < kReopenGuard) {
    Dismiss();
    return;
  }
  anchor_ = anchor;
  EnsureContents();
  CreateWidget();
  if (!widget_) {
    return;
  }
  PositionWidget(content_size_);
  if (RailSitePanelUI* ui = controller()) {
    ui->set_ready_callback(base::BindRepeating(&RailSitePanel::OnPageReady,
                                               weak_factory_.GetWeakPtr()));
    const gfx::Rect area = window_->widget()->GetClientAreaBoundsInScreen();
    ui->Open(gfx::Point(area.x() + anchor_.x(), area.y() + anchor_.y()),
             space_color);
  }
  waiting_ready_ = true;
  contents_->web_contents()->WasShown();
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&RailSitePanel::OnPageReady, weak_factory_.GetWeakPtr(),
                     0),
      kFirstFrameTimeout);
}

void RailSitePanel::OnPageReady(int height) {
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
      base::BindOnce(&RailSitePanel::OnFirstFrame,
                     weak_factory_.GetWeakPtr()));
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&RailSitePanel::OnFirstFrame, weak_factory_.GetWeakPtr(),
                     false),
      kFirstFrameTimeout);
}

void RailSitePanel::OnFirstFrame(bool) {
  if (!waiting_first_frame_) {
    return;
  }
  waiting_first_frame_ = false;
  ShowUI();
}

void RailSitePanel::CreateWidget() {
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
  params.bounds = gfx::Rect(gfx::Size(kPanelWidth, kPanelMinHeight));

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

void RailSitePanel::PositionWidget(const gfx::Size& contents_size) {
  if (!widget_) {
    return;
  }
  const gfx::Rect area = window_->widget()->GetClientAreaBoundsInScreen();
  const int height = contents_size.height() > 0 ? contents_size.height()
                                                : kPanelMinHeight;
  gfx::Rect bounds(area.x() + anchor_.x() - kPanelWidth / 2,
                   area.y() + anchor_.y(), kPanelWidth, height);
  bounds.set_x(std::clamp(bounds.x(), area.x() + kPanelMargin,
                          std::max(area.x() + kPanelMargin,
                                   area.right() - kPanelWidth - kPanelMargin)));
  bounds.set_y(std::clamp(bounds.y(), area.y() + kPanelMargin,
                          std::max(area.y() + kPanelMargin,
                                   area.bottom() - height - kPanelMargin)));
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

void RailSitePanel::ShowUI() {
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
  widget_->Show();
  shadow_->ShowInactive();
  RevealAcrylic(widget_.get(), shadow_.get(), backdrop_.get(),
                -kPanelSlideDistance);
  widget_->Activate();
  if (web_view_) {
    web_view_->RequestFocus();
  }
}

void RailSitePanel::CloseUI() {
  Dismiss();
}

void RailSitePanel::Dismiss() {
  const bool was_active = widget_ && widget_->IsActive();
  Hide();
  if (was_active && window_->widget()) {
    window_->widget()->Activate();
  }
}

void RailSitePanel::Hide() {
  waiting_ready_ = false;
  waiting_first_frame_ = false;
  if (!showing_) {
    return;
  }
  showing_ = false;
  hidden_at_ = base::TimeTicks::Now();
  if (shadow_) {
    shadow_->Hide();
  }
  if (widget_) {
    widget_->Hide();
  }
  if (RailSitePanelUI* ui = controller()) {
    ui->Closed();
  }
  contents_->web_contents()->WasHidden();
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RailSitePanel::DestroyWidget,
                                weak_factory_.GetWeakPtr()));
}

void RailSitePanel::ResizeDueToAutoResize(content::WebContents* source,
                                          const gfx::Size& new_size) {
  content_size_ = new_size;
  PositionWidget(new_size);
}

content::WebContents* RailSitePanel::OpenURLFromTab(
    content::WebContents* source,
    const content::OpenURLParams& params,
    base::OnceCallback<void(content::NavigationHandle&)>
        navigation_handle_callback) {
  Dismiss();
  return OpenFromShell(window_->browser(), params,
                       std::move(navigation_handle_callback));
}

void RailSitePanel::OnWidgetActivationChanged(views::Widget* widget,
                                              bool active) {
  if (!active) {
    Hide();
  }
}

void RailSitePanel::OnWidgetDestroying(views::Widget* widget) {
  observation_.Reset();
  showing_ = false;
}

}
