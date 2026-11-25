#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_GCM_PROFILE_SERVICE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_GCM_PROFILE_SERVICE_H_

#include <memory>

#include "base/memory/scoped_refptr.h"
#include "base/task/sequenced_task_runner.h"
#include "components/gcm_driver/gcm_profile_service.h"

class Profile;

namespace gcm {
class GCMDriver;
}

namespace rail {

class RailGcmProfileService : public gcm::GCMProfileService {
 public:
  explicit RailGcmProfileService(std::unique_ptr<gcm::GCMDriver> driver);
};

std::unique_ptr<gcm::GCMProfileService> CreatePushProfileService(
    Profile* profile);

}

#endif
