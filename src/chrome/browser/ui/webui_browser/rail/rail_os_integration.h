#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_OS_INTEGRATION_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_OS_INTEGRATION_H_

#include "base/files/file_path.h"
#include "base/functional/callback_forward.h"

namespace rail {

void IsRunAtLogin(base::OnceCallback<void(bool)> callback);

void SetRunAtLogin(bool enabled);

void CanPinToTaskbar(const base::FilePath& profile_path,
                     base::OnceCallback<void(bool)> callback);

void PinToTaskbar(const base::FilePath& profile_path);

}

#endif
