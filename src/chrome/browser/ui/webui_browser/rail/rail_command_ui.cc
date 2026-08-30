#include "chrome/browser/ui/webui_browser/rail/rail_command_ui.h"

#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "chrome/browser/contextual_search/contextual_search_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_features.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/omnibox/omnibox_next_features.h"
#include "chrome/browser/ui/tabs/tab_strip_api/tab_strip_service_feature.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui/cr_components/searchbox/searchbox_handler.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"
#include "chrome/browser/ui/webui_browser/rail/rail_searchbox_handler.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/generated_resources.h"
#include "chrome/grit/tab_strip_api_resources_map.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "components/contextual_search/contextual_search_service.h"
#include "components/contextual_search/contextual_search_session_handle.h"
#include "components/strings/grit/components_strings.h"
#include "components/tabs/public/tab_interface.h"
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

std::vector<tabs_api::NodeId> TabsInProfile(WebUIBrowserWindow* window,
                                            Profile* profile) {
  std::vector<tabs_api::NodeId> ids;
  if (!window || !profile) {
    return ids;
  }
  TabStripModel* model = window->browser()->tab_strip_model();
  for (int index = 0; index < model->count(); ++index) {
    tabs::TabInterface* tab = model->GetTabAtIndex(index);
    content::WebContents* contents = tab ? tab->GetContents() : nullptr;
    if (contents && contents->GetBrowserContext() == profile) {
      ids.push_back(tabs_api::NodeId::FromTabHandle(tab->GetHandle()));
    }
  }
  return ids;
}

}

RailCommandUIConfig::RailCommandUIConfig()
    : DefaultTopChromeWebUIConfig(content::kChromeUIScheme, kRailCommandHost) {}

bool RailCommandUIConfig::ShouldAutoResizeHost() {
  return true;
}

RailCommandUI::RailCommandUI(content::WebUI* web_ui)
    : TopChromeWebUIController(web_ui,
                               /*enable_chrome_send=*/true,
                               /*enable_chrome_histograms=*/true) {
  Profile* profile = Profile::FromWebUI(web_ui);
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), kRailCommandHost);

  webui::SetupWebUIDataSource(source, kWebuiBrowserResources,
                              IDR_WEBUI_BROWSER_RAIL_COMMAND_HTML);
  source->AddResourcePaths(kTabStripApiResources);

  static constexpr webui::LocalizedString kStrings[] = {
      {"commandBarSwitchToTab", IDS_OMNIBOX_TAB_SUGGEST_HINT},
  };
  source->AddLocalizedStrings(kStrings);
  source->AddLocalizedStrings(
      SearchboxHandler::GetWebUIDataSourceDict(profile));
}

RailCommandUI::~RailCommandUI() = default;

void RailCommandUI::BindInterface(
    mojo::PendingReceiver<rail_command::mojom::PageHandlerFactory> receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void RailCommandUI::BindInterface(
    mojo::PendingReceiver<searchbox::mojom::PageHandlerFactory> receiver) {
  searchbox_page_factory_receiver_.reset();
  searchbox_page_factory_receiver_.Bind(std::move(receiver));
}

void RailCommandUI::BindInterface(
    mojo::PendingReceiver<tabs_api::mojom::TabStripService> receiver) {
  WebUIBrowserWindow* window = WindowFor(web_ui());
  if (!window) {
    return;
  }
  auto* feature =
      window->browser()->browser_window_features()->tab_strip_service_feature();
  if (feature) {
    feature->Accept(std::move(receiver));
  }
}

void RailCommandUI::CreatePageHandler(
    mojo::PendingRemote<rail_command::mojom::Page> page,
    mojo::PendingReceiver<rail_command::mojom::PageHandler> handler) {
  page_.reset();
  page_.Bind(std::move(page));
  page_handler_receiver_.reset();
  page_handler_receiver_.Bind(std::move(handler));
  if (pending_open_) {
    page_->Open(pending_open_->text, pending_open_->select_all,
                pending_open_->new_tab_mode, pending_open_->width,
                std::move(pending_open_->context));
    pending_open_.reset();
  }
}

void RailCommandUI::CreatePageHandler(
    mojo::PendingRemote<searchbox::mojom::Page> page,
    mojo::PendingReceiver<searchbox::mojom::PageHandler> handler) {
  searchbox_profile_ = CurrentProfile();
  searchbox_handler_ = std::make_unique<RailSearchboxHandler>(
      std::move(handler), std::move(page), searchbox_profile_,
      web_ui()->GetWebContents(),
      base::BindRepeating(&RailCommandUI::GetOrCreateContextualSessionHandle,
                          base::Unretained(this)));
}

Profile* RailCommandUI::CurrentProfile() {
  WebUIBrowserWindow* window = WindowFor(web_ui());
  Profile* profile =
      window ? ProfileForNewTab(window->browser(), nullptr) : nullptr;
  return profile ? profile : Profile::FromWebUI(web_ui());
}

void RailCommandUI::Open(const std::string& text,
                         bool select_all,
                         bool new_tab_mode,
                         int width,
                         rail_command::mojom::CommandContextPtr context) {
  Profile* profile = CurrentProfile();
  context->profile_changed = searchbox_profile_ && searchbox_profile_ != profile;
  context->profile_tabs = TabsInProfile(WindowFor(web_ui()), profile);
  if (!page_) {
    pending_open_ =
        PendingOpen{text, select_all, new_tab_mode, width, std::move(context)};
    return;
  }
  page_->Open(text, select_all, new_tab_mode, width, std::move(context));
}

void RailCommandUI::Ready(int32_t height) {
  if (ready_callback_) {
    ready_callback_.Run(height);
  }
}

void RailCommandUI::RunCommand(const std::string& id) {
  WebUIBrowserWindow* window = WindowFor(web_ui());
  if (window) {
    if (webui_browser::mojom::Page* page = window->GetWebUIBrowserUI()->page()) {
      page->RunRailCommand(id);
    }
  }
  Close();
}

void RailCommandUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

contextual_search::ContextualSearchSessionHandle*
RailCommandUI::GetOrCreateContextualSessionHandle() {
  if (!session_handle_) {
    auto* service = ContextualSearchServiceFactory::GetForProfile(
        Profile::FromWebUI(web_ui()));
    if (service) {
      session_handle_ = service->CreateSession(
          omnibox::CreateQueryControllerConfigParams(),
          contextual_search::ContextualSearchSource::kOmnibox,
          lens::LensOverlayInvocationSource::kOmniboxContextualQuery);
      session_handle_->CheckSearchContentSharingSettings(
          Profile::FromWebUI(web_ui())->GetPrefs());
    }
  }
  return session_handle_.get();
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailCommandUI)

}
