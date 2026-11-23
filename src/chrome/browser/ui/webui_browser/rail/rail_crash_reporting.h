#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_CRASH_REPORTING_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_CRASH_REPORTING_H_

namespace rail {

bool GetSendCrashReports();
void SetSendCrashReports(bool enabled);

}

#endif
