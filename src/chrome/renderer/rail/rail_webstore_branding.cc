#include "chrome/renderer/rail/rail_webstore_branding.h"

#include "chrome/common/chrome_isolated_world_ids.h"
#include "content/public/renderer/render_frame.h"
#include "third_party/blink/public/platform/web_string.h"
#include "third_party/blink/public/web/web_document.h"
#include "third_party/blink/public/web/web_local_frame.h"
#include "third_party/blink/public/web/web_script_source.h"
#include "url/gurl.h"

namespace rail {
namespace {

constexpr char kWebstoreHost[] = "chromewebstore.google.com";

constexpr char kSwitchPromptCss[] =
    "[role=dialog]:has(a[href*=\"google.com/chrome\"]),"
    "div:has(> div > div > button[jslog^=\"276336\"]),"
    "div:has(> div > div > div > button[jslog^=\"276336\"]){"
    "display:none !important}";

constexpr char kRenameScript[] = R"js(
(() => {
  const word = /\bChrome\b/g;
  const rename = () => {
    for (const button of document.querySelectorAll('button, [role=button]')) {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode());) {
        if (node.data.includes('Chrome')) {
          node.data = node.data.replace(word, 'Rail');
        }
      }
      const label = button.getAttribute('aria-label');
      if (label && label.includes('Chrome')) {
        button.setAttribute('aria-label', label.replace(word, 'Rail'));
      }
    }
  };
  new MutationObserver(rename).observe(
      document, {subtree: true, childList: true, characterData: true});
  rename();
})();
)js";

}  // namespace

void BrandWebstore(content::RenderFrame* render_frame) {
  blink::WebLocalFrame* frame = render_frame->GetWebFrame();
  if (!frame) {
    return;
  }
  blink::WebDocument document = frame->GetDocument();
  if (GURL(document.Url()).host() != kWebstoreHost) {
    return;
  }
  document.InsertStyleSheet(blink::WebString::FromUtf8(kSwitchPromptCss));
  frame->ExecuteScriptInIsolatedWorld(
      ISOLATED_WORLD_ID_CHROME_INTERNAL,
      blink::WebScriptSource(blink::WebString::FromUtf8(kRenameScript)),
      blink::BackForwardCacheAware::kAllow);
}

}  // namespace rail
