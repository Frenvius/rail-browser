#include "chrome/browser/ui/webui_browser/rail/rail_app_menu_model.h"

#include "chrome/app/chrome_command_ids.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"

namespace rail {

RailAppMenuModel::RailAppMenuModel(ui::AcceleratorProvider* provider,
                                   Browser* browser,
                                   WebUIBrowserWindow* window)
    : AppMenuModel(provider, browser), window_(window) {}

RailAppMenuModel::~RailAppMenuModel() = default;

void RailAppMenuModel::ExecuteCommand(int command_id, int event_flags) {
  if (command_id == IDC_NEW_TAB && window_ &&
      window_->OpenCommandBarForNewTab()) {
    return;
  }
  AppMenuModel::ExecuteCommand(command_id, event_flags);
}

}
