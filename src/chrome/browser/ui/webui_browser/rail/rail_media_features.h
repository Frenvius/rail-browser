#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MEDIA_FEATURES_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_MEDIA_FEATURES_H_

#include <vector>

#include "base/feature_list.h"
#include "third_party/blink/public/common/features.h"

namespace rail {

inline std::vector<base::FeatureList::FeatureOverrideInfo>
MediaFeatureOverrides(
    std::vector<base::FeatureList::FeatureOverrideInfo> overrides) {
  overrides.emplace_back(
      blink::features::kBrowserInitiatedAutomaticPictureInPicture,
      base::FeatureList::OVERRIDE_ENABLE_FEATURE);
  return overrides;
}

}

#endif
