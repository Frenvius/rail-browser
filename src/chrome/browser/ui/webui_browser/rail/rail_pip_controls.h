#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PIP_CONTROLS_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PIP_CONTROLS_H_

#include "base/time/time.h"
#include "ui/gfx/vector_icon_types.h"

namespace rail {

inline constexpr base::TimeDelta kPipSeekBack = base::Seconds(10);
inline constexpr base::TimeDelta kPipSeekForward = base::Seconds(30);
inline constexpr gfx::PathElement kForward30Path[] = {
#include "chrome/browser/ui/webui_browser/rail/rail_forward_30.icon"
};
inline constexpr gfx::VectorIconRep kForward30Reps[] = {{kForward30Path}};
inline constexpr gfx::VectorIcon kForward30Icon(kForward30Reps,
                                                1,
                                                "rail_forward_30");
inline constexpr char16_t kPipForwardLabel[] = u"Forward 30 seconds";

}

#endif
