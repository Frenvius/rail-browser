#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_H_

#include <memory>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "chrome/browser/ui/webui/top_chrome/webui_contents_wrapper.h"
#include "chrome/browser/ui/webui_browser/browser.mojom.h"
#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_observer.h"

class WebUIBrowserWindow;

namespace views {
class WebView;
}

namespace rail {

class RailSpacePanelUI;

class RailSpacePanel : public WebUIContentsWrapper::Host,
                       public views::WidgetObserver {
 public:
  explicit RailSpacePanel(WebUIBrowserWindow* window);
  RailSpacePanel(const RailSpacePanel&) = delete;
  RailSpacePanel& operator=(const RailSpacePanel&) = delete;
  ~RailSpacePanel() override;

  void Show(webui_browser::mojom::SpacePanelRequestPtr request,
            const gfx::Point& anchor);

  void Hide();

  void Dismiss();

  // WebUIContentsWrapper::Host:
  void ShowUI() override;
  void CloseUI() override;
  void ResizeDueToAutoResize(content::WebContents* source,
                             const gfx::Size& new_size) override;
  content::WebContents* OpenURLFromTab(
      content::WebContents* source,
      const content::OpenURLParams& params,
      base::OnceCallback<void(content::NavigationHandle&)>
          navigation_handle_callback) override;

  // views::WidgetObserver:
  void OnWidgetActivationChanged(views::Widget* widget, bool active) override;
  void OnWidgetDestroying(views::Widget* widget) override;

 private:
  class Contents;

  void OnPageReady(int height);
  void DestroyWidget();
  void OnFirstFrame(bool success);
  void EnsureContents();
  void CreateWidget();
  void PositionWidget(const gfx::Size& contents_size);
  RailSpacePanelUI* controller();

  const raw_ptr<WebUIBrowserWindow> window_;
  std::unique_ptr<Contents> contents_;
  std::unique_ptr<views::Widget> widget_;
  std::unique_ptr<SystemBackdropController> backdrop_;
  std::unique_ptr<views::Widget> shadow_;
  raw_ptr<views::WebView> web_view_ = nullptr;
  gfx::Point anchor_;
  bool showing_ = false;
  bool waiting_ready_ = false;
  bool waiting_first_frame_ = false;
  gfx::Size content_size_;
  base::ScopedObservation<views::Widget, views::WidgetObserver> observation_{
      this};
  base::WeakPtrFactory<RailSpacePanel> weak_factory_{this};
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SPACE_PANEL_H_
