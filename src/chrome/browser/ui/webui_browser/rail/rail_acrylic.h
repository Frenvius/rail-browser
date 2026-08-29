#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_

#include <memory>

#include "chrome/browser/ui/webui_browser/rail/rail_system_backdrop_controller.h"
#include "ui/gfx/geometry/insets.h"

namespace views {
class Widget;
}

namespace rail {

inline constexpr int kAcrylicCornerRadius = 8;
inline constexpr int kAcrylicShadowMargin = 16;
inline constexpr int kAcrylicSlideDistance = 40;

std::unique_ptr<SystemBackdropController> ApplyAcrylicBackdrop(
    views::Widget* widget,
    const gfx::Insets& insets = gfx::Insets());

std::unique_ptr<views::Widget> CreateAcrylicShadow(views::Widget* parent,
                                                   views::Widget* target);

void RevealAcrylic(views::Widget* target,
                   views::Widget* shadow,
                   SystemBackdropController* backdrop,
                   int start_offset);

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ACRYLIC_H_
