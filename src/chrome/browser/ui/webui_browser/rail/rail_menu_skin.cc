#include "chrome/browser/ui/webui_browser/rail/rail_menu_skin.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/task/single_thread_task_runner.h"
#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/aura/window_tree_host.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/background.h"
#include "ui/views/controls/menu/menu_item_view.h"
#include "ui/views/controls/menu/menu_scroll_view_container.h"
#include "ui/views/controls/menu/submenu_view.h"
#include "ui/views/widget/desktop_aura/desktop_native_widget_aura.h"

namespace rail {

namespace {

constexpr int kSlideAnchorSlack = 4;
constexpr int kMenuMinWidth = 240;
constexpr char kMenuHostName[] = "MenuHost";

void ApplyMinimumWidth(views::MenuItemView* item) {
  views::SubmenuView* submenu = item->GetSubmenu();
  if (!submenu) {
    return;
  }
  submenu->set_minimum_preferred_width(kMenuMinWidth);
  for (views::MenuItemView* child : submenu->GetMenuItems()) {
    ApplyMinimumWidth(child);
  }
}

views::MenuItemView* FindSubmenuOwner(views::MenuItemView* item,
                                      views::Widget* widget) {
  views::SubmenuView* submenu = item->GetSubmenu();
  if (!submenu) {
    return nullptr;
  }
  if (submenu->GetWidget() == widget) {
    return item;
  }
  for (views::MenuItemView* child : submenu->GetMenuItems()) {
    if (views::MenuItemView* owner = FindSubmenuOwner(child, widget)) {
      return owner;
    }
  }
  return nullptr;
}

}

MenuSkin::MenuSkin(views::Widget* parent,
                   views::MenuItemView* root,
                   const gfx::Point& anchor,
                   bool cap_width)
    : parent_(parent), root_(root), anchor_(anchor), cap_width_(cap_width) {
  ApplyMinimumWidth(root_);
}

MenuSkin::~MenuSkin() {
  Release();
}

void MenuSkin::Attach() {
  if (!env_observation_.IsObserving()) {
    env_observation_.Observe(aura::Env::GetInstance());
  }
}

void MenuSkin::Style(views::MenuItemView* item) {
  views::SubmenuView* submenu = item ? item->GetSubmenu() : nullptr;
  if (!submenu || !submenu->IsShowing()) {
    return;
  }
  views::MenuScrollViewContainer* container = submenu->GetScrollViewContainer();
  views::Widget* menu_widget = submenu->GetWidget();
  if (!menu_widget) {
    return;
  }
  container->SetBackground(views::CreateSolidBackground(SK_ColorTRANSPARENT));
  if (!backdrops_.count(menu_widget)) {
    backdrops_[menu_widget] =
        ApplyAcrylicBackdrop(menu_widget, container->outside_border_insets());
  }
  if (!observations_.IsObservingSource(menu_widget)) {
    observations_.AddObservation(menu_widget);
  }
  submenu_items_[menu_widget] = item;

  const gfx::Rect menu_bounds = menu_widget->GetWindowBoundsInScreen();
  const gfx::Rect window_bounds = parent_->GetWindowBoundsInScreen();
  const int anchor_y =
      item == root_ ? anchor_.y() : item->GetBoundsInScreen().y();
  const int anchor_bottom =
      item == root_ ? anchor_.y() : item->GetBoundsInScreen().bottom();
  gfx::Rect bounds = item == root_
                         ? menu_bounds
                         : gfx::Rect(menu_bounds.origin(),
                                     container->GetPreferredSize({}));
  if (cap_width_) {
    bounds.set_width(std::min(bounds.width(), kMenuMaxWidth));
  }
  const bool constrained_upward = bounds.bottom() > window_bounds.bottom();
  if (constrained_upward) {
    bounds.set_y(std::max(window_bounds.y(), anchor_y - bounds.height()));
  } else if (item != root_) {
    bounds.set_y(item->GetBoundsInScreen().y() -
                 container->GetInsets().top());
  }
  if (bounds.y() < window_bounds.y()) {
    bounds.set_y(window_bounds.y());
  }
  if (bounds != menu_bounds) {
    menu_widget->SetBounds(bounds);
    RefreshClip(menu_widget);
  }
  const bool opens_upward =
      constrained_upward ||
      bounds.bottom() <= anchor_bottom + kSlideAnchorSlack;
  RefreshClip(menu_widget);
  if (revealed_.insert(menu_widget).second) {
    RevealMenu(menu_widget, backdrops_[menu_widget].get(), item != root_,
               opens_upward);
  }
}

void MenuSkin::Release() {
  env_observation_.Reset();
  observations_.RemoveAllObservations();
  for (const auto& [widget, backdrop] : backdrops_) {
    ConcealMenuWindow(widget);
  }
  backdrops_.clear();
  submenu_items_.clear();
  revealed_.clear();
}

void MenuSkin::OnWidgetVisibilityChanged(views::Widget* widget, bool visible) {
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE,
      base::BindOnce(visible ? &MenuSkin::StyleShown
                             : &MenuSkin::CloseHiddenSubmenu,
                     weak_factory_.GetWeakPtr(), widget));
}

void MenuSkin::StyleShown(views::Widget* widget) {
  if (views::MenuItemView* item = FindSubmenuOwner(root_, widget)) {
    Style(item);
  }
}

void MenuSkin::CloseHiddenSubmenu(views::Widget* widget) {
  const auto entry = submenu_items_.find(widget);
  if (entry == submenu_items_.end() || entry->second == root_) {
    return;
  }
  views::SubmenuView* submenu = entry->second->GetSubmenu();
  if (submenu && submenu->GetWidget() == widget && !submenu->IsShowing()) {
    submenu->Close();
  }
}

void MenuSkin::RefreshClip(views::Widget* widget) {
  const auto entry = backdrops_.find(widget);
  if (entry != backdrops_.end() && entry->second) {
    entry->second->UpdateClip();
  }
}

void MenuSkin::OnWidgetBoundsChanged(views::Widget* widget,
                                     const gfx::Rect& new_bounds) {
  RefreshClip(widget);
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&MenuSkin::RefreshClip,
                                weak_factory_.GetWeakPtr(), widget));
}

void MenuSkin::OnWidgetDestroying(views::Widget* widget) {
  const auto entry = submenu_items_.find(widget);
  const bool closing_root =
      entry != submenu_items_.end() && entry->second == root_;
  observations_.RemoveObservation(widget);
  ConcealMenuWindow(widget);
  backdrops_.erase(widget);
  submenu_items_.erase(widget);
  revealed_.erase(widget);
  if (closing_root) {
    Release();
  }
}

void MenuSkin::OnHostInitialized(aura::WindowTreeHost* host) {
  views::DesktopNativeWidgetAura* native_widget =
      views::DesktopNativeWidgetAura::ForWindow(host->window());
  views::Widget* widget =
      native_widget
          ? views::Widget::GetWidgetForNativeView(native_widget->content_window())
          : nullptr;
  if (!widget || widget->GetName() != kMenuHostName) {
    return;
  }
  PrepareMenuWindow(host->GetAcceleratedWidget(), widget);
  if (!observations_.IsObservingSource(widget)) {
    observations_.AddObservation(widget);
  }
}

}
