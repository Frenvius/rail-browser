#include "chrome/browser/ui/webui_browser/rail/rail_searchbox_handler.h"

#include <memory>
#include <utility>

#include "base/functional/bind.h"
#include "chrome/browser/ui/omnibox/omnibox_controller.h"
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

std::unique_ptr<OmniboxController> CreateController(
    Profile* profile,
    content::WebContents* web_contents) {
  return std::make_unique<OmniboxController>(
      std::make_unique<RailOmniboxClient>(profile, web_contents));
}

}  // namespace

RailSearchboxHandler::RailSearchboxHandler(
    mojo::PendingReceiver<searchbox::mojom::PageHandler> pending_page_handler,
    mojo::PendingRemote<searchbox::mojom::Page> pending_page,
    Profile* profile,
    content::WebContents* web_contents,
    GetSessionHandleCallback get_session_callback)
    : ContextualSearchboxHandler(std::move(pending_page_handler),
                                 std::move(pending_page),
                                 profile,
                                 web_contents,
                                 CreateController(profile, web_contents),
                                 std::move(get_session_callback)) {
  static_cast<ContextualOmniboxClient*>(omnibox_controller()->client())
      ->SetSuggestInputsCallback(
          base::BindRepeating(&RailSearchboxHandler::GetSuggestInputs,
                              base::Unretained(this)));
  autocomplete_controller_observation_.Observe(autocomplete_controller());
}

RailSearchboxHandler::~RailSearchboxHandler() = default;

void RailSearchboxHandler::QueryAutocomplete(const std::u16string& input,
                                             bool prevent_inline_autocomplete,
                                             uint32_t cursor_position) {
  static_cast<RailOmniboxClient*>(omnibox_controller()->client())
      ->set_search_only(input.empty() || input.front() == u'@');
  ContextualSearchboxHandler::QueryAutocomplete(
      input, prevent_inline_autocomplete, cursor_position);
}

void RailSearchboxHandler::OpenAutocompleteMatch(
    uint8_t line,
    const GURL& url,
    bool are_matches_showing,
    uint8_t mouse_button,
    bool alt_key,
    bool ctrl_key,
    bool meta_key,
    bool shift_key) {
  if (open_in_new_tab_) {
    ContextualSearchboxHandler::OpenAutocompleteMatch(
        line, url, are_matches_showing, 0, false, true, false, true);
    return;
  }
  ContextualSearchboxHandler::OpenAutocompleteMatch(
      line, url, are_matches_showing, mouse_button, alt_key, ctrl_key,
      meta_key, shift_key);
}

}  // namespace rail
