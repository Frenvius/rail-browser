#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_CRYPTO_MAC_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_CRYPTO_MAC_H_

#include <optional>
#include <string>

#include "base/files/file_path.h"

namespace rail {

std::optional<std::string> ReadMacImportKey(const base::FilePath& user_data);

}

#endif
