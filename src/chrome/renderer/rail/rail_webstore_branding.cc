#include "chrome/renderer/rail/rail_webstore_branding.h"

#include "content/public/renderer/render_frame.h"
#include "content/public/renderer/render_frame_observer.h"
#include "third_party/blink/public/platform/web_string.h"
#include "third_party/blink/public/web/web_document.h"
#include "third_party/blink/public/web/web_local_frame.h"
#include "url/gurl.h"

namespace rail {
namespace {

constexpr char kWebstoreHost[] = "chromewebstore.google.com";

constexpr char kBrandingCss[] =
    "button[jsname=\"wQO0od\"] span[jsname=\"V67aGc\"]{"
    "visibility:hidden !important;position:relative !important}"
    "button[jsname=\"wQO0od\"] span[jsname=\"V67aGc\"]::after{"
    "visibility:visible !important;position:absolute !important;"
    "left:50% !important;top:0 !important;"
    "transform:translateX(-50%) !important;white-space:nowrap !important}"
    "html:lang(pt) button[jsname=\"wQO0od\"] span[jsname=\"V67aGc\"]::after{"
    "content:\"Usar no Rail\" !important}"
    "html:lang(en) button[jsname=\"wQO0od\"] span[jsname=\"V67aGc\"]::after{"
    "content:\"Add to Rail\" !important}";

class WebstoreBranding : public content::RenderFrameObserver {
 public:
  explicit WebstoreBranding(content::RenderFrame* render_frame)
      : content::RenderFrameObserver(render_frame) {}

  WebstoreBranding(const WebstoreBranding&) = delete;
  WebstoreBranding& operator=(const WebstoreBranding&) = delete;

  ~WebstoreBranding() override = default;

  void DidCreateDocumentElement() override {
    blink::WebLocalFrame* frame = render_frame()->GetWebFrame();
    if (!frame) {
      return;
    }
    blink::WebDocument document = frame->GetDocument();
    if (GURL(document.Url()).host() != kWebstoreHost) {
      return;
    }
    document.InsertStyleSheet(blink::WebString::FromUtf8(kBrandingCss));
  }

  void OnDestruct() override { delete this; }
};

}  // namespace

void CreateWebstoreBranding(content::RenderFrame* render_frame) {
  new WebstoreBranding(render_frame);
}

}  // namespace rail
