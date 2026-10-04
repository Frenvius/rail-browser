#include "chrome/browser/ui/webui_browser/rail/rail_page_color.h"

#include <memory>
#include <set>
#include <vector>

#include "base/functional/bind.h"
#include "base/no_destructor.h"
#include "base/supports_user_data.h"
#include "base/time/time.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "components/tabs/public/tab_interface.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/document_user_data.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/visibility.h"
#include "content/public/browser/web_contents.h"
#include "mojo/public/cpp/bindings/associated_receiver.h"
#include "third_party/blink/public/common/associated_interfaces/associated_interface_registry.h"
#include "third_party/blink/renderer/core/rail/top_band_color.mojom.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"

namespace rail {

namespace {

const char kCachedPageColorKey[] = "rail_page_color";
constexpr int kSampleHeight = 4;
constexpr base::TimeDelta kPollInterval = base::Milliseconds(150);
constexpr base::TimeDelta kCopyTimeout = base::Seconds(1);

struct CachedPageColor : public base::SupportsUserData::Data {
  explicit CachedPageColor(SkColor color) : color(color) {}
  SkColor color;
};

class TopBandColorDocument
    : public content::DocumentUserData<TopBandColorDocument>,
      public mojom::TopBandColorHost {
 public:
  ~TopBandColorDocument() override = default;

  void Bind(mojo::PendingAssociatedReceiver<mojom::TopBandColorHost> receiver) {
    receiver_.reset();
    receiver_.Bind(std::move(receiver));
  }

  std::optional<SkColor> color() const { return color_; }

  void SetTopBandColor(std::optional<uint32_t> color) override {
    color_ = color;
    PageColorTracker::OnTopBandColorChanged(&render_frame_host());
  }

 private:
  explicit TopBandColorDocument(content::RenderFrameHost* render_frame_host)
      : DocumentUserData(render_frame_host) {}

  friend DocumentUserData;
  DOCUMENT_USER_DATA_KEY_DECL();

  mojo::AssociatedReceiver<mojom::TopBandColorHost> receiver_{this};
  std::optional<SkColor> color_;
};

DOCUMENT_USER_DATA_KEY_IMPL(TopBandColorDocument);

std::set<PageColorTracker*>& Trackers() {
  static base::NoDestructor<std::set<PageColorTracker*>> trackers;
  return *trackers;
}

std::optional<SkColor> CachedColor(content::WebContents* contents) {
  auto* cached = static_cast<CachedPageColor*>(
      contents->GetUserData(kCachedPageColorKey));
  return cached ? std::optional<SkColor>(cached->color) : std::nullopt;
}

std::optional<SkColor> SolidColor(content::WebContents* contents) {
  auto* document = TopBandColorDocument::GetForCurrentDocument(
      contents->GetPrimaryMainFrame());
  return document ? document->color() : std::nullopt;
}

bool HasPainted(content::WebContents* contents) {
  return contents->CompletedFirstVisuallyNonEmptyPaint() ||
         TopBandColorDocument::GetForCurrentDocument(
             contents->GetPrimaryMainFrame()) != nullptr;
}

std::optional<SkColor> DominantColor(const SkBitmap& bitmap) {
  struct Bucket {
    int count = 0;
    int64_t r = 0;
    int64_t g = 0;
    int64_t b = 0;
  };
  std::vector<Bucket> buckets(4096);
  int best = -1;
  for (int y = 0; y < bitmap.height(); ++y) {
    for (int x = 0; x < bitmap.width(); ++x) {
      SkColor color = bitmap.getColor(x, y);
      if (SkColorGetA(color) != SK_AlphaOPAQUE) {
        continue;
      }
      int key = (SkColorGetR(color) >> 4) << 8 |
                (SkColorGetG(color) >> 4) << 4 | SkColorGetB(color) >> 4;
      Bucket& bucket = buckets[key];
      ++bucket.count;
      bucket.r += SkColorGetR(color);
      bucket.g += SkColorGetG(color);
      bucket.b += SkColorGetB(color);
      if (best < 0 || bucket.count > buckets[best].count) {
        best = key;
      }
    }
  }
  if (best < 0) {
    return std::nullopt;
  }
  const Bucket& bucket = buckets[best];
  return SkColorSetRGB(static_cast<U8CPU>(bucket.r / bucket.count),
                       static_cast<U8CPU>(bucket.g / bucket.count),
                       static_cast<U8CPU>(bucket.b / bucket.count));
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
  for (PageColorTracker* tracker : Trackers()) {
    content::WebContents* contents = tracker->web_contents();
    if (contents && contents->GetPrimaryMainFrame() == render_frame_host) {
      tracker->Refresh();
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

void PageColorTracker::DidFirstVisuallyNonEmptyPaint() {
  Refresh();
}

void PageColorTracker::PrimaryPageChanged(content::Page& page) {
  Refresh();
}

void PageColorTracker::Track(content::WebContents* contents) {
  weak_factory_.InvalidateWeakPtrs();
  capturing_ = false;
  poll_timer_.Stop();
  has_reported_ = false;
  Observe(contents);
  if (!contents) {
    return;
  }
  if (HasPainted(contents) && !SolidColor(contents)) {
    Report(CachedColor(contents));
  }
  Refresh();
}

void PageColorTracker::Refresh() {
  content::WebContents* contents = web_contents();
  if (!contents) {
    return;
  }
  if (!HasPainted(contents)) {
    poll_timer_.Stop();
    Report(std::nullopt);
    return;
  }
  if (std::optional<SkColor> color = SolidColor(contents)) {
    weak_factory_.InvalidateWeakPtrs();
    capturing_ = false;
    poll_timer_.Stop();
    Report(color);
    return;
  }
  Capture();
  if (!poll_timer_.IsRunning()) {
    poll_timer_.Start(FROM_HERE, kPollInterval, this,
                      &PageColorTracker::Capture);
  }
}

void PageColorTracker::Capture() {
  content::WebContents* contents = web_contents();
  if (!contents || capturing_) {
    return;
  }
  if (!HasPainted(contents)) {
    Report(std::nullopt);
    return;
  }
  if (contents->GetVisibility() != content::Visibility::VISIBLE) {
    return;
  }
  content::RenderWidgetHostView* view = contents->GetRenderWidgetHostView();
  if (!view || !view->IsSurfaceAvailableForCopy()) {
    return;
  }
  gfx::Size size = view->GetViewBounds().size();
  if (size.IsEmpty()) {
    return;
  }
  capturing_ = true;
  view->CopyFromSurface(
      gfx::Rect(0, 0, size.width(), kSampleHeight), gfx::Size(), kCopyTimeout,
      base::BindOnce(&PageColorTracker::OnSampled,
                     weak_factory_.GetWeakPtr()));
}

void PageColorTracker::OnSampled(const content::CopyFromSurfaceResult& result) {
  capturing_ = false;
  content::WebContents* contents = web_contents();
  if (!result.has_value() || !contents) {
    return;
  }
  Report(HasPainted(contents) ? DominantColor(result->bitmap) : std::nullopt);
}

void PageColorTracker::Report(std::optional<SkColor> color) {
  content::WebContents* contents = web_contents();
  tabs::TabInterface* tab =
      contents ? tabs::TabInterface::MaybeGetFromContents(contents) : nullptr;
  if (!tab) {
    return;
  }
  if (color && CachedColor(contents) != color) {
    contents->SetUserData(kCachedPageColorKey,
                          std::make_unique<CachedPageColor>(*color));
  }
  if (has_reported_ && reported_ == color) {
    return;
  }
  has_reported_ = true;
  reported_ = color;
  callback_.Run(tabs_api::NodeId::FromTabHandle(tab->GetHandle()), color);
}

}
