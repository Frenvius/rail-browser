#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_APP_MENU_MODEL_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_APP_MENU_MODEL_H_

#include "base/memory/raw_ptr.h"
#include "chrome/browser/ui/toolbar/app_menu_model.h"

class Browser;
class WebUIBrowserWindow;

namespace ui {
class AcceleratorProvider;
}

namespace rail {

class RailAppMenuModel : public AppMenuModel {
 public:
  RailAppMenuModel(ui::AcceleratorProvider* provider,
                   Browser* browser,
                   WebUIBrowserWindow* window);
  RailAppMenuModel(const RailAppMenuModel&) = delete;
  RailAppMenuModel& operator=(const RailAppMenuModel&) = delete;
  ~RailAppMenuModel() override;

  void ExecuteCommand(int command_id, int event_flags) override;

 protected:
  void Build() override;

 private:
  raw_ptr<WebUIBrowserWindow> window_;
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_APP_MENU_MODEL_H_
