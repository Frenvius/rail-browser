#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_UPDATER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_UPDATER_H_

#include <memory>
#include <optional>
#include <string>

#include "base/callback_list.h"
#include "base/files/file_path.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "base/types/expected.h"
#include "base/values.h"
#include "base/version.h"
#include "url/gurl.h"

class ChromeBrowserMainExtraParts;
class PrefRegistrySimple;

namespace network {
class SimpleURLLoader;
}
namespace rail {

extern const char kUpdateFeedUrlPref[];

void RegisterUpdaterLocalStatePrefs(PrefRegistrySimple* registry);

std::unique_ptr<ChromeBrowserMainExtraParts> CreateUpdaterMainParts();

class Updater {
 public:
  using ReadyCallback = base::RepeatingCallback<void(const std::string&)>;

  enum class Status {
    kIdle,
    kChecking,
    kDownloading,
    kUpToDate,
    kReady,
    kFailed,
  };

  struct Release {
    base::Version version;
    GURL url;
    int64_t length = 0;
    std::string signature;
    std::string release_signature;
  };

  Updater();
  Updater(const Updater&) = delete;
  Updater& operator=(const Updater&) = delete;
  ~Updater();

  static Updater* Get();

  const std::optional<std::string>& ready_version() const {
    return ready_version_;
  }

  Status status() const { return status_; }

  base::CallbackListSubscription AddReadyCallback(ReadyCallback callback);

  base::CallbackListSubscription AddStatusCallback(
      base::RepeatingClosure callback);

  void CheckNow();

  void Apply();

  void LaunchPendingInstaller();

 private:
  void ScheduleCheck(base::TimeDelta delay);
  void Check();
  void OnFeedLoaded(std::optional<std::string> body);
  void OnFeedParsed(base::expected<base::Value, std::string> result);
  void OnInstallerPrepared(Release release,
                           base::FilePath installer,
                           bool valid);
  void OnDownloaded(Release release,
                    base::FilePath installer,
                    bool downloaded);
  void OnVerified(Release release, base::FilePath installer, bool valid);
  void SetStatus(Status status);
  void Finish(Status status);

  base::OneShotTimer check_timer_;
  std::unique_ptr<network::SimpleURLLoader> loader_;
  bool relaunch_ = false;
  Status status_ = Status::kIdle;
  std::optional<std::string> ready_version_;
  base::FilePath ready_installer_;
  base::RepeatingCallbackList<void(const std::string&)> ready_callbacks_;
  base::RepeatingClosureList status_callbacks_;

  base::WeakPtrFactory<Updater> weak_factory_{this};
};

}

#endif
