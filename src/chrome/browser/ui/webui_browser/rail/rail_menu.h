#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_H_

#include <map>
#include <memory>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/webui_browser/browser.mojom.h"

namespace ui {
class SimpleMenuModel;
}

namespace views {
class MenuItemView;
class MenuModelAdapter;
class MenuRunner;
class Widget;
}

namespace rail {

class RailMenu {
 public:
  RailMenu(base::RepeatingCallback<void(const std::string&)> on_command,
           base::RepeatingClosure on_closed);
  RailMenu(const RailMenu&) = delete;
  RailMenu& operator=(const RailMenu&) = delete;
  ~RailMenu();

  void ShowAtCursor(
      views::Widget* parent,
      const std::vector<webui_browser::mojom::RailMenuItemPtr>& items);

 private:
  class Delegate;
  class Adapter;

  struct SwatchRow {
    int id;
    std::string command;
    std::vector<std::string> colors;
    std::string selected;
  };

  void Fill(ui::SimpleMenuModel* model,
            const std::vector<webui_browser::mojom::RailMenuItemPtr>& items);
  void Decorate();
  void StyleSubmenu(views::MenuItemView* item);
  void AddShadow(views::MenuItemView* item, views::Widget* menu_widget);
  void HideShadow(views::MenuItemView* item);
  void CloseShadows();
  void OnClosed();
  void OnSwatchPicked(const std::string& command, const std::string& color);

  std::unique_ptr<Delegate> delegate_;
  std::unique_ptr<ui::SimpleMenuModel> model_;
  std::vector<std::unique_ptr<ui::SimpleMenuModel>> submodels_;
  std::unique_ptr<Adapter> adapter_;
  std::unique_ptr<views::MenuRunner> runner_;
  std::vector<int> danger_ids_;
  std::vector<SwatchRow> swatch_rows_;
  base::RepeatingCallback<void(const std::string&)> on_command_;
  base::RepeatingClosure on_closed_;
  raw_ptr<views::MenuItemView> root_ = nullptr;
  raw_ptr<views::Widget> parent_ = nullptr;
  std::map<views::MenuItemView*, std::unique_ptr<views::Widget>> shadows_;
  base::WeakPtrFactory<RailMenu> weak_factory_{this};
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MENU_H_
