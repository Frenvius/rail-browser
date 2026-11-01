#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MEDIA_TRACKER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MEDIA_TRACKER_H_

#include <map>
#include <memory>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/tabs/tab_strip_model_observer.h"
#include "chrome/browser/ui/webui_browser/rail/rail_media.mojom.h"
#include "components/prefs/pref_change_registrar.h"

class BrowserWindowInterface;
class TabStripModel;
class WebUIBrowserUI;

namespace content {
class WebContents;
}

namespace rail {

class MediaTracker;
void TrackMedia(std::unique_ptr<MediaTracker>& tracker,
                BrowserWindowInterface* browser,
                base::WeakPtr<WebUIBrowserUI> controller);

class MediaTracker : public TabStripModelObserver {
 public:
  using Callback = base::RepeatingCallback<void(const tabs_api::NodeId&,
                                                rail_media::mojom::StatePtr)>;

  MediaTracker(BrowserWindowInterface* browser, Callback callback);
  ~MediaTracker() override;
  MediaTracker(const MediaTracker&) = delete;
  MediaTracker& operator=(const MediaTracker&) = delete;

  void RunAction(const tabs_api::NodeId& tab, rail_media::mojom::Action action);
  void ReportAll();

 private:
  class Session;

  void Reconcile();
  void OnTabStripModelChanged(
      TabStripModel* model,
      const TabStripModelChange& change,
      const TabStripSelectionChange& selection) override;
  void OnTabChangedAt(tabs::TabInterface* tab,
                      TabChangeType change_type) override;
  void OnTabStripModelDestroyed(TabStripModel* model) override;

  raw_ptr<BrowserWindowInterface> browser_;
  raw_ptr<TabStripModel> model_;
  Callback callback_;
  PrefChangeRegistrar media_prefs_;
  uint32_t sequence_ = 0;
  std::map<content::WebContents*, std::unique_ptr<Session>> sessions_;
};

}

#endif
