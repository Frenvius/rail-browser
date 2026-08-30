#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_UI_H_

#include <string>
#include <string_view>

#include "base/functional/callback.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_web_ui_controller.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_webui_config.h"
#include "chrome/browser/ui/webui_browser/browser.mojom.h"
#include "chrome/browser/ui/webui_browser/rail/rail_space_panel.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {
class WebUI;
}

namespace rail {

class RailSpacePanelUI;

inline constexpr char kRailSpacePanelHost[] = "rail-space-panel";
inline constexpr char kRailSpacePanelURL[] = "chrome://rail-space-panel/";

class RailSpacePanelUIConfig
    : public DefaultTopChromeWebUIConfig<RailSpacePanelUI> {
 public:
  RailSpacePanelUIConfig();

  bool ShouldAutoResizeHost() override;
};

class RailSpacePanelUI : public TopChromeWebUIController,
                         public rail_space_panel::mojom::PageHandlerFactory,
                         public rail_space_panel::mojom::PageHandler {
 public:
  explicit RailSpacePanelUI(content::WebUI* web_ui);
  RailSpacePanelUI(const RailSpacePanelUI&) = delete;
  RailSpacePanelUI& operator=(const RailSpacePanelUI&) = delete;
  ~RailSpacePanelUI() override;

  static constexpr std::string_view GetWebUIName() { return "RailSpacePanel"; }

  void BindInterface(
      mojo::PendingReceiver<rail_space_panel::mojom::PageHandlerFactory>
          receiver);

  void Open(webui_browser::mojom::SpacePanelRequestPtr request);

  void set_ready_callback(base::RepeatingCallback<void(int)> callback) {
    ready_callback_ = std::move(callback);
  }

 private:
  void CreatePageHandler(
      mojo::PendingRemote<rail_space_panel::mojom::Page> page,
      mojo::PendingReceiver<rail_space_panel::mojom::PageHandler> handler)
      override;

  void Ready(int32_t height) override;
  void Restyle(const std::string& color, const std::string& icon) override;
  void SetSystemBackdrop(
      webui_browser::mojom::SystemBackdropSettingsPtr settings) override;
  void Close() override;

  std::string space_id_;
  webui_browser::mojom::SpacePanelRequestPtr pending_open_;
  base::RepeatingCallback<void(int)> ready_callback_;

  mojo::Receiver<rail_space_panel::mojom::PageHandlerFactory>
      page_factory_receiver_{this};
  mojo::Receiver<rail_space_panel::mojom::PageHandler> page_handler_receiver_{
      this};
  mojo::Remote<rail_space_panel::mojom::Page> page_;

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_UI_H_
