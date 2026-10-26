#include "chrome/browser/ui/webui_browser/rail/rail_webui_browser.h"

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"

namespace rail {

BrowserWindowInterface* BrowserFor(content::WebUI* web_ui) {
  BrowserWindowInterface* window =
      webui::GetBrowserWindowInterface(web_ui->GetWebContents());
  WebUIBrowserWindow* browser_window =
      window ? WebUIBrowserWindow::FromBrowser(window) : nullptr;
  return browser_window ? browser_window->browser() : nullptr;
}

PrefService* PrefsFor(content::WebUI* web_ui) {
  BrowserWindowInterface* browser = BrowserFor(web_ui);
  return browser ? browser->GetProfile()->GetPrefs() : nullptr;
}

}
