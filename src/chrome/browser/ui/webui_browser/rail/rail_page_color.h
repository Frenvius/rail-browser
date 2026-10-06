#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PAGE_COLOR_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PAGE_COLOR_H_

#include <optional>

#include "base/functional/callback.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "components/browser_apis/tab_strip/types/node_id.h"
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
                                                std::optional<SkColor>,
                                                std::optional<bool>)>;

  static void OnTopBandColorChanged(
      content::RenderFrameHost* render_frame_host);

  PageColorTracker(TabStripModel* model, Callback callback);
  PageColorTracker(const PageColorTracker&) = delete;
  PageColorTracker& operator=(const PageColorTracker&) = delete;
  ~PageColorTracker() override;

  void OnTabStripModelChanged(
      TabStripModel* model,
      const TabStripModelChange& change,
      const TabStripSelectionChange& selection) override;

 private:
  void DidChangeVisibleSecurityState() override;
  void Track(content::WebContents* contents);
  void Report(std::optional<bool> animated = std::nullopt);

  Callback callback_;
  std::optional<SkColor> reported_;
  std::optional<bool> reported_animation_;
  bool has_reported_ = false;
};

}

#endif
