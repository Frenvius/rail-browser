#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_SKIN_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_SKIN_H_

#include <map>
#include <memory>
#include <set>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_multi_source_observation.h"
#include "base/scoped_observation.h"
#include "chrome/browser/ui/webui_browser/rail/rail_system_backdrop_controller.h"
#include "ui/aura/env.h"
#include "ui/aura/env_observer.h"
#include "ui/gfx/geometry/point.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_observer.h"

namespace views {
class MenuItemView;
}

namespace rail {

inline constexpr int kMenuMaxWidth = 456;

class MenuSkin : public views::WidgetObserver, public aura::EnvObserver {
 public:
  MenuSkin(views::Widget* parent,
           views::MenuItemView* root,
           const gfx::Point& anchor,
           bool cap_width);
  MenuSkin(const MenuSkin&) = delete;
  MenuSkin& operator=(const MenuSkin&) = delete;
  ~MenuSkin() override;

  const gfx::Point& anchor() const { return anchor_; }

  void Attach();
  void Style(views::MenuItemView* item);
  void Release();

  void OnWidgetBoundsChanged(views::Widget* widget,
                             const gfx::Rect& new_bounds) override;
  void OnWidgetVisibilityChanged(views::Widget* widget, bool visible) override;
  void OnWidgetDestroying(views::Widget* widget) override;
  void OnHostInitialized(aura::WindowTreeHost* host) override;

 private:
  void StyleShown(views::Widget* widget);
  void RefreshClip(views::Widget* widget);
  void CloseHiddenSubmenu(views::Widget* widget);

  raw_ptr<views::Widget> parent_;
  raw_ptr<views::MenuItemView> root_;
  const gfx::Point anchor_;
  const bool cap_width_;
  std::map<views::Widget*, std::unique_ptr<SystemBackdropController>>
      backdrops_;
  std::map<views::Widget*, raw_ptr<views::MenuItemView>> submenu_items_;
  std::set<views::Widget*> revealed_;
  base::ScopedMultiSourceObservation<views::Widget, views::WidgetObserver>
      observations_{this};
  base::ScopedObservation<aura::Env, aura::EnvObserver> env_observation_{this};
  base::WeakPtrFactory<MenuSkin> weak_factory_{this};
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_SKIN_H_
