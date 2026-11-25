#include "chrome/browser/ui/webui_browser/rail/rail_gcm_profile_service.h"

#include <memory>
#include <utility>

#include "base/task/thread_pool.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui_browser/rail/rail_push_background.h"
#include "chrome/browser/ui/webui_browser/rail/rail_push_driver.h"
#include "components/gcm_driver/gcm_driver_constants.h"
#include "content/public/browser/storage_partition.h"

namespace rail {

RailGcmProfileService::RailGcmProfileService(
    std::unique_ptr<gcm::GCMDriver> driver)
    : gcm::GCMProfileService(std::move(driver)) {}

std::unique_ptr<gcm::GCMProfileService> CreatePushProfileService(
    Profile* profile) {
  scoped_refptr<base::SequencedTaskRunner> blocking =
      base::ThreadPool::CreateSequencedTaskRunner(
          {base::MayBlock(), base::TaskPriority::USER_VISIBLE,
           base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
  base::FilePath store_path =
      profile->GetPath().Append(gcm_driver::kGCMStoreDirname);
  RailPushDriver::NetworkContextGetter getter =
      base::BindRepeating(
          [](Profile* p) -> network::mojom::NetworkContext* {
            return p->GetDefaultStoragePartition()->GetNetworkContext();
          },
          base::Unretained(profile));
  auto driver = std::make_unique<RailPushDriver>(
      store_path, blocking, std::move(getter), profile->GetPrefs(),
      base::BindRepeating(&rail::SetPushBackgroundWanted,
                          base::Unretained(profile)));
  return std::make_unique<RailGcmProfileService>(std::move(driver));
}

}
