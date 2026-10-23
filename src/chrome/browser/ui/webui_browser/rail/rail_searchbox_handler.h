#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_

#include <optional>
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

  void QueryAutocomplete(int32_t query_id,
                         std::optional<int32_t> tab_id,
                         const std::u16string& input,
                         bool prevent_inline_autocomplete,
                         uint32_t cursor_position,
                         omnibox::SuggestInventory suggest_inventory,
                         bool is_on_focus,
                         const std::string& keyword,
                         searchbox::mojom::InputMethod input_method) override;
  void OpenAutocompleteMatch(uint32_t result_sequence_id,
                             uint8_t line,
                             const GURL& url,
                             bool are_matches_showing,
                             uint8_t mouse_button,
                             searchbox::mojom::ActionModifiersPtr modifiers,
                             bool via_keyboard) override;

  void set_open_in_new_tab(bool open_in_new_tab) {
    open_in_new_tab_ = open_in_new_tab;
  }

 private:
  bool open_in_new_tab_ = false;
};

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SEARCHBOX_HANDLER_H_
