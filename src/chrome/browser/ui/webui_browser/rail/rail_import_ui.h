#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_UI_H_

#include <string>
#include <string_view>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_web_ui_controller.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_webui_config.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_page.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {
class WebUI;
}

namespace rail {

class RailImportUI;

inline constexpr char kRailImportHost[] = "rail-import";
inline constexpr char kRailImportURL[] = "chrome://rail-import/";
inline constexpr char kRailImportFirstRunURL[] =
    "chrome://rail-import/?first_run=1";

class RailImportUIConfig : public DefaultTopChromeWebUIConfig<RailImportUI> {
 public:
  RailImportUIConfig();
};

class RailImportUI : public TopChromeWebUIController,
                     public rail_import_page::mojom::PageHandlerFactory,
                     public rail_import_page::mojom::PageHandler {
 public:
  explicit RailImportUI(content::WebUI* web_ui);
  RailImportUI(const RailImportUI&) = delete;
  RailImportUI& operator=(const RailImportUI&) = delete;
  ~RailImportUI() override;

  static constexpr std::string_view GetWebUIName() { return "RailImport"; }

  void BindInterface(
      mojo::PendingReceiver<rail_import_page::mojom::PageHandlerFactory>
          receiver);

 private:
  void CreatePageHandler(
      mojo::PendingRemote<rail_import_page::mojom::Page> page,
      mojo::PendingReceiver<rail_import_page::mojom::PageHandler> handler)
      override;

  void ListImportSources(ListImportSourcesCallback callback) override;
  void StartImport(
      const std::string& source_id,
      const std::vector<std::string>& profile_dirs,
      mojo::PendingRemote<rail_import::mojom::ImportObserver> observer) override;
  void IsDefaultBrowser(IsDefaultBrowserCallback callback) override;
  void SetAsDefaultBrowser() override;
  void CanPinToTaskbar(CanPinToTaskbarCallback callback) override;
  void PinToTaskbar() override;
  void IsRunAtLogin(IsRunAtLoginCallback callback) override;
  void SetRunAtLogin(bool enabled) override;
  void Close() override;

  void OnImportSources(ListImportSourcesCallback callback,
                       std::vector<ImportSourceInfo> sources);

  mojo::Receiver<rail_import_page::mojom::PageHandlerFactory>
      page_factory_receiver_{this};
  mojo::Receiver<rail_import_page::mojom::PageHandler> page_handler_receiver_{
      this};
  mojo::Remote<rail_import_page::mojom::Page> page_;

  base::WeakPtrFactory<RailImportUI> weak_factory_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}

#endif
