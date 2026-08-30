#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_

#include <string>

#include "chrome/browser/ui/webui/cr_components/searchbox/contextual_searchbox_handler.h"
#include "components/omnibox/browser/searchbox.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"

class Profile;

namespace content {
class WebContents;
}

namespace rail {

class RailSearchboxHandler : public ContextualSearchboxHandler {
 public:
  RailSearchboxHandler(
      mojo::PendingReceiver<searchbox::mojom::PageHandler> pending_page_handler,
      mojo::PendingRemote<searchbox::mojom::Page> pending_page,
      Profile* profile,
      content::WebContents* web_contents,
      GetSessionHandleCallback get_session_callback);

  RailSearchboxHandler(const RailSearchboxHandler&) = delete;
  RailSearchboxHandler& operator=(const RailSearchboxHandler&) = delete;

  ~RailSearchboxHandler() override;

  void OnThumbnailRemoved() override {}

  void QueryAutocomplete(const std::u16string& input,
                         bool prevent_inline_autocomplete,
                         uint32_t cursor_position) override;
};

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_
