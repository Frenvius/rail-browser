#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"

#include <windows.h>

#include <dwmapi.h>

#include <utility>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/memory/weak_ptr.h"
#include "base/task/single_thread_task_runner.h"
#include "base/time/time.h"
#include "cc/paint/paint_canvas.h"
#include "cc/paint/paint_flags.h"
#include "components/viz/common/frame_timing_details.h"
#include "third_party/skia/include/core/SkRRect.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/compositor/compositor.h"
#include "ui/compositor/layer.h"
#include "ui/compositor/layer_animator.h"
#include "ui/compositor/scoped_layer_animation_settings.h"
#include "ui/gfx/animation/tween.h"
#include "ui/gfx/canvas.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/skia_conversions.h"
#include "ui/gfx/geometry/transform.h"
#include "ui/gfx/geometry/vector2d.h"
#include "ui/gfx/shadow_value.h"
#include "ui/gfx/skia_paint_util.h"
#include "ui/views/view.h"
#include "ui/views/widget/widget.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr int kShadowBlur = 16;
constexpr int kShadowOffsetY = 3;
constexpr SkAlpha kShadowAlpha = 0x33;
constexpr base::TimeDelta kSlideDuration = base::Milliseconds(100);
constexpr float kHiddenOpacity = 0.01f;

void NeutralizeDwmFrame(HWND hwnd) {
  if (!hwnd) {
    return;
  }
  const COLORREF none = DWMWA_COLOR_NONE;
  ::DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &none, sizeof(none));
  ::DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &none, sizeof(none));
  const DWM_SYSTEMBACKDROP_TYPE no_backdrop = DWMSBT_NONE;
  ::DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &no_backdrop,
                          sizeof(no_backdrop));
}

SystemBackdropConfig PopupBackdropConfig() {
  SystemBackdropConfig config;
  config.material = SystemBackdropMaterial::kAcrylic;
  config.tint_color = SkColorSetRGB(0x14, 0x14, 0x14);
  config.fallback_color = SkColorSetRGB(0x1c, 0x1c, 0x1c);
  config.tint_opacity = 0.55f;
  config.luminosity_opacity = 0.85f;
  config.popup = true;
  config.corner_radius = kAcrylicCornerRadius;
  return config;
}

class ShadowView : public views::View {
  METADATA_HEADER(ShadowView, views::View)

 public:
  ShadowView() = default;
  ShadowView(const ShadowView&) = delete;
  ShadowView& operator=(const ShadowView&) = delete;
  ~ShadowView() override = default;

 protected:
  void OnPaint(gfx::Canvas* canvas) override {
    gfx::Rect bounds = GetLocalBounds();
    bounds.Inset(kAcrylicShadowMargin);
    const SkRRect rounded =
        SkRRect::MakeRectXY(gfx::RectToSkRect(bounds), kAcrylicCornerRadius,
                            kAcrylicCornerRadius);

    cc::PaintFlags flags;
    flags.setAntiAlias(true);
    flags.setStyle(cc::PaintFlags::kFill_Style);
    flags.setColor(SK_ColorBLACK);
    flags.setLooper(gfx::CreateShadowDrawLooper(
        {gfx::ShadowValue(gfx::Vector2d(0, kShadowOffsetY), kShadowBlur,
                          SkColorSetA(SK_ColorBLACK, kShadowAlpha))}));

    cc::PaintCanvas* sk_canvas = canvas->sk_canvas();
    sk_canvas->save();
    sk_canvas->clipRRect(rounded, SkClipOp::kDifference, true);
    sk_canvas->drawRRect(rounded, flags);
    sk_canvas->restore();
  }
};

BEGIN_METADATA(ShadowView)
END_METADATA

}

std::unique_ptr<SystemBackdropController> ApplyAcrylicBackdrop(
    views::Widget* widget,
    const gfx::Insets& insets) {
  if (!widget) {
    return nullptr;
  }
  HWND hwnd = views::HWNDForWidget(widget);
  if (!hwnd) {
    return nullptr;
  }
  NeutralizeDwmFrame(hwnd);

  const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_DONOTROUND;
  ::DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner,
                          sizeof(corner));

  SystemBackdropConfig config = PopupBackdropConfig();
  config.popup_insets = insets;
  return SystemBackdropController::Create(widget, config);
}

std::unique_ptr<views::Widget> CreateAcrylicShadow(views::Widget* parent,
                                                   views::Widget* target) {
  if (!parent || !target) {
    return nullptr;
  }
  gfx::Rect bounds = target->GetWindowBoundsInScreen();
  bounds.Inset(-kAcrylicShadowMargin);

  views::Widget::InitParams params(
      views::Widget::InitParams::WIDGET_OWNS_NATIVE_WIDGET,
      views::Widget::InitParams::TYPE_MENU);
  params.opacity = views::Widget::InitParams::WindowOpacity::kTranslucent;
  params.shadow_type = views::Widget::InitParams::ShadowType::kNone;
  params.activatable = views::Widget::InitParams::Activatable::kNo;
  params.accept_events = false;
  params.parent = parent->GetNativeView();
  params.bounds = bounds;

  auto shadow = std::make_unique<views::Widget>();
  shadow->Init(std::move(params));
  shadow->SetContentsView(std::make_unique<ShadowView>());
  shadow->SetVisibilityChangedAnimationsEnabled(false);
  shadow->GetLayer()->SetOpacity(kHiddenOpacity);
  NeutralizeDwmFrame(views::HWNDForWidget(shadow.get()));
  shadow->ShowInactive();

  HWND shadow_hwnd = views::HWNDForWidget(shadow.get());
  HWND target_hwnd = views::HWNDForWidget(target);
  if (shadow_hwnd && target_hwnd) {
    ::SetWindowPos(target_hwnd, HWND_TOP, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    ::SetWindowPos(shadow_hwnd, target_hwnd, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
  return shadow;
}

namespace {

void HideLayer(views::Widget* widget, int start_offset) {
  ui::Layer* layer = widget ? widget->GetLayer() : nullptr;
  if (!layer) {
    return;
  }
  gfx::Transform start;
  start.Translate(0, start_offset);
  layer->SetTransform(start);
  layer->SetOpacity(kHiddenOpacity);
}

void AnimateLayer(views::Widget* widget) {
  ui::Layer* layer = widget ? widget->GetLayer() : nullptr;
  if (!layer) {
    return;
  }
  ui::ScopedLayerAnimationSettings settings(layer->GetAnimator());
  settings.SetTransitionDuration(kSlideDuration);
  settings.SetTweenType(gfx::Tween::EASE_OUT_3);
  settings.SetPreemptionStrategy(
      ui::LayerAnimator::IMMEDIATELY_ANIMATE_TO_NEW_TARGET);
  layer->SetTransform(gfx::Transform());
  layer->SetOpacity(1.0f);
}

void StartReveal(base::WeakPtr<views::Widget> target,
                 base::WeakPtr<views::Widget> shadow,
                 base::WeakPtr<SystemBackdropController> backdrop,
                 int start_offset,
                 const viz::FrameTimingDetails&) {
  if (backdrop) {
    backdrop->PlayReveal(static_cast<float>(start_offset), kSlideDuration);
  }
  AnimateLayer(target.get());
  AnimateLayer(shadow.get());
}

}  // namespace

void WarmAcrylic(views::Widget* target, SystemBackdropController* backdrop) {
  if (!target) {
    return;
  }
  HideLayer(target, 0);
  if (backdrop) {
    backdrop->HideReveal();
  }
  HWND hwnd = views::HWNDForWidget(target);
  if (hwnd) {
    ::SetWindowLongPtr(hwnd, GWL_EXSTYLE,
                       ::GetWindowLongPtr(hwnd, GWL_EXSTYLE) |
                           WS_EX_TRANSPARENT | WS_EX_NOACTIVATE);
  }
  target->ShowInactive();
}

void RevealAcrylic(views::Widget* target,
                   views::Widget* shadow,
                   SystemBackdropController* backdrop,
                   int start_offset,
                   bool wait_for_frame) {
  if (!target) {
    return;
  }
  HWND hwnd = views::HWNDForWidget(target);
  if (hwnd) {
    ::SetWindowLongPtr(hwnd, GWL_EXSTYLE,
                       ::GetWindowLongPtr(hwnd, GWL_EXSTYLE) &
                           ~(WS_EX_TRANSPARENT | WS_EX_NOACTIVATE));
  }
  HideLayer(target, start_offset);
  HideLayer(shadow, start_offset);
  base::WeakPtr<views::Widget> shadow_weak =
      shadow ? shadow->GetWeakPtr() : base::WeakPtr<views::Widget>();
  base::WeakPtr<SystemBackdropController> backdrop_weak =
      backdrop ? backdrop->GetWeakPtr()
               : base::WeakPtr<SystemBackdropController>();
  ui::Compositor* compositor = target->GetCompositor();
  if (!wait_for_frame || !compositor) {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE,
        base::BindOnce(&StartReveal, target->GetWeakPtr(), shadow_weak,
                       backdrop_weak, start_offset,
                       viz::FrameTimingDetails()));
    return;
  }
  compositor->RequestSuccessfulPresentationTimeForNextFrame(
      base::BindOnce(&StartReveal, target->GetWeakPtr(), shadow_weak,
                     backdrop_weak, start_offset));
}

}  // namespace rail
