#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_DATA_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_ARC_DATA_H_

#include <cstdint>
#include <memory>
#include <set>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/time/time.h"
#include "components/history/core/browser/url_row.h"
#include "net/cookies/canonical_cookie.h"
#include "ui/gfx/geometry/size.h"

namespace rail {

struct ProfileStoreCounts {
  int cookies = 0;
  int locked_cookies = 0;
  int passwords = 0;
  int locked_passwords = 0;
  int urls = 0;
};

struct ImportedLogin {
  std::string origin;
  std::string action;
  std::string signon_realm;
  std::string username_element;
  std::string username_value;
  std::string password_element;
  std::string submit_element;
  std::string password;
  int scheme = 0;
  int times_used = 0;
  base::Time date_created;
  base::Time date_last_used;
};

struct ImportedFavicon {
  std::string page_url;
  std::string icon_url;
  int icon_type = 0;
  std::vector<uint8_t> png;
  gfx::Size size;
};

struct ProfileStores {
  std::vector<std::unique_ptr<net::CanonicalCookie>> cookies;
  int cookies_skipped = 0;
  int cookies_locked = 0;
  std::vector<ImportedLogin> passwords;
  int passwords_locked = 0;
  history::URLRows urls;
  std::vector<ImportedFavicon> favicons;
  int64_t watermark = 0;
};

struct ProfileMarks {
  int64_t watermark = 0;
  std::set<std::string> imported_logins;
};

std::string ImportedLoginKey(const ImportedLogin& login);

ProfileStoreCounts CountProfileStores(const base::FilePath& profile_dir,
                                      const ProfileMarks& marks);

ProfileStores ReadProfileStores(const base::FilePath& user_data,
                                const base::FilePath& profile_dir,
                                ProfileMarks marks,
                                std::vector<std::string> sidebar_urls);

}

#endif
