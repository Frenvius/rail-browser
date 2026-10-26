#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_WRITER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_WRITER_H_

#include <cstdint>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "chrome/browser/ui/webui_browser/rail/rail_arc_data.h"

class Profile;

namespace rail {

struct StoreWriteResult {
  int cookies = 0;
  int cookies_skipped = 0;
  int cookies_locked = 0;
  int passwords = 0;
  int passwords_locked = 0;
  bool password_store_ready = false;
  std::vector<std::string> imported_logins;
  int urls = 0;
  int64_t watermark = 0;
};

using StoreWriteCallback = base::OnceCallback<void(StoreWriteResult result)>;

void WriteProfileStores(Profile* profile,
                        ProfileStores data,
                        StoreWriteCallback callback);

}

#endif
