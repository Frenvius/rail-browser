#include "chrome/browser/ui/webui_browser/rail/rail_searchbox_handler.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "third_party/metrics_proto/omnibox_event.pb.h"

namespace rail {

namespace {

class RailOmniboxClient : public ContextualOmniboxClient {
 public:
  RailOmniboxClient(Profile* profile, content::WebContents* web_contents)
      : ContextualOmniboxClient(profile, web_contents) {}

  RailOmniboxClient(const RailOmniboxClient&) = delete;
  RailOmniboxClient& operator=(const RailOmniboxClient&) = delete;

  ~RailOmniboxClient() override = default;

  void set_search_only(bool search_only) { search_only_ = search_only; }

  metrics::OmniboxEventProto::PageClassification GetPageClassification(
      bool is_prefetch) const override {
    return search_only_ ? metrics::OmniboxEventProto::NTP_REALBOX
                        : metrics::OmniboxEventProto::OTHER;
  }

 private:
  bool search_only_ = true;
};

}  // namespace

RailSearchboxHandler::RailSearchboxHandler(
    mojo::PendingReceiver<searchbox::mojom::PageHandler> pending_page_handler,
    mojo::PendingRemote<searchbox::mojom::Page> pending_page,
    Profile* profile,
    content::WebContents* web_contents,
    GetSessionHandleCallback get_session_callback)
    : ContextualSearchboxHandler(
          std::move(pending_page_handler),
          std::move(pending_page),
          profile,
          web_contents,
          std::make_unique<RailOmniboxClient>(profile, web_contents),
          std::move(get_session_callback)) {
  static_cast<ContextualOmniboxClient*>(client())->SetSuggestInputsCallback(
      base::BindRepeating(&RailSearchboxHandler::GetSuggestInputs,
                          base::Unretained(this)));
  autocomplete_controller_observation_.Observe(autocomplete_controller());
}

RailSearchboxHandler::~RailSearchboxHandler() = default;

void RailSearchboxHandler::QueryAutocomplete(
    int32_t query_id,
    std::optional<int32_t> tab_id,
    const std::u16string& input,
    bool prevent_inline_autocomplete,
    uint32_t cursor_position,
    omnibox::SuggestInventory suggest_inventory,
    bool is_on_focus,
    const std::string& keyword,
    searchbox::mojom::InputMethod input_method) {
  static_cast<RailOmniboxClient*>(client())->set_search_only(
      input.empty() || input.front() == u'@');
  ContextualSearchboxHandler::QueryAutocomplete(
      query_id, tab_id, input, prevent_inline_autocomplete, cursor_position,
      suggest_inventory, is_on_focus, keyword, input_method);
}

void RailSearchboxHandler::OpenAutocompleteMatch(
    uint32_t result_sequence_id,
    uint8_t line,
    const GURL& url,
    bool are_matches_showing,
    uint8_t mouse_button,
    searchbox::mojom::ActionModifiersPtr modifiers,
    bool via_keyboard) {
  if (open_in_new_tab_) {
    auto new_tab = searchbox::mojom::ActionModifiers::New();
    new_tab->ctrl_key = true;
    new_tab->shift_key = true;
    ContextualSearchboxHandler::OpenAutocompleteMatch(
        result_sequence_id, line, url, are_matches_showing, 0,
        std::move(new_tab), via_keyboard);
    return;
  }
  ContextualSearchboxHandler::OpenAutocompleteMatch(
      result_sequence_id, line, url, are_matches_showing, mouse_button,
      std::move(modifiers), via_keyboard);
}

}  // namespace rail
