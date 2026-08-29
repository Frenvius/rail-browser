#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_

#include <memory>

#include "base/memory/raw_ptr.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/gfx/animation/animation_delegate.h"
#include "ui/gfx/animation/linear_animation.h"
#include "ui/gfx/geometry/point.h"

namespace views {
class Widget;
}

namespace rail {

inline constexpr SkColor kAcrylicTint = SkColorSetARGB(0xB0, 0x14, 0x14, 0x14);
inline constexpr int kAcrylicCornerRadius = 8;
inline constexpr int kAcrylicShadowMargin = 16;
inline constexpr int kAcrylicSlideDistance = 28;

void ApplyAcrylicBackdrop(views::Widget* widget);

std::unique_ptr<views::Widget> CreateAcrylicShadow(views::Widget* parent,
                                                   views::Widget* target);

class AcrylicSlide : public gfx::AnimationDelegate {
 public:
  AcrylicSlide(views::Widget* target, views::Widget* shadow, int start_offset);
  AcrylicSlide(const AcrylicSlide&) = delete;
  AcrylicSlide& operator=(const AcrylicSlide&) = delete;
  ~AcrylicSlide() override;

  void AnimationProgressed(const gfx::Animation* animation) override;
  void AnimationEnded(const gfx::Animation* animation) override;

 private:
  void MoveBy(int dy);

  raw_ptr<views::Widget> target_;
  raw_ptr<views::Widget> shadow_;
  const int start_offset_;
  const gfx::Point target_origin_;
  const gfx::Point shadow_origin_;
  gfx::LinearAnimation animation_;
};

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_
