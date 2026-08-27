#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"

#include <windows.h>

#include <dwmapi.h>

#include <utility>

#include "base/functional/bind.h"
#include "base/numerics/safe_conversions.h"
#include "base/time/time.h"
#include "cc/paint/paint_canvas.h"
#include "cc/paint/paint_flags.h"
#include "components/viz/common/frame_timing_details.h"
#include "third_party/skia/include/core/SkRRect.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/compositor/compositor.h"
#include "ui/gfx/canvas.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/skia_conversions.h"
#include "ui/gfx/geometry/vector2d.h"
#include "ui/gfx/shadow_value.h"
#include "ui/gfx/animation/tween.h"
#include "ui/gfx/skia_paint_util.h"
#include "ui/views/view.h"
#include "ui/views/widget/widget.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr int kAccentEnableBlurBehind = 3;
constexpr int kWindowCompositionAttributeAccentPolicy = 19;
constexpr int kShadowBlur = 16;
constexpr int kShadowOffsetY = 3;
constexpr SkAlpha kShadowAlpha = 0x33;
constexpr base::TimeDelta kSlideDuration = base::Milliseconds(140);

struct AccentPolicy {
  DWORD state;
  DWORD flags;
  DWORD gradient_color;
  DWORD animation_id;
};

struct WindowCompositionAttributeData {
  DWORD attribute;
  void* data;
  SIZE_T size;
};

using SetWindowCompositionAttributeFn =
    BOOL(WINAPI*)(HWND, WindowCompositionAttributeData*);

void ApplyAcrylicAccent(HWND hwnd) {
  static const auto set_attribute =
      reinterpret_cast<SetWindowCompositionAttributeFn>(::GetProcAddress(
          ::GetModuleHandleW(L"user32.dll"), "SetWindowCompositionAttribute"));
  if (!set_attribute) {
    return;
  }
  AccentPolicy policy = {};
  policy.state = kAccentEnableBlurBehind;
  WindowCompositionAttributeData data = {
      kWindowCompositionAttributeAccentPolicy, &policy, sizeof(policy)};
  set_attribute(hwnd, &data);
}

void ApplyAccentAfterPresent(HWND hwnd, const viz::FrameTimingDetails&) {
  if (::IsWindow(hwnd)) {
    ApplyAcrylicAccent(hwnd);
  }
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

void ApplyAcrylicBackdrop(views::Widget* widget) {
  if (!widget) {
    return;
  }
  HWND hwnd = views::HWNDForWidget(widget);
  if (!hwnd) {
    return;
  }
  const COLORREF border_color = DWMWA_COLOR_NONE;
  ::DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &border_color,
                          sizeof(border_color));

  const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  ::DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner,
                          sizeof(corner));

  ui::Compositor* compositor = widget->GetCompositor();
  if (!compositor) {
    ApplyAcrylicAccent(hwnd);
    return;
  }
  compositor->RequestSuccessfulPresentationTimeForNextFrame(
      base::BindOnce(&ApplyAccentAfterPresent, hwnd));
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

AcrylicSlide::AcrylicSlide(views::Widget* target,
                           views::Widget* shadow,
                           int start_offset)
    : target_(target),
      shadow_(shadow),
      start_offset_(start_offset),
      target_origin_(target->GetWindowBoundsInScreen().origin()),
      shadow_origin_(shadow ? shadow->GetWindowBoundsInScreen().origin()
                            : gfx::Point()),
      animation_(kSlideDuration,
                 gfx::LinearAnimation::kDefaultFrameRate,
                 this) {
  MoveBy(start_offset_);
  animation_.Start();
}

AcrylicSlide::~AcrylicSlide() = default;

void AcrylicSlide::AnimationProgressed(const gfx::Animation* animation) {
  const double eased = gfx::Tween::CalculateValue(
      gfx::Tween::EASE_OUT, animation->GetCurrentValue());
  MoveBy(base::ClampRound(start_offset_ * (1.0 - eased)));
}

void AcrylicSlide::AnimationEnded(const gfx::Animation* animation) {
  MoveBy(0);
}

void AcrylicSlide::MoveBy(int dy) {
  const auto place = [dy](views::Widget* widget, const gfx::Point& origin) {
    if (!widget) {
      return;
    }
    gfx::Rect bounds = widget->GetWindowBoundsInScreen();
    bounds.set_origin(origin + gfx::Vector2d(0, dy));
    widget->SetBounds(bounds);
  };
  place(target_, target_origin_);
  place(shadow_, shadow_origin_);
}

}
