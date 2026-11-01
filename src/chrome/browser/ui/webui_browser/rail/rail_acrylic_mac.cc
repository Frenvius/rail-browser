#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"

#include "ui/compositor/layer.h"
#include "ui/views/widget/widget.h"

namespace rail {

std::unique_ptr<SystemBackdropController> ApplyAcrylicBackdrop(
    views::Widget* widget,
    const gfx::Insets& insets) {
  return nullptr;
}

std::unique_ptr<views::Widget> CreateAcrylicShadow(views::Widget* parent,
                                                   views::Widget* target) {
  return nullptr;
}

void RevealAcrylic(views::Widget* target,
                   views::Widget* shadow,
                   SystemBackdropController* backdrop,
                   int start_offset,
                   bool wait_for_frame) {
  if (target && target->GetLayer()) {
    target->GetLayer()->SetOpacity(1.0f);
  }
}

void PrepareMenuWindow(gfx::AcceleratedWidget hwnd, views::Widget* widget) {}

void ConcealMenuWindow(views::Widget* widget) {}

void RevealMenu(views::Widget* target,
                SystemBackdropController* backdrop,
                bool submenu,
                bool from_bottom) {}

void WarmAcrylic(views::Widget* target, SystemBackdropController* backdrop) {
  if (!target) {
    return;
  }
  if (target->GetLayer()) {
    target->GetLayer()->SetOpacity(0.01f);
  }
  target->ShowInactive();
}

}
