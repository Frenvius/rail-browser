#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DOWNLOADS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DOWNLOADS_H_

#include <memory>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "chrome/browser/ui/webui/downloads/downloads.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"

class Profile;

namespace content {
class WebUI;
}

namespace rail {

class Downloads {
 public:
  explicit Downloads(content::WebUI* web_ui);
  Downloads(const Downloads&) = delete;
  Downloads& operator=(const Downloads&) = delete;
  ~Downloads();

  void CreatePageHandler(
      Profile* profile,
      mojo::PendingRemote<downloads::mojom::Page> page,
      mojo::PendingReceiver<downloads::mojom::PageHandler> receiver);

 private:
  class Relay;

  void Drop(Relay* relay);

  raw_ptr<content::WebUI> web_ui_;
  std::vector<std::unique_ptr<Relay>> relays_;
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DOWNLOADS_H_
