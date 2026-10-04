#include "third_party/blink/renderer/core/rail/top_band_color_tracker.h"

#include <optional>

#include "base/numerics/safe_conversions.h"
#include "base/time/time.h"
#include "third_party/blink/public/common/associated_interfaces/associated_interface_provider.h"
#include "third_party/blink/public/platform/task_type.h"
#include "third_party/blink/renderer/core/css/properties/longhands.h"
#include "third_party/blink/renderer/core/dom/document.h"
#include "third_party/blink/renderer/core/frame/local_frame.h"
#include "third_party/blink/renderer/core/frame/local_frame_view.h"
#include "third_party/blink/renderer/core/layout/hit_test_location.h"
#include "third_party/blink/renderer/core/layout/hit_test_request.h"
#include "third_party/blink/renderer/core/layout/hit_test_result.h"
#include "third_party/blink/renderer/core/layout/layout_object.h"
#include "third_party/blink/renderer/core/layout/layout_view.h"
#include "third_party/blink/renderer/core/paint/timing/paint_timing.h"
#include "third_party/blink/renderer/core/rail/top_band_color.mojom-blink.h"
#include "third_party/blink/renderer/core/style/computed_style.h"
#include "third_party/blink/renderer/platform/graphics/color.h"
#include "third_party/blink/renderer/platform/mojo/heap_mojo_associated_remote.h"
#include "third_party/blink/renderer/platform/supplementable.h"
#include "third_party/blink/renderer/platform/timer.h"

namespace blink {

namespace {

constexpr base::TimeDelta kDetectionInterval = base::Milliseconds(100);
constexpr int kProbeY = 1;
constexpr int kMinBandHeight = 10;
constexpr float kOpaqueAlpha = 0.999f;

class LayerStack {
 public:
  bool Add(const Color& color, float opacity) {
    float layer = color.Alpha() * opacity;
    float weight = (1 - alpha_) * layer;
    red_ += weight * color.Red();
    green_ += weight * color.Green();
    blue_ += weight * color.Blue();
    alpha_ += weight;
    return alpha_ >= kOpaqueAlpha;
  }

  uint32_t Rgb() const {
    return Color::FromRGB(base::ClampRound(red_), base::ClampRound(green_),
                          base::ClampRound(blue_))
        .Rgb();
  }

 private:
  float red_ = 0;
  float green_ = 0;
  float blue_ = 0;
  float alpha_ = 0;
};

std::optional<uint32_t> ProbeColor(LocalFrameView& view, int x) {
  HitTestRequest request(HitTestRequest::kReadOnly |
                         HitTestRequest::kIgnorePointerEventsNone |
                         HitTestRequest::kIgnoreZeroOpacityObjects |
                         HitTestRequest::kListBased |
                         HitTestRequest::kPenetratingList);
  HitTestLocation location{PhysicalOffset(LayoutUnit(x), LayoutUnit(kProbeY))};
  HitTestResult result(request, location);
  view.GetLayoutView()->HitTestNoLifecycleUpdate(location, result);
  int min_width = view.Size().width() / 3;
  LayerStack stack;
  for (const auto& node : result.ListBasedTestResult()) {
    LayoutObject* object = node->GetLayoutObject();
    if (!object || object->IsLayoutView() || object->IsAnonymous() ||
        object->IsText()) {
      continue;
    }
    const ComputedStyle& style = object->StyleRef();
    if (style.Visibility() != EVisibility::kVisible) {
      continue;
    }
    gfx::Rect bounds = object->AbsoluteBoundingBoxRect();
    if (bounds.width() < min_width || bounds.height() <= kMinBandHeight) {
      continue;
    }
    if (object->IsLayoutReplaced() || style.HasBackgroundImage()) {
      return std::nullopt;
    }
    Color background =
        style.VisitedDependentColor(GetCSSPropertyBackgroundColor());
    if (!background.IsFullyTransparent() &&
        stack.Add(background, style.Opacity())) {
      return stack.Rgb();
    }
  }
  Color document = view.DocumentBackgroundColor();
  if (!document.IsOpaque()) {
    return std::nullopt;
  }
  stack.Add(document, 1);
  return stack.Rgb();
}

class TopBandColorTracker final
    : public GarbageCollected<TopBandColorTracker>,
      public Supplement<Document>,
      public LocalFrameView::LifecycleNotificationObserver {
 public:
  static constexpr char kSupplementName[] = "TopBandColorTracker";

  explicit TopBandColorTracker(Document& document)
      : Supplement<Document>(document),
        host_(document.GetExecutionContext()),
        timer_(document.GetTaskRunner(TaskType::kInternalDefault),
               this,
               &TopBandColorTracker::OnTimer) {}

  void DidFinishLifecycleUpdate(const LocalFrameView&) override {
    base::TimeDelta elapsed = base::TimeTicks::Now() - last_detection_;
    if (elapsed >= kDetectionInterval) {
      Detect();
    } else if (!timer_.IsActive()) {
      timer_.StartOneShot(kDetectionInterval - elapsed, FROM_HERE);
    }
  }

  void Trace(Visitor* visitor) const override {
    Supplement<Document>::Trace(visitor);
    LocalFrameView::LifecycleNotificationObserver::Trace(visitor);
    visitor->Trace(host_);
    visitor->Trace(timer_);
  }

 private:
  void OnTimer(TimerBase*) {
    if (LocalFrameView* view = GetSupplementable()->View()) {
      view->ScheduleAnimation();
    }
  }

  void Detect() {
    Document* document = GetSupplementable();
    LocalFrame* frame = document->GetFrame();
    LocalFrameView* view = document->View();
    if (!frame || !view || !view->GetLayoutView() ||
        document->IsPrerendering() ||
        PaintTiming::From(*document)
            .FirstContentfulPaintRenderedButNotPresentedAsMonotonicTime()
            .is_null() ||
        document->Lifecycle().GetState() < DocumentLifecycle::kPrePaintClean) {
      return;
    }
    last_detection_ = base::TimeTicks::Now();
    int width = view->Size().width();
    std::optional<uint32_t> left = ProbeColor(*view, width / 4);
    std::optional<uint32_t> color = ProbeColor(*view, width / 2);
    std::optional<uint32_t> right = ProbeColor(*view, width * 3 / 4);
    if (left == right) {
      color = left;
    }
    if (has_sent_ && sent_ == color) {
      return;
    }
    if (!host_.is_bound()) {
      frame->GetRemoteNavigationAssociatedInterfaces()->GetInterface(
          host_.BindNewEndpointAndPassReceiver(
              document->GetTaskRunner(TaskType::kInternalDefault)));
    }
    host_->SetTopBandColor(color);
    has_sent_ = true;
    sent_ = color;
  }

  HeapMojoAssociatedRemote<rail::mojom::blink::TopBandColorHost> host_;
  HeapTaskRunnerTimer<TopBandColorTracker> timer_;
  base::TimeTicks last_detection_;
  std::optional<uint32_t> sent_;
  bool has_sent_ = false;
};

}

void InstallTopBandColorTracker(Document& document) {
  LocalFrame* frame = document.GetFrame();
  LocalFrameView* view = document.View();
  if (!frame || !frame->IsOutermostMainFrame() || !view) {
    return;
  }
  auto* tracker = MakeGarbageCollected<TopBandColorTracker>(document);
  Supplement<Document>::ProvideTo(document, tracker);
  view->RegisterForLifecycleNotifications(tracker);
}

}
