#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_WINDOW_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_WINDOW_H_

#include <memory>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "build/build_config.h"
#include "chrome/browser/ui/webui/top_chrome/webui_contents_wrapper.h"
#include "third_party/blink/public/mojom/page/draggable_region.mojom.h"
#include "third_party/skia/include/core/SkRegion.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_delegate.h"
#include "ui/views/widget/widget_observer.h"
#include "url/gurl.h"

#if BUILDFLAG(IS_WIN)
#include "chrome/browser/ui/webui_browser/rail/rail_system_backdrop_controller.h"
#endif

class WebUIBrowserWindow;

namespace views {
class WebView;
}

namespace rail {

class RailImportWindow : public WebUIContentsWrapper::Host,
                         public views::WidgetObserver {
 public:
  RailImportWindow(WebUIBrowserWindow* window, const GURL& url);
  RailImportWindow(const RailImportWindow&) = delete;
  RailImportWindow& operator=(const RailImportWindow&) = delete;
  ~RailImportWindow() override;

  void Show();

  void ShowUI() override;
  void CloseUI() override;
  void DraggableRegionsChanged(
      const std::vector<blink::mojom::DraggableRegionPtr>& regions,
      content::WebContents* contents) override;

  void OnWidgetActivationChanged(views::Widget* widget, bool active) override;
  void OnWidgetDestroying(views::Widget* widget) override;

 private:
  class ClientView;
  class Contents;

  void EnsureContents();
  void CreateWidget();

  const raw_ptr<WebUIBrowserWindow> window_;
  const GURL url_;
  std::unique_ptr<Contents> contents_;
  std::unique_ptr<views::WidgetDelegate> delegate_;
  std::unique_ptr<views::Widget> widget_;
  raw_ptr<views::WebView> web_view_ = nullptr;
  raw_ptr<ClientView> client_view_ = nullptr;
  SkRegion draggable_region_;
#if BUILDFLAG(IS_WIN)
  std::unique_ptr<SystemBackdropController> backdrop_;
#endif
  base::ScopedObservation<views::Widget, views::WidgetObserver> observation_{
      this};
  base::WeakPtrFactory<RailImportWindow> weak_factory_{this};
};

}

#endif
