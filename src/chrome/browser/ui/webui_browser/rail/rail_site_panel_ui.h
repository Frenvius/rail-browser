#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_PANEL_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_PANEL_UI_H_

#include <memory>
#include <optional>
#include <string>
#include <string_view>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "build/build_config.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_web_ui_controller.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_webui_config.h"
#include "chrome/browser/ui/webui_browser/rail/rail_site_panel.mojom.h"
#include "components/page_info/page_info_ui.h"
#include "content/public/browser/render_widget_host_view.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "ui/gfx/geometry/point.h"

class PageInfo;
class PageInfoUiDelegate;
class WebUIBrowserWindow;
class WebUIToolbarExtensionsContainer;

namespace content {
class WebContents;
class WebUI;
}

#if BUILDFLAG(IS_WIN)
namespace webshare {
class ShowShareUIForWindowOperation;
}
#endif

namespace rail {

class RailSitePanelUI;

inline constexpr char kRailSitePanelHost[] = "rail-site-panel";
inline constexpr char kRailSitePanelURL[] = "chrome://rail-site-panel/";

class RailSitePanelUIConfig
    : public DefaultTopChromeWebUIConfig<RailSitePanelUI> {
 public:
  RailSitePanelUIConfig();

  bool ShouldAutoResizeHost() override;
};

class RailSitePanelUI : public TopChromeWebUIController,
                        public rail_site_panel::mojom::PageHandlerFactory,
                        public rail_site_panel::mojom::PageHandler,
                        public PageInfoUI {
 public:
  explicit RailSitePanelUI(content::WebUI* web_ui);
  RailSitePanelUI(const RailSitePanelUI&) = delete;
  RailSitePanelUI& operator=(const RailSitePanelUI&) = delete;
  ~RailSitePanelUI() override;

  static constexpr std::string_view GetWebUIName() { return "RailSitePanel"; }

  void BindInterface(
      mojo::PendingReceiver<rail_site_panel::mojom::PageHandlerFactory>
          receiver);

  void Open(const gfx::Point& anchor, const std::string& space_color);
  void Closed();

  void set_ready_callback(base::RepeatingCallback<void(int)> callback) {
    ready_callback_ = std::move(callback);
  }

  void SetPermissionInfo(const PermissionInfoList& permission_info_list,
                         ChosenObjectInfoList chosen_object_info_list) override;
  void SetIdentityInfo(const IdentityInfo& identity_info) override;

 private:
  void CreatePageHandler(
      mojo::PendingRemote<rail_site_panel::mojom::Page> page,
      mojo::PendingReceiver<rail_site_panel::mojom::PageHandler> handler)
      override;

  void Ready(int32_t height) override;
  void RunAction(const std::string& action) override;
  void ActivateExtension(const std::string& id) override;
  void ShowExtensionMenu(const std::string& id) override;
  void SetExtensionPinned(const std::string& id, bool pinned) override;
  void TogglePermission(int32_t index) override;
  void Close() override;

  WebUIBrowserWindow* Window();
  WebUIToolbarExtensionsContainer* Extensions();
  content::WebContents* Target();
  void Push();
  rail_site_panel::mojom::SiteStatePtr BuildState();
  void CopyLink();
  void CaptureScreenshot();
  void OnScreenshot(const content::CopyFromSurfaceResult& result);
  void ShowToast(const std::string& message, const std::string& icon);
  void Share();
  void ShowPageInfoBubble();

  base::WeakPtr<content::WebContents> target_;
  gfx::Point anchor_;
  std::string space_color_;
  std::unique_ptr<PageInfo> page_info_;
  std::unique_ptr<PageInfoUiDelegate> ui_delegate_;
  PermissionInfoList permissions_;
  std::string security_;
  std::string security_summary_;
  bool open_ = false;
  base::RepeatingCallback<void(int)> ready_callback_;

#if BUILDFLAG(IS_WIN)
  std::unique_ptr<webshare::ShowShareUIForWindowOperation> share_operation_;
#endif

  mojo::Receiver<rail_site_panel::mojom::PageHandlerFactory>
      page_factory_receiver_{this};
  mojo::Receiver<rail_site_panel::mojom::PageHandler> page_handler_receiver_{
      this};
  mojo::Remote<rail_site_panel::mojom::Page> page_;
  base::WeakPtrFactory<RailSitePanelUI> weak_factory_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_PANEL_UI_H_
