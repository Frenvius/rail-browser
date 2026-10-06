#include "chrome/browser/ui/webui_browser/rail/rail_page_color.h"

#include <algorithm>
#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/numerics/safe_conversions.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/security_state/content/content_utils.h"
#include "components/tabs/public/tab_interface.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/document_user_data.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/render_widget_host.h"
#include "content/public/browser/render_widget_host_observer.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/weak_document_ptr.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_user_data.h"
#include "mojo/public/cpp/bindings/associated_receiver.h"
#include "third_party/blink/public/common/associated_interfaces/associated_interface_registry.h"
#include "third_party/blink/renderer/core/rail/top_band_color.mojom.h"
#include "third_party/blink/renderer/core/rail/top_band_color_sampler.h"

namespace rail {

namespace {

bool IsPageColorAllowed(content::WebContents* contents) {
  auto security = security_state::GetVisibleSecurityState(contents);
  auto level = security_state::GetSecurityLevel(*security);
  return level == security_state::NONE || level == security_state::SECURE;
}

class CommittedPageColor
    : public content::WebContentsUserData<CommittedPageColor> {
 public:
  std::optional<SkColor> color;
  content::WeakDocumentPtr document;
  bool allowed = false;
  bool has_sampled = false;

 private:
  explicit CommittedPageColor(content::WebContents* contents)
      : WebContentsUserData(*contents) {}

  friend WebContentsUserData;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

WEB_CONTENTS_USER_DATA_KEY_IMPL(CommittedPageColor);

class TopBandColorDocument
    : public content::DocumentUserData<TopBandColorDocument>,
      public mojom::TopBandColorHost,
      public content::RenderWidgetHost::InputEventObserver,
      public content::RenderWidgetHostObserver {
 public:
  ~TopBandColorDocument() override {
    if (widget_) {
      widget_->RemoveInputEventObserver(this);
      widget_->RemoveObserver(this);
    }
  }

  void Bind(mojo::PendingAssociatedReceiver<mojom::TopBandColorHost> receiver) {
    receiver_.reset();
    receiver_.Bind(std::move(receiver));
  }

  std::optional<SkColor> color() const { return color_; }

  void SetTopBandColor(mojom::TopBandColorStatePtr state) override {
    if (!state->needs_sampling) {
      requested_.reset();
      Report(state->reuse_last_sample && sampled_color_ ? sampled_color_
                                                        : state->color);
      return;
    }
    requested_ = std::move(state);
    SampleIfNeeded();
  }

  void OnInputEvent(const content::RenderWidgetHost&,
                    const blink::WebInputEvent& event,
                    InputEventSource) override {
    if (event.GetType() == blink::WebInputEvent::Type::kGestureScrollBegin) {
      scrolling_ = true;
      discard_capture_ = capturing_.has_value();
    } else if (event.GetType() ==
               blink::WebInputEvent::Type::kGestureScrollEnd) {
      scrolling_ = false;
      SampleIfNeeded();
    }
  }

  void RenderWidgetHostDestroyed(content::RenderWidgetHost* widget) override {
    widget->RemoveInputEventObserver(this);
    widget->RemoveObserver(this);
    widget_ = nullptr;
    capturing_.reset();
    weak_factory_.InvalidateWeakPtrs();
  }

 private:
  explicit TopBandColorDocument(content::RenderFrameHost* render_frame_host)
      : DocumentUserData(render_frame_host),
        widget_(render_frame_host->GetRenderWidgetHost()) {
    auto* contents =
        content::WebContents::FromRenderFrameHost(render_frame_host);
    if (contents && contents->GetPrimaryMainFrame() == render_frame_host) {
      CommittedPageColor::GetOrCreateForWebContents(contents)->has_sampled =
          false;
    }
    if (widget_) {
      widget_->AddInputEventObserver(this);
      widget_->AddObserver(this);
    }
  }

  void Report(std::optional<SkColor> color) {
    if (has_reported_ && color_ == color) {
      return;
    }
    color_ = color;
    has_reported_ = true;
    PageColorTracker::OnTopBandColorChanged(&render_frame_host());
  }

  void SampleIfNeeded() {
    if (!requested_ || scrolling_ || capturing_) {
      return;
    }
    uint64_t token = requested_->sample_token;
    if (sampled_token_ == token) {
      requested_.reset();
      Report(sampled_color_);
      return;
    }
    content::RenderWidgetHostView* view = render_frame_host().GetView();
    if (!view || view->GetViewBounds().width() <= 0) {
      return;
    }
    capturing_ = token;
    discard_capture_ = false;
    view->CopyFromSurface(
        gfx::Rect(0, 0, view->GetViewBounds().width(), kSampleBandHeight),
        gfx::Size(), base::TimeDelta(),
        base::BindOnce(&TopBandColorDocument::OnSampled,
                       weak_factory_.GetWeakPtr(), token,
                       view->GetDeviceScaleFactor()));
  }

  void OnSampled(uint64_t token,
                 float scale,
                 const content::CopyFromSurfaceResult& result) {
    if (capturing_ != token) {
      return;
    }
    capturing_.reset();
    bool discard = std::exchange(discard_capture_, false);
    if (!discard && !scrolling_ && requested_ &&
        requested_->sample_token == token) {
      sampled_token_ = token;
      sampled_color_ =
          result.has_value()
              ? FlatBandColor(
                    result->bitmap,
                    std::max(1, base::ClampRound(kSampleBandHeight * scale)),
                    base::ClampRound(kSampleRightInset * scale))
              : std::nullopt;
      requested_.reset();
      Report(sampled_color_);
    }
    SampleIfNeeded();
  }

  friend DocumentUserData;
  DOCUMENT_USER_DATA_KEY_DECL();

  mojo::AssociatedReceiver<mojom::TopBandColorHost> receiver_{this};
  raw_ptr<content::RenderWidgetHost> widget_ = nullptr;
  mojom::TopBandColorStatePtr requested_;
  std::optional<uint64_t> capturing_;
  std::optional<uint64_t> sampled_token_;
  std::optional<SkColor> sampled_color_;
  std::optional<SkColor> color_;
  bool scrolling_ = false;
  bool discard_capture_ = false;
  bool has_reported_ = false;
  base::WeakPtrFactory<TopBandColorDocument> weak_factory_{this};
};

DOCUMENT_USER_DATA_KEY_IMPL(TopBandColorDocument);

std::set<PageColorTracker*>& Trackers() {
  static base::NoDestructor<std::set<PageColorTracker*>> trackers;
  return *trackers;
}

}

void RegisterTopBandColorHost(content::RenderFrameHost& render_frame_host,
                              blink::AssociatedInterfaceRegistry& registry) {
  registry.AddInterface<mojom::TopBandColorHost>(base::BindRepeating(
      [](content::RenderFrameHost* render_frame_host,
         mojo::PendingAssociatedReceiver<mojom::TopBandColorHost> receiver) {
        TopBandColorDocument::GetOrCreateForCurrentDocument(render_frame_host)
            ->Bind(std::move(receiver));
      },
      &render_frame_host));
}

void PageColorTracker::OnTopBandColorChanged(
    content::RenderFrameHost* render_frame_host) {
  auto* contents = content::WebContents::FromRenderFrameHost(render_frame_host);
  if (!contents || contents->GetPrimaryMainFrame() != render_frame_host) {
    return;
  }
  auto* document =
      TopBandColorDocument::GetForCurrentDocument(render_frame_host);
  if (!document) {
    return;
  }
  auto* committed = CommittedPageColor::GetOrCreateForWebContents(contents);
  bool animated = committed->has_sampled;
  committed->color = document->color();
  committed->document = render_frame_host->GetWeakDocumentPtr();
  committed->allowed = IsPageColorAllowed(contents);
  committed->has_sampled = committed->color.has_value();
  for (PageColorTracker* tracker : Trackers()) {
    if (tracker->web_contents() == contents) {
      tracker->Report(animated);
    }
  }
}

PageColorTracker::PageColorTracker(TabStripModel* model, Callback callback)
    : callback_(std::move(callback)) {
  Trackers().insert(this);
  model->AddObserver(this);
  Track(model->GetActiveWebContents());
}

PageColorTracker::~PageColorTracker() {
  Trackers().erase(this);
}

void PageColorTracker::OnTabStripModelChanged(
    TabStripModel* model,
    const TabStripModelChange& change,
    const TabStripSelectionChange& selection) {
  if (selection.active_tab_changed()) {
    Track(selection.new_contents);
  }
}

void PageColorTracker::DidChangeVisibleSecurityState() {
  Report();
}

void PageColorTracker::Track(content::WebContents* contents) {
  has_reported_ = false;
  Observe(contents);
  if (contents) {
    Report();
  }
}

void PageColorTracker::Report(std::optional<bool> animated) {
  content::WebContents* contents = web_contents();
  tabs::TabInterface* tab =
      contents ? tabs::TabInterface::MaybeGetFromContents(contents) : nullptr;
  if (!tab) {
    return;
  }
  auto* committed = CommittedPageColor::FromWebContents(contents);
  std::optional<SkColor> color = committed ? committed->color : std::nullopt;
  if (color) {
    if (committed->document.AsRenderFrameHostIfValid() ==
        contents->GetPrimaryMainFrame()) {
      committed->allowed = IsPageColorAllowed(contents);
    }
    if (!committed->allowed) {
      color.reset();
    }
  }
  if (animated && !color) {
    animated = false;
  }
  if (has_reported_ && reported_ == color &&
      (!animated || reported_animation_ == animated)) {
    return;
  }
  has_reported_ = true;
  reported_ = color;
  reported_animation_ = animated;
  callback_.Run(tabs_api::NodeId::FromTabHandle(tab->GetHandle()), color,
                animated);
}

}
