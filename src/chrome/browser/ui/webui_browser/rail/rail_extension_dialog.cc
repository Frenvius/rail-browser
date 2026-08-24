#include "chrome/browser/ui/webui_browser/rail/rail_extension_dialog.h"

#include <utility>

#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "ui/base/models/dialog_model.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/bubble/bubble_anchor.h"
#include "ui/views/bubble/bubble_border.h"
#include "ui/views/bubble/bubble_dialog_delegate_view.h"
#include "ui/views/bubble/bubble_dialog_model_host.h"
#include "ui/views/widget/widget.h"

namespace rail {

namespace {

constexpr int kBubbleInset = 8;

}

bool ShowExtensionDialogBubble(gfx::NativeWindow parent,
                               std::unique_ptr<ui::DialogModel>& dialog_model) {
  WebUIBrowserWindow* window = WebUIBrowserWindow::FromNativeWindow(parent);
  if (!window || !window->widget()) {
    return false;
  }

  const gfx::Rect contents = window->GetContentsBoundsInScreen();
  auto bubble = std::make_unique<views::BubbleDialogModelHost>(
      std::move(dialog_model), views::BubbleAnchor(),
      views::BubbleBorder::TOP_RIGHT);
  bubble->set_parent_window(window->widget()->GetNativeView());
  bubble->SetAnchorRect(gfx::Rect(contents.right() - kBubbleInset,
                                  contents.y() + kBubbleInset, 0, 0));
  views::BubbleDialogDelegate::CreateBubbleDeprecated(
      std::move(bubble), views::Widget::InitParams::NATIVE_WIDGET_OWNS_WIDGET)
      ->Show();
  return true;
}

}
