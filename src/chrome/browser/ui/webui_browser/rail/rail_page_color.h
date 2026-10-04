#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PAGE_COLOR_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PAGE_COLOR_H_

#include <optional>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "components/browser_apis/tab_strip/types/node_id.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents_observer.h"
#include "third_party/skia/include/core/SkColor.h"

class TabStripModel;

namespace blink {
class AssociatedInterfaceRegistry;
}

namespace content {
class RenderFrameHost;
}

namespace rail {

void RegisterTopBandColorHost(content::RenderFrameHost& render_frame_host,
                              blink::AssociatedInterfaceRegistry& registry);

class PageColorTracker : public TabStripModelObserver,
                         public content::WebContentsObserver {
 public:
  using Callback = base::RepeatingCallback<void(const tabs_api::NodeId&,
                                                std::optional<SkColor>)>;

  static void OnTopBandColorChanged(content::RenderFrameHost* render_frame_host);

  PageColorTracker(TabStripModel* model, Callback callback);
  PageColorTracker(const PageColorTracker&) = delete;
  PageColorTracker& operator=(const PageColorTracker&) = delete;
  ~PageColorTracker() override;

  void OnTabStripModelChanged(
      TabStripModel* model,
      const TabStripModelChange& change,
      const TabStripSelectionChange& selection) override;

  void DidFirstVisuallyNonEmptyPaint() override;
  void PrimaryPageChanged(content::Page& page) override;

 private:
  void Track(content::WebContents* contents);
  void Refresh();
  void Capture();
  void OnSampled(const content::CopyFromSurfaceResult& result);
  void Report(std::optional<SkColor> color);

  Callback callback_;
  base::RepeatingTimer poll_timer_;
  bool capturing_ = false;
  std::optional<SkColor> reported_;
  bool has_reported_ = false;
  base::WeakPtrFactory<PageColorTracker> weak_factory_{this};
};

}

#endif
