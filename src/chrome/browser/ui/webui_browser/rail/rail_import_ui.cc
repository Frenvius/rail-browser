#include "chrome/browser/ui/webui_browser/rail/rail_import_ui.h"

#include <string>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface_iterator.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_mojo.h"
#include "chrome/browser/ui/webui_browser/rail/rail_webui_browser.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"
#include "mojo/public/cpp/bindings/callback_helpers.h"
#include "ui/webui/webui_util.h"

namespace rail {

namespace {

Profile* ProfileFor(content::WebUI* web_ui) {
  BrowserWindowInterface* browser = BrowserFor(web_ui);
  return browser ? browser->GetProfile() : nullptr;
}

base::WeakPtr<Profile> WeakProfileOf(Profile* profile) {
  return profile ? profile->GetWeakPtr() : base::WeakPtr<Profile>();
}

WebUIBrowserWindow* SidebarWindowFor(Profile* profile) {
  for (BrowserWindowInterface* browser : GetAllBrowserWindowInterfaces()) {
    if (browser->GetProfile() != profile) {
      continue;
    }
    WebUIBrowserWindow* window = WebUIBrowserWindow::FromBrowser(browser);
    if (window && window->GetWebUIBrowserUI() &&
        window->GetWebUIBrowserUI()->page()) {
      return window;
    }
  }
  return nullptr;
}

void OnSidebarMerged(base::WeakPtr<Profile> profile, bool merged) {
  ConfirmImport(std::move(profile), merged);
}

void DeliverToSidebar(base::WeakPtr<Profile> profile, ImportSummary summary) {
  WebUIBrowserWindow* window = SidebarWindowFor(profile.get());
  auto* page = window ? window->GetWebUIBrowserUI()->page() : nullptr;
  if (!page) {
    ConfirmImport(std::move(profile), false);
    return;
  }
  page->OnImportFinished(
      ToMojoSummary(std::move(summary)),
      mojo::WrapCallbackWithDefaultInvokeIfNotRun(
          base::BindOnce(&OnSidebarMerged, std::move(profile)), false));
}

void OnImportFinished(
    base::WeakPtr<Profile> profile,
    mojo::SharedRemote<rail_import::mojom::ImportObserver> observer,
    ImportSummary summary) {
  std::string message = summary.message;
  if (!summary.sidebar.empty()) {
    DeliverToSidebar(std::move(profile), std::move(summary));
  }
  ForwardImportSummary(observer).Run(ImportSummary{.message = message});
}

}

RailImportUIConfig::RailImportUIConfig()
    : DefaultTopChromeWebUIConfig(content::kChromeUIScheme, kRailImportHost) {}

RailImportUI::RailImportUI(content::WebUI* web_ui)
    : TopChromeWebUIController(web_ui, false, false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), kRailImportHost);
  webui::SetupWebUIDataSource(source, kWebuiBrowserResources,
                              IDR_WEBUI_BROWSER_RAIL_IMPORT_HTML);
}

RailImportUI::~RailImportUI() = default;

void RailImportUI::BindInterface(
    mojo::PendingReceiver<rail_import_page::mojom::PageHandlerFactory>
        receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void RailImportUI::CreatePageHandler(
    mojo::PendingRemote<rail_import_page::mojom::Page> page,
    mojo::PendingReceiver<rail_import_page::mojom::PageHandler> handler) {
  page_.reset();
  page_.Bind(std::move(page));
  page_handler_receiver_.reset();
  page_handler_receiver_.Bind(std::move(handler));
}

void RailImportUI::ListImportSources(ListImportSourcesCallback callback) {
  rail::ListImportSources(
      PrefsFor(web_ui()),
      base::BindOnce(&RailImportUI::OnImportSources,
                     weak_factory_.GetWeakPtr(), std::move(callback)));
}

void RailImportUI::OnImportSources(ListImportSourcesCallback callback,
                                   std::vector<ImportSourceInfo> sources) {
  std::move(callback).Run(ToMojoSources(sources));
}

void RailImportUI::StartImport(
    const std::string& source_id,
    const std::vector<std::string>& profile_dirs,
    mojo::PendingRemote<rail_import::mojom::ImportObserver> observer) {
  Profile* profile = ProfileFor(web_ui());
  mojo::SharedRemote<rail_import::mojom::ImportObserver> remote(
      std::move(observer));
  rail::StartImport(profile, ImportRequest{
                                 .source_id = source_id,
                                 .profile_dirs = profile_dirs,
                                 .on_event = ForwardImportEvents(remote),
                                 .on_finished = base::BindOnce(
                                     &OnImportFinished, WeakProfileOf(profile),
                                     remote),
                             });
}

void RailImportUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailImportUI)

}
