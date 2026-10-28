#include "chrome/browser/ui/webui_browser/rail/rail_window_key.h"

#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/sessions/session_service.h"
#include "chrome/browser/sessions/session_service_factory.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"

namespace rail {

const char kWindowKeyExtraData[] = "rail.window_key";

namespace {

struct WindowKeys {
  std::string earlier;
  std::string current;
};

std::map<SessionID, WindowKeys>& Keys() {
  static base::NoDestructor<std::map<SessionID, WindowKeys>> keys;
  return *keys;
}

}

void RememberEarlierWindowKey(
    SessionID window_id,
    const std::map<std::string, std::string>& extra_data) {
  auto it = extra_data.find(kWindowKeyExtraData);
  if (it != extra_data.end()) {
    Keys()[window_id].earlier = it->second;
  }
}

std::string ExchangeWindowKey(BrowserWindowInterface* browser,
                              const std::string& key) {
  WindowKeys& keys = Keys()[browser->GetSessionID()];
  keys.current = key;
  if (SessionService* service =
          SessionServiceFactory::GetForProfile(browser->GetProfile())) {
    service->AddWindowExtraData(browser->GetSessionID(), kWindowKeyExtraData,
                                key);
  }
  return keys.earlier;
}

std::string WindowKeyOf(SessionID window_id) {
  auto it = Keys().find(window_id);
  if (it == Keys().end()) {
    return std::string();
  }
  return it->second.current.empty() ? it->second.earlier : it->second.current;
}

}
