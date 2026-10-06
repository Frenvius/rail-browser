#include "third_party/blink/renderer/core/rail/top_band_color_tracker.h"

#include <algorithm>
#include <array>
#include <optional>
#include <utility>

#include "base/time/time.h"
#include "cc/paint/paint_flags.h"
#include "cc/paint/paint_image.h"
#include "cc/paint/skia_paint_canvas.h"
#include "third_party/blink/public/common/associated_interfaces/associated_interface_provider.h"
#include "third_party/blink/public/platform/task_type.h"
#include "third_party/blink/renderer/core/css/properties/longhands.h"
#include "third_party/blink/renderer/core/dom/document.h"
#include "third_party/blink/renderer/core/dom/element.h"
#include "third_party/blink/renderer/core/dom/events/native_event_listener.h"
#include "third_party/blink/renderer/core/event_type_names.h"
#include "third_party/blink/renderer/core/frame/local_dom_window.h"
#include "third_party/blink/renderer/core/frame/local_frame.h"
#include "third_party/blink/renderer/core/frame/local_frame_view.h"
#include "third_party/blink/renderer/core/html/html_image_element.h"
#include "third_party/blink/renderer/core/layout/hit_test_location.h"
#include "third_party/blink/renderer/core/layout/hit_test_request.h"
#include "third_party/blink/renderer/core/layout/hit_test_result.h"
#include "third_party/blink/renderer/core/layout/layout_box_model_object.h"
#include "third_party/blink/renderer/core/layout/layout_image.h"
#include "third_party/blink/renderer/core/layout/layout_object.h"
#include "third_party/blink/renderer/core/layout/layout_view.h"
#include "third_party/blink/renderer/core/loader/resource/image_resource_content.h"
#include "third_party/blink/renderer/core/page/chrome_client.h"
#include "third_party/blink/renderer/core/page/page.h"
#include "third_party/blink/renderer/core/paint/paint_layer_scrollable_area.h"
#include "third_party/blink/renderer/core/paint/timing/paint_timing.h"
#include "third_party/blink/renderer/core/rail/top_band_color.mojom-blink.h"
#include "third_party/blink/renderer/core/rail/top_band_color_sampler.h"
#include "third_party/blink/renderer/core/style/computed_style.h"
#include "third_party/blink/renderer/core/style/fill_layer.h"
#include "third_party/blink/renderer/core/style/style_image.h"
#include "third_party/blink/renderer/platform/graphics/color.h"
#include "third_party/blink/renderer/platform/graphics/graphics_context.h"
#include "third_party/blink/renderer/platform/graphics/image.h"
#include "third_party/blink/renderer/platform/heap/collection_support/heap_vector.h"
#include "third_party/blink/renderer/platform/heap/persistent.h"
#include "third_party/blink/renderer/platform/mojo/heap_mojo_associated_remote.h"
#include "third_party/blink/renderer/platform/supplementable.h"
#include "third_party/blink/renderer/platform/timer.h"
#include "third_party/blink/renderer/platform/wtf/functional.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "third_party/skia/include/core/SkImage.h"
#include "ui/gfx/geometry/point_f.h"
#include "ui/gfx/geometry/rect_f.h"
#include "ui/gfx/geometry/size.h"
#include "ui/gfx/geometry/size_f.h"

namespace blink {

namespace {

constexpr base::TimeDelta kDetectionInterval = base::Milliseconds(100);
constexpr base::TimeDelta kImageSampleLifetime = base::Milliseconds(1500);
constexpr float kProbeY = 1;
constexpr size_t kProbeColumns = 4;
constexpr int kMinBandHeight = 10;
constexpr int kMaxRasterDimension = 800;
constexpr float kOpaqueAlpha = 1.f;

class LayerStack {
 public:
  bool Add(const Color& color, float opacity) {
    SkColor4f rgba = color.toSkColor4f();
    float layer = rgba.fA * opacity;
    float weight = (1 - alpha_) * layer;
    red_ += weight * rgba.fR;
    green_ += weight * rgba.fG;
    blue_ += weight * rgba.fB;
    alpha_ += weight;
    return alpha_ >= kOpaqueAlpha;
  }

  Color Value() const {
    return Color::FromRGBAFloat(red_, green_, blue_, alpha_);
  }

 private:
  float red_ = 0;
  float green_ = 0;
  float blue_ = 0;
  float alpha_ = 0;
};

std::optional<SkColor> RasterBandColor(Image& image, const gfx::Size& box) {
  gfx::RectF source(image.Rect());
  if (box.IsEmpty() || source.IsEmpty()) {
    return std::nullopt;
  }
  int width = std::min(box.width(), kMaxRasterDimension);
  int height = std::min(box.height(), kMaxRasterDimension);
  gfx::SizeF target(width, height);
  SkBitmap bitmap;
  if (!bitmap.tryAllocN32Pixels(width, height)) {
    return std::nullopt;
  }
  bitmap.eraseColor(SK_ColorTRANSPARENT);
  {
    cc::SkiaPaintCanvas canvas(bitmap);
    image.Draw(&canvas, cc::PaintFlags(), gfx::RectF(target), source,
               ImageDrawOptions());
  }
  return ::rail::FlatBandColor(bitmap);
}

std::optional<SkColor> BitmapBandColor(Image& image) {
  sk_sp<SkImage> pixels = image.PaintImageForCurrentFrame().GetSwSkImage();
  SkBitmap bitmap;
  if (!pixels || !pixels->asLegacyBitmap(&bitmap)) {
    return std::nullopt;
  }
  return ::rail::FlatBandColor(bitmap);
}

struct Probe {
  STACK_ALLOCATED();

 public:
  const LayoutObject* key = nullptr;
  Color color;
  uint64_t sample_token = 0;
};

struct ChosenState {
  std::optional<Color> color;
  uint64_t sample_token = 0;
  bool reuse_last_sample = false;
  bool wait_for_presentation = false;

  bool operator==(const ChosenState&) const = default;
};

struct Ballot {
  STACK_ALLOCATED();

 public:
  const LayoutObject* key = nullptr;
  Color color;
  uint64_t sample_token = 0;
  int votes = 0;
};

class TopBandColorFrameState final
    : public GarbageCollected<TopBandColorFrameState>,
      public Supplement<LocalFrame> {
 public:
  static constexpr char kSupplementName[] = "TopBandColorFrameState";

  explicit TopBandColorFrameState(LocalFrame& frame) : Supplement(frame) {}

  void Trace(Visitor* visitor) const override {
    Supplement<LocalFrame>::Trace(visitor);
  }

  bool fallback_allowed = false;
};

class TopBandColorTracker final
    : public NativeEventListener,
      public Supplement<Document>,
      public LocalFrameView::LifecycleNotificationObserver {
 public:
  static constexpr char kSupplementName[] = "TopBandColorTracker";

  TopBandColorTracker(Document& document, TopBandColorFrameState& frame_state)
      : Supplement<Document>(document),
        frame_state_(&frame_state),
        host_(document.GetExecutionContext()),
        timer_(document.GetTaskRunner(TaskType::kInternalDefault),
               this,
               &TopBandColorTracker::OnTimer) {}

  void Invoke(ExecutionContext*, Event*) override {
    if (LocalFrameView* view = GetSupplementable()->View()) {
      view->ScheduleAnimation();
    }
  }

  void DidFinishLifecycleUpdate(const LocalFrameView&) override {
    UpdateFallbackEligibility();
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
    NativeEventListener::Trace(visitor);
    visitor->Trace(frame_state_);
    visitor->Trace(host_);
    visitor->Trace(timer_);
    visitor->Trace(image_samples_);
  }

 private:
  struct ImageSample final : public GarbageCollected<ImageSample> {
    ImageSample(const LayoutObject& object,
                scoped_refptr<Image> image,
                std::optional<SkColor> color)
        : object(&object),
          style(object.Style()),
          image(std::move(image)),
          box(object.AbsoluteBoundingBoxRect().size()),
          time(base::TimeTicks::Now()),
          color(color) {}

    void Trace(Visitor* visitor) const {
      visitor->Trace(object);
      visitor->Trace(style);
    }

    Member<const LayoutObject> object;
    Member<const ComputedStyle> style;
    scoped_refptr<Image> image;
    gfx::Size box;
    base::TimeTicks time;
    std::optional<SkColor> color;
    uint64_t sample_token = 0;
  };

  void OnTimer(TimerBase*) {
    if (LocalFrameView* view = GetSupplementable()->View()) {
      view->ScheduleAnimation();
    }
  }

  void UpdateFallbackEligibility() {
    Document* document = GetSupplementable();
    if (!frame_state_->fallback_allowed && document->LoadEventFinished() &&
        !document->BeforeUnloadStarted() &&
        !PaintTiming::From(*document).FirstPaintRendered().is_null()) {
      frame_state_->fallback_allowed = true;
    }
  }

  void Detect() {
    Document* document = GetSupplementable();
    LocalFrame* frame = document->GetFrame();
    LocalFrameView* view = document->View();
    if (!frame || !view || document->IsPrerendering() ||
        document->Lifecycle().GetState() < DocumentLifecycle::kPrePaintClean) {
      return;
    }
    last_detection_ = base::TimeTicks::Now();
    ExpireImageSamples();
    std::optional<ChosenState> state =
        view->GetLayoutView() ? ChooseColor(*view) : ChosenState{};
    if (state) {
      Emit(*state);
    }
  }

  void Emit(const ChosenState& state) {
    if (pending_ == state) {
      return;
    }
    pending_.reset();
    ++generation_;
    if (sent_ == state) {
      return;
    }
    LocalFrame* frame = GetSupplementable()->GetFrame();
    if ((state.sample_token || state.wait_for_presentation) && frame &&
        frame->GetPage()) {
      pending_ = state;
      frame->GetPage()->GetChromeClient().NotifyPresentationTime(
          *frame, BindOnce(&TopBandColorTracker::OnPresented,
                           WrapWeakPersistent(this), generation_));
      return;
    }
    Publish(state);
  }

  void OnPresented(uint64_t generation, const viz::FrameTimingDetails&) {
    if (generation != generation_ || !pending_) {
      return;
    }
    ChosenState state = *pending_;
    pending_.reset();
    Publish(state);
  }

  void Publish(const ChosenState& state) {
    LocalFrame* frame = GetSupplementable()->GetFrame();
    if (!frame || frame->GetDocument() != GetSupplementable() ||
        sent_ == state) {
      return;
    }
    if (!host_.is_bound()) {
      frame->GetRemoteNavigationAssociatedInterfaces()->GetInterface(
          host_.BindNewEndpointAndPassReceiver(
              GetSupplementable()->GetTaskRunner(TaskType::kInternalDefault)));
    }
    auto message = rail::mojom::blink::TopBandColorState::New();
    message->color = state.color ? std::optional<uint32_t>(state.color->Rgb())
                                 : std::nullopt;
    message->needs_sampling = state.sample_token != 0;
    message->sample_token = state.sample_token;
    message->reuse_last_sample = state.reuse_last_sample;
    message->transition =
        sent_.has_value() &&
        (state.color || state.sample_token || state.reuse_last_sample);
    host_->SetTopBandColor(std::move(message));
    sent_ = state;
  }

  std::optional<ChosenState> ChooseColor(LocalFrameView& view) {
    int width = view.Size().width();
    if (width <= 0) {
      return ChosenState{};
    }
    int quarter = width / 4;
    const std::array<int, kProbeColumns> columns = {0, quarter, 2 * quarter,
                                                    3 * quarter};
    std::array<Ballot, kProbeColumns> ballots;
    size_t ballot_count = 0;
    int document_votes = 0;
    std::optional<Color> document_color;
    bool reuse_last_sample = false;
    bool viewport_probes = false;
    for (int x : columns) {
      std::optional<Probe> probe =
          ProbeColumn(view, x, viewport_probes, reuse_last_sample);
      if (!probe) {
        continue;
      }
      if (!probe->key) {
        ++document_votes;
        document_color = probe->color;
        continue;
      }
      auto end = ballots.begin() + ballot_count;
      auto it = std::find_if(ballots.begin(), end, [&](const Ballot& ballot) {
        return ballot.key == probe->key;
      });
      if (it == end) {
        ballots[ballot_count++] =
            Ballot{probe->key, probe->color, probe->sample_token, 1};
      } else {
        ++it->votes;
      }
    }
    const Ballot* winner = nullptr;
    for (size_t i = 0; i < ballot_count; ++i) {
      if (!winner || ballots[i].votes > winner->votes) {
        winner = &ballots[i];
      }
    }
    if (document_color && (!winner || document_votes > winner->votes)) {
      return ChosenState{document_color, 0, reuse_last_sample};
    }
    if (winner) {
      return ChosenState{winner->sample_token
                             ? std::nullopt
                             : std::optional<Color>(winner->color),
                         winner->sample_token, reuse_last_sample};
    }
    Color background = view.DocumentBackgroundColor();
    if (background.IsOpaque() && !frame_state_->fallback_allowed) {
      return std::nullopt;
    }
    return ChosenState{background.IsOpaque()
                           ? std::optional<Color>(
                                 Color::FromSkColor4f(background.toSkColor4f()))
                           : std::nullopt,
                       0, reuse_last_sample, background.IsOpaque()};
  }

  const LayoutObject* Qualify(const Node& node, int width) const {
    if (!IsA<Element>(node)) {
      return nullptr;
    }
    const LayoutObject* object = node.GetLayoutObject();
    if (!object || object->IsLayoutView() || object->IsAnonymous() ||
        object->IsText()) {
      return nullptr;
    }
    const ComputedStyle& style = object->StyleRef();
    if (style.Visibility() != EVisibility::kVisible || style.Opacity() <= 0) {
      return nullptr;
    }
    gfx::Rect bounds = object->AbsoluteBoundingBoxRect();
    if (bounds.width() < width / 3 || bounds.height() <= kMinBandHeight ||
        (bounds.x() > 0 && bounds.right() < width)) {
      return nullptr;
    }
    return object;
  }

  bool HasViewportBand(LocalFrameView& view,
                       const HitTestLocation& location,
                       const HitTestRequest& request) const {
    HitTestResult result(request, location);
    view.GetLayoutView()->HitTestNoLifecycleUpdate(location, result);
    for (const auto& node : result.ListBasedTestResult()) {
      const LayoutObject* object = Qualify(*node, view.Size().width());
      if (!object) {
        continue;
      }
      for (; object && !object->IsLayoutView(); object = object->Container()) {
        if (object->IsFixedPositioned()) {
          return true;
        }
        if (object->IsStickyPositioned()) {
          const auto* model = To<LayoutBoxModelObject>(object);
          if (!model->StickyPositionOffset().IsZero()) {
            return true;
          }
        }
      }
      break;
    }
    return false;
  }

  std::optional<Probe> ProbeColumn(LocalFrameView& view,
                                   int x,
                                   bool& viewport_probes,
                                   bool& reuse_last_sample) {
    HitTestRequest request(HitTestRequest::kReadOnly | HitTestRequest::kActive |
                           HitTestRequest::kIgnoreClipping |
                           HitTestRequest::kIgnorePointerEventsNone |
                           HitTestRequest::kIgnoreZeroOpacityObjects |
                           HitTestRequest::kListBased |
                           HitTestRequest::kPenetratingList);
    PhysicalOffset point =
        PhysicalOffset::FromPointFRound(gfx::PointF(x, kProbeY));
    if (!viewport_probes && view.LayoutViewport() &&
        view.LayoutViewport()->GetScrollOffset().y() > 0) {
      viewport_probes = HasViewportBand(view, HitTestLocation(point), request);
    }
    HitTestLocation location(viewport_probes ? point
                                             : view.DocumentToFrame(point));
    HitTestResult result(request, location);
    view.GetLayoutView()->HitTestNoLifecycleUpdate(location, result);
    if (result.ListBasedTestResult().empty()) {
      return std::nullopt;
    }
    LayerStack stack;
    Probe probe;
    for (const auto& node : result.ListBasedTestResult()) {
      const LayoutObject* object = Qualify(*node, view.Size().width());
      if (!object) {
        continue;
      }
      const auto* element = To<Element>(node.Get());
      if (element->localName() == AtomicString("ytd-masthead")) {
        StringView host = GetSupplementable()->Url().Host();
        if (host == "youtube.com" || host.ends_with(".youtube.com")) {
          continue;
        }
      }
      const ComputedStyle& style = object->StyleRef();
      auto* model = DynamicTo<LayoutBoxModelObject>(object);
      if (model && model->BackgroundTransfersToView()) {
        continue;
      }
      gfx::Rect bounds = object->AbsoluteBoundingBoxRect();
      if (ImageSample* sample = ImageColor(*object, bounds.size())) {
        if (sample->color && SkColorGetA(*sample->color) == SK_AlphaOPAQUE) {
          probe.key = probe.key ? probe.key : object;
          if (stack.Add(Color::FromSkColor(*sample->color), style.Opacity())) {
            probe.color = stack.Value();
            return probe;
          }
        } else {
          if (!sample->sample_token && view.LayoutViewport() &&
              view.LayoutViewport()->GetScrollOffset().y() > 0) {
            reuse_last_sample = true;
          } else {
            if (!sample->sample_token) {
              sample->sample_token = ++sample_token_;
            }
            return Probe{
                probe.key ? probe.key : object, {}, sample->sample_token};
          }
        }
      }
      Color background =
          style.VisitedDependentColor(GetCSSPropertyBackgroundColor());
      if (background.IsFullyTransparent()) {
        continue;
      }
      probe.key = probe.key ? probe.key : object;
      if (stack.Add(background, style.Opacity())) {
        probe.color = stack.Value();
        return probe;
      }
    }
    Color document = view.DocumentBackgroundColor();
    if (!document.IsOpaque()) {
      return std::nullopt;
    }
    stack.Add(document, 1);
    probe.color = stack.Value();
    return probe;
  }

  ImageSample* ImageColor(const LayoutObject& object, const gfx::Size& box) {
    scoped_refptr<Image> image;
    bool generated = false;
    const auto* layout_image = DynamicTo<LayoutImage>(object);
    const auto* image_element = DynamicTo<HTMLImageElement>(object.GetNode());
    ImageResourceContent* resource = layout_image ? layout_image->CachedImage()
                                     : image_element
                                         ? image_element->CachedImage()
                                         : nullptr;
    if (layout_image || (resource && resource->ErrorOccurred())) {
      if (resource && resource->IsLoaded()) {
        image = resource->GetImage();
      }
    } else if (object.GetNode()) {
      for (const FillLayer* layer = &object.StyleRef().BackgroundLayers();
           layer; layer = layer->Next()) {
        StyleImage* style_image = layer->GetImage();
        if (!style_image) {
          continue;
        }
        if (!style_image->CanRender() || !style_image->IsLoaded()) {
          continue;
        }
        generated = style_image->IsGeneratedImage();
        gfx::Size target =
            generated ? gfx::Size(std::min(box.width(), kMaxRasterDimension),
                                  std::min(box.height(), kMaxRasterDimension))
                      : box;
        image = style_image->GetImage(object, *object.GetNode(),
                                      object.StyleRef(), gfx::SizeF(target));
        if (image) {
          break;
        }
      }
    }
    if (!image) {
      return nullptr;
    }
    for (const auto& sample : image_samples_) {
      if (sample->object == &object && sample->style == object.Style() &&
          sample->image == image && sample->box == box) {
        return sample.Get();
      }
    }
    std::optional<SkColor> color =
        generated ? RasterBandColor(*image, box) : BitmapBandColor(*image);
    auto* sample =
        MakeGarbageCollected<ImageSample>(object, std::move(image), color);
    image_samples_.push_back(sample);
    return sample;
  }

  void ExpireImageSamples() {
    base::TimeTicks now = base::TimeTicks::Now();
    EraseIf(image_samples_, [&](const Member<ImageSample>& sample) {
      return now - sample->time > kImageSampleLifetime;
    });
  }

  Member<TopBandColorFrameState> frame_state_;
  HeapMojoAssociatedRemote<rail::mojom::blink::TopBandColorHost> host_;
  HeapTaskRunnerTimer<TopBandColorTracker> timer_;
  HeapVector<Member<ImageSample>> image_samples_;
  base::TimeTicks last_detection_;
  std::optional<ChosenState> sent_;
  std::optional<ChosenState> pending_;
  uint64_t generation_ = 0;
  uint64_t sample_token_ = 0;
};

}

void InstallTopBandColorTracker(Document& document) {
  LocalFrame* frame = document.GetFrame();
  LocalFrameView* view = document.View();
  if (!frame || !frame->IsOutermostMainFrame() || !view) {
    return;
  }
  auto* frame_state =
      Supplement<LocalFrame>::From<TopBandColorFrameState>(*frame);
  if (!frame_state) {
    frame_state = MakeGarbageCollected<TopBandColorFrameState>(*frame);
    Supplement<LocalFrame>::ProvideTo(*frame, frame_state);
  }
  auto* tracker =
      MakeGarbageCollected<TopBandColorTracker>(document, *frame_state);
  Supplement<Document>::ProvideTo(document, tracker);
  view->RegisterForLifecycleNotifications(tracker);
  document.domWindow()->addEventListener(event_type_names::kLoad, tracker,
                                         false);
}

}
