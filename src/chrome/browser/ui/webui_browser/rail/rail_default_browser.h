#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DEFAULT_BROWSER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_DEFAULT_BROWSER_H_

#include "base/functional/callback_forward.h"

namespace rail {

void CheckIsDefaultBrowser(base::OnceCallback<void(bool)> callback);

void SetAsDefaultBrowser();

}

#endif
