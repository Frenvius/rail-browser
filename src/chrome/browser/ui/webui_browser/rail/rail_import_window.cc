#include "chrome/browser/ui/webui_browser/rail/rail_import_window.h"

#if BUILDFLAG(IS_WIN)
#include <windows.h>
#endif

#include <string_view>
#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_ui.h"
#include "chrome/browser/ui/webui_browser/rail/rail_window_frame.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/generated_resources.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/common/referrer.h"
#include "third_party/skia/include/core/SkColor.h"
#include "third_party/skia/include/core/SkPath.h"
#include "third_party/skia/include/core/SkRegion.h"
#include "ui/aura/window.h"
#include "ui/base/hit_test.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/controls/webview/webview.h"
#include "ui/views/window/client_view.h"
#include "ui/views/window/frame_view.h"

#if BUILDFLAG(IS_WIN)
#include "ui/views/win/hwnd_util.h"
#endif

namespace rail {

namespace {

constexpr int kWindowWidth = 912;
constexpr int kWindowHeight = 535;
#if BUILDFLAG(IS_WIN)
constexpr SkColor kTintColor = SkColorSetRGB(0x0b, 0x0e, 0x1a);
#endif

class FramelessFrameView : public views::FrameView {
  METADATA_HEADER(FramelessFrameView, views::FrameView)

 public:
  FramelessFrameView() = default;
  FramelessFrameView(const FramelessFrameView&) = delete;
  FramelessFrameView& operator=(const FramelessFrameView&) = delete;
  ~FramelessFrameView() override = default;

  gfx::Rect GetBoundsForClientView() const override { return GetLocalBounds(); }

  gfx::Rect GetWindowBoundsForClientBounds(
      const gfx::Rect& client_bounds) const override {
    return client_bounds;
  }

  int NonClientHitTest(const gfx::Point& point) override {
    views::Widget* widget = GetWidget();
    return widget && widget->client_view()
               ? widget->client_view()->NonClientHitTest(point)
               : HTNOWHERE;
  }
};

BEGIN_METADATA(FramelessFrameView)
END_METADATA

class FixedSizeDelegate : public views::WidgetDelegate {
 public:
  FixedSizeDelegate() = default;
  FixedSizeDelegate(const FixedSizeDelegate&) = delete;
  FixedSizeDelegate& operator=(const FixedSizeDelegate&) = delete;
  ~FixedSizeDelegate() override = default;

  bool ExecuteWindowsCommand(int command_id) override {
#if BUILDFLAG(IS_WIN)
    const int command = command_id & 0xFFF0;
    return command == SC_MAXIMIZE || command == SC_SIZE;
#else
    return false;
#endif
  }
};

}

class RailImportWindow::ClientView : public views::ClientView {
  METADATA_HEADER(ClientView, views::ClientView)

 public:
  ClientView(views::Widget* widget, views::View* contents_view)
      : views::ClientView(widget, contents_view) {}

  ClientView(const ClientView&) = delete;
  ClientView& operator=(const ClientView&) = delete;

  ~ClientView() override {
#if BUILDFLAG(IS_WIN)
    if (event_target_) {
      event_target_->RemovePreTargetHandler(this);
      event_target_ = nullptr;
    }
#endif
    set_contents_view(nullptr);
  }

  void SetDraggableRegion(const SkRegion& region) { draggable_region_ = region; }

  void AddedToWidget() override {
    views::ClientView::AddedToWidget();
#if BUILDFLAG(IS_WIN)
    event_target_ = GetWidget()->GetNativeView();
    event_target_->AddPreTargetHandler(this);
#endif
  }

  void OnMouseEvent(ui::MouseEvent* event) override {
#if BUILDFLAG(IS_WIN)
    HandleFramelessMouseEvent(GetWidget(), event);
#endif
  }

  int NonClientHitTest(const gfx::Point& point) override {
    if (draggable_region_.contains(point.x(), point.y())) {
      return HTCAPTION;
    }
    return views::ClientView::NonClientHitTest(point);
  }

 private:
  SkRegion draggable_region_;
#if BUILDFLAG(IS_WIN)
  raw_ptr<aura::Window> event_target_ = nullptr;
#endif
};

BEGIN_METADATA(RailImportWindow, ClientView)
END_METADATA

class RailImportWindow::Contents : public WebUIContentsWrapper {
 public:
  Contents(const GURL& url, Profile* profile)
      : WebUIContentsWrapper(url,
                             profile,
                             IDS_TASK_MANAGER_BACKGROUND_PREFIX,
                             false,
                             true,
                             true,
                             std::string_view()),
        url_(url) {
    if (RailImportUI* controller = GetController()) {
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
    if (RailImportUI* controller = GetController()) {
      controller->set_embedder(weak_ptr_factory_.GetWeakPtr());
    }
  }

  base::WeakPtr<WebUIContentsWrapper> GetWeakPtr() override {
    return weak_ptr_factory_.GetWeakPtr();
  }

  RailImportUI* GetController() {
    content::WebUI* const webui = web_contents()->GetWebUI();
    return webui && webui->GetController()
               ? webui->GetController()->GetAs<RailImportUI>()
               : nullptr;
  }

 private:
  const GURL url_;
  base::WeakPtrFactory<WebUIContentsWrapper> weak_ptr_factory_{this};
};

RailImportWindow::RailImportWindow(WebUIBrowserWindow* window, const GURL& url)
    : window_(window), url_(url) {}

RailImportWindow::~RailImportWindow() {
  observation_.Reset();
  if (web_view_) {
    web_view_->SetWebContents(nullptr);
    web_view_ = nullptr;
  }
#if BUILDFLAG(IS_WIN)
  backdrop_.reset();
#endif
  widget_.reset();
}

void RailImportWindow::EnsureContents() {
  if (contents_) {
    return;
  }
  contents_ = std::make_unique<Contents>(url_, window_->browser()->GetProfile());
  webui::SetBrowserWindowInterface(contents_->web_contents(),
                                   window_->browser());
  contents_->SetHost(weak_factory_.GetWeakPtr());
}

void RailImportWindow::CreateWidget() {
  if (widget_) {
    return;
  }
  views::Widget* parent = window_->widget();
  if (!parent) {
    return;
  }

  auto web_view =
      std::make_unique<views::WebView>(window_->browser()->GetProfile());
  web_view->SetWebContents(contents_->web_contents());
  web_view->SetBackground(nullptr);
  web_view_ = web_view.get();

  delegate_ = std::make_unique<FixedSizeDelegate>();
  delegate_->SetContentsView(std::move(web_view));
  delegate_->SetCanResize(false);
  delegate_->SetCanMaximize(false);
  delegate_->SetCanFullscreen(false);
  delegate_->SetTitle(u"Rail Import");
  delegate_->SetShowTitle(false);
  delegate_->SetClientViewFactory(base::BindOnce(
      [](RailImportWindow* owner, views::Widget* widget,
         views::View* contents_view) -> std::unique_ptr<views::ClientView> {
        auto client = std::make_unique<ClientView>(widget, contents_view);
        client->SetDraggableRegion(owner->draggable_region_);
        owner->client_view_ = client.get();
        return client;
      },
      base::Unretained(this)));
  delegate_->SetFrameViewFactory(base::BindRepeating(
      [](views::Widget* widget) -> std::unique_ptr<views::FrameView> {
        return std::make_unique<FramelessFrameView>();
      }));

  views::Widget::InitParams params(
      views::Widget::InitParams::CLIENT_OWNS_WIDGET,
      views::Widget::InitParams::TYPE_WINDOW);
  params.opacity = views::Widget::InitParams::WindowOpacity::kTranslucent;
  params.remove_standard_frame = true;
  params.activatable = views::Widget::InitParams::Activatable::kYes;
  params.delegate = delegate_.get();
  params.context = parent->GetNativeWindow();

  const gfx::Rect area = parent->GetWindowBoundsInScreen();
  params.bounds =
      gfx::Rect(area.x() + (area.width() - kWindowWidth) / 2,
                area.y() + (area.height() - kWindowHeight) / 2, kWindowWidth,
                kWindowHeight);

  widget_ = std::make_unique<views::Widget>();
  widget_->Init(std::move(params));

  MakeShellContentsTransparent(contents_->web_contents());
  if (content::RenderWidgetHostView* view =
          contents_->web_contents()->GetRenderWidgetHostView()) {
    view->SetBackgroundColor(SK_ColorTRANSPARENT);
  }

#if BUILDFLAG(IS_WIN)
  PrepareSystemBackdropWindow(widget_.get());
  SystemBackdropConfig config;
  config.material = SystemBackdropMaterial::kMicaAlt;
  config.tint_color = kTintColor;
  config.fallback_color = kTintColor;
  config.tint_opacity = 0.6f;
  config.luminosity_opacity = 0.6f;
  backdrop_ = SystemBackdropController::Create(widget_.get(), config);

  if (HWND hwnd = views::HWNDForWidget(widget_.get())) {
    const LONG style = ::GetWindowLong(hwnd, GWL_STYLE);
    ::SetWindowLong(hwnd, GWL_STYLE, style & ~WS_MAXIMIZEBOX);
    ::SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE |
                       SWP_FRAMECHANGED);
  }
#endif

  observation_.Observe(widget_.get());
}

void RailImportWindow::Show() {
  EnsureContents();
  CreateWidget();
  ShowUI();
}

void RailImportWindow::ShowUI() {
  if (!widget_) {
    return;
  }
  widget_->Show();
  widget_->Activate();
  if (web_view_) {
    web_view_->RequestFocus();
  }
}

void RailImportWindow::CloseUI() {
  if (widget_) {
    widget_->Hide();
  }
}

void RailImportWindow::DraggableRegionsChanged(
    const std::vector<blink::mojom::DraggableRegionPtr>& regions,
    content::WebContents* contents) {
  SkRegion region;
  for (const blink::mojom::DraggableRegionPtr& entry : regions) {
    region.op(SkIRect::MakeXYWH(entry->bounds.x(), entry->bounds.y(),
                                entry->bounds.width(), entry->bounds.height()),
              entry->draggable ? SkRegion::kUnion_Op : SkRegion::kDifference_Op);
  }
  draggable_region_.swap(region);
  if (client_view_) {
    client_view_->SetDraggableRegion(draggable_region_);
  }
}

void RailImportWindow::OnWidgetActivationChanged(views::Widget* widget,
                                                 bool active) {
#if BUILDFLAG(IS_WIN)
  if (backdrop_) {
    backdrop_->SetActive(active);
  }
#endif
}

void RailImportWindow::OnWidgetDestroying(views::Widget* widget) {
  observation_.Reset();
  client_view_ = nullptr;
}

}
