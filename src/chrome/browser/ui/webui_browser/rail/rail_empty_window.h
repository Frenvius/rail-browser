#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EMPTY_WINDOW_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EMPTY_WINDOW_H_

class Browser;

namespace rail {

// True when an empty tab strip is a state the window renders rather than a
// reason to close it. Two independent observers react to the strip emptying,
// and both have to agree or the window is left half-closed.
bool KeepsWindowOpenWhenEmpty(Browser* browser);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EMPTY_WINDOW_H_
