#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_BUBBLE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_BUBBLE_H_

#include <memory>
#include <string>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/scoped_observation.h"
#include "chrome/browser/ui/webui/top_chrome/webui_contents_wrapper.h"
#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"
#include "chrome/browser/ui/webui_browser/rail/rail_command.mojom.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_observer.h"

class WebUIBrowserWindow;

namespace views {
class WebView;
}

namespace rail {

class RailCommandUI;

class RailCommandBubble : public WebUIContentsWrapper::Host,
                          public views::WidgetObserver {
 public:
  explicit RailCommandBubble(WebUIBrowserWindow* window);
  RailCommandBubble(const RailCommandBubble&) = delete;
  RailCommandBubble& operator=(const RailCommandBubble&) = delete;
  ~RailCommandBubble() override;

  void Show(const std::string& text, bool select_all, bool new_tab_mode);

  void Hide();

  void Dismiss();

  void SetCommandContext(rail_command::mojom::CommandContextPtr context);

  bool visible() const;

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

  gfx::Rect WindowArea() const;
  void OnPageReady(int height);
  void OnFirstFrame(bool success);
  int DesiredWidth() const;
  void EnsureContents();
  void CreateWidget();
  void PositionWidget(const gfx::Size& contents_size);
  RailCommandUI* controller();
  void DeliverOpen();

  const raw_ptr<WebUIBrowserWindow> window_;
  std::unique_ptr<Contents> contents_;
  std::unique_ptr<views::Widget> widget_;
  std::unique_ptr<SystemBackdropController> backdrop_;
  std::unique_ptr<views::Widget> shadow_;
  raw_ptr<views::WebView> web_view_ = nullptr;
  rail_command::mojom::CommandContextPtr context_;
  std::string pending_text_;
  bool pending_select_all_ = false;
  bool pending_new_tab_mode_ = false;
  bool showing_ = false;
  bool waiting_ready_ = false;
  bool waiting_first_frame_ = false;
  gfx::Size content_size_;
  base::ScopedObservation<views::Widget, views::WidgetObserver> observation_{
      this};
  base::WeakPtrFactory<RailCommandBubble> weak_factory_{this};
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_COMMAND_BUBBLE_H_
