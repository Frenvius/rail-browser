#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_FIRST_RUN_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_FIRST_RUN_H_

class PrefRegistrySimple;

namespace rail {

void RegisterImportFirstRunPrefs(PrefRegistrySimple* registry);

bool ImportFirstRunPending();

void MarkImportFirstRunShown();

}

#endif
