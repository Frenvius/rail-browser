#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_AUTOMATION_PAINTING_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_AUTOMATION_PAINTING_H_

#include <cstdint>

#include "base/containers/span.h"

namespace content {
class DevToolsAgentHostClientChannel;
}

namespace rail {

void KeepDrivenTabPainting(content::DevToolsAgentHostClientChannel* channel,
                           base::span<const uint8_t> message);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_AUTOMATION_PAINTING_H_
