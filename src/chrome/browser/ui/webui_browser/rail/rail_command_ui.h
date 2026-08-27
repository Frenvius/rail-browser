#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_UI_H_

#include <memory>
#include <optional>
#include <string>
#include <string_view>

#include "chrome/browser/ui/webui/top_chrome/top_chrome_web_ui_controller.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_webui_config.h"
#include "chrome/browser/ui/webui_browser/rail/rail_command.mojom.h"
#include "components/browser_apis/tab_strip/tab_strip_api.mojom.h"
#include "components/omnibox/browser/searchbox.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "ui/webui/mojo_web_ui_controller.h"

class RealboxHandler;

namespace contextual_search {
class ContextualSearchSessionHandle;
}

namespace content {
class WebUI;
}

namespace rail {

class RailCommandUI;

inline constexpr char kRailCommandHost[] = "rail-command";
inline constexpr char kRailCommandURL[] = "chrome://rail-command/";

class RailCommandUIConfig : public DefaultTopChromeWebUIConfig<RailCommandUI> {
 public:
  RailCommandUIConfig();

  bool ShouldAutoResizeHost() override;
};

class RailCommandUI : public TopChromeWebUIController,
                      public rail_command::mojom::PageHandlerFactory,
                      public rail_command::mojom::PageHandler,
                      public searchbox::mojom::PageHandlerFactory {
 public:
  explicit RailCommandUI(content::WebUI* web_ui);
  RailCommandUI(const RailCommandUI&) = delete;
  RailCommandUI& operator=(const RailCommandUI&) = delete;
  ~RailCommandUI() override;

  static constexpr std::string_view GetWebUIName() { return "RailCommand"; }

  void BindInterface(
      mojo::PendingReceiver<rail_command::mojom::PageHandlerFactory> receiver);
  void BindInterface(
      mojo::PendingReceiver<searchbox::mojom::PageHandlerFactory> receiver);
  void BindInterface(
      mojo::PendingReceiver<tabs_api::mojom::TabStripService> receiver);

  void Open(const std::string& text,
            bool select_all,
            bool new_tab_mode,
            int width,
            rail_command::mojom::CommandContextPtr context);

  bool page_bound() const { return page_.is_bound(); }

 private:
  void CreatePageHandler(
      mojo::PendingRemote<rail_command::mojom::Page> page,
      mojo::PendingReceiver<rail_command::mojom::PageHandler> handler) override;

  void CreatePageHandler(
      mojo::PendingRemote<searchbox::mojom::Page> page,
      mojo::PendingReceiver<searchbox::mojom::PageHandler> handler) override;

  void RunCommand(const std::string& id) override;
  void Close() override;

  contextual_search::ContextualSearchSessionHandle*
  GetOrCreateContextualSessionHandle();

  struct PendingOpen {
    std::string text;
    bool select_all;
    bool new_tab_mode;
    int width;
    rail_command::mojom::CommandContextPtr context;
  };

  std::optional<PendingOpen> pending_open_;

  mojo::Receiver<rail_command::mojom::PageHandlerFactory>
      page_factory_receiver_{this};
  mojo::Receiver<rail_command::mojom::PageHandler> page_handler_receiver_{this};
  mojo::Remote<rail_command::mojom::Page> page_;

  mojo::Receiver<searchbox::mojom::PageHandlerFactory>
      searchbox_page_factory_receiver_{this};
  std::unique_ptr<RealboxHandler> realbox_handler_;
  std::unique_ptr<contextual_search::ContextualSearchSessionHandle>
      session_handle_;

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_UI_H_
