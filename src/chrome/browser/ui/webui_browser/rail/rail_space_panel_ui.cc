#include "chrome/browser/ui/webui_browser/rail/rail_space_panel_ui.h"

#include <utility>

#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"
#include "ui/webui/webui_util.h"

namespace rail {

namespace {

WebUIBrowserWindow* WindowFor(content::WebUI* web_ui) {
  BrowserWindowInterface* browser =
      webui::GetBrowserWindowInterface(web_ui->GetWebContents());
  return browser ? WebUIBrowserWindow::FromBrowser(browser) : nullptr;
}

}

RailSpacePanelUIConfig::RailSpacePanelUIConfig()
    : DefaultTopChromeWebUIConfig(content::kChromeUIScheme,
                                  kRailSpacePanelHost) {}

bool RailSpacePanelUIConfig::ShouldAutoResizeHost() {
  return true;
}

RailSpacePanelUI::RailSpacePanelUI(content::WebUI* web_ui)
    : TopChromeWebUIController(web_ui,
                               /*enable_chrome_send=*/false,
                               /*enable_chrome_histograms=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), kRailSpacePanelHost);
  webui::SetupWebUIDataSource(source, kWebuiBrowserResources,
                              IDR_WEBUI_BROWSER_RAIL_SPACE_PANEL_HTML);
}

RailSpacePanelUI::~RailSpacePanelUI() = default;

void RailSpacePanelUI::BindInterface(
    mojo::PendingReceiver<rail_space_panel::mojom::PageHandlerFactory>
        receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void RailSpacePanelUI::CreatePageHandler(
    mojo::PendingRemote<rail_space_panel::mojom::Page> page,
    mojo::PendingReceiver<rail_space_panel::mojom::PageHandler> handler) {
  page_.reset();
  page_.Bind(std::move(page));
  page_handler_receiver_.reset();
  page_handler_receiver_.Bind(std::move(handler));
  if (pending_open_) {
    page_->Open(std::move(pending_open_));
  }
}

void RailSpacePanelUI::Open(
    webui_browser::mojom::SpacePanelRequestPtr request) {
  space_id_ = request->space_id;
  if (!page_) {
    pending_open_ = std::move(request);
    return;
  }
  page_->Open(std::move(request));
}

void RailSpacePanelUI::Ready(int32_t height) {
  if (ready_callback_) {
    ready_callback_.Run(height);
  }
}

void RailSpacePanelUI::Restyle(const std::string& color,
                               const std::string& icon) {
  WebUIBrowserWindow* window = WindowFor(web_ui());
  if (!window) {
    return;
  }
  if (webui_browser::mojom::Page* page = window->GetWebUIBrowserUI()->page()) {
    page->OnRailSpaceRestyle(space_id_, color, icon);
  }
}

void RailSpacePanelUI::SetSystemBackdrop(
    webui_browser::mojom::SystemBackdropSettingsPtr settings) {
  if (WebUIBrowserWindow* window = WindowFor(web_ui())) {
    window->SetSystemBackdrop(std::move(settings));
  }
}

void RailSpacePanelUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailSpacePanelUI)

}
