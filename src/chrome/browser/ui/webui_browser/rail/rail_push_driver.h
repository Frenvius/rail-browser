#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_DRIVER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_DRIVER_H_

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "base/timer/timer.h"
#include "chrome/browser/ui/webui_browser/rail/rail_push_socket.h"
#include "chrome/browser/ui/webui_browser/rail/rail_push_store.h"
#include "components/gcm_driver/gcm_driver.h"
#include "components/prefs/pref_change_registrar.h"
#include "services/network/public/mojom/network_context.mojom.h"

class PrefRegistrySimple;
class PrefService;

namespace rail {

inline constexpr char kPushEnabledPref[] = "rail.push.enabled";
inline constexpr char kPushBackgroundPref[] = "rail.push.background";

void RegisterPushProfilePrefs(PrefRegistrySimple* registry);

class RailPushDriver : public gcm::GCMDriver,
                       protected gcm::InstanceIDHandler,
                       public RailPushSocket::Delegate {
 public:
  using NetworkContextGetter =
      base::RepeatingCallback<network::mojom::NetworkContext*()>;

  RailPushDriver(base::FilePath store_path,
                 scoped_refptr<base::SequencedTaskRunner> blocking_runner,
                 NetworkContextGetter network_context_getter,
                 PrefService* prefs,
                 base::RepeatingCallback<void(bool)> background_wanted_callback);
  ~RailPushDriver() override;

  RailPushDriver(const RailPushDriver&) = delete;
  RailPushDriver& operator=(const RailPushDriver&) = delete;

  void Shutdown() override;

  void ValidateRegistration(
      const std::string& app_id,
      const std::vector<std::string>& sender_ids,
      const std::string& registration_id,
      ValidateRegistrationCallback callback) override;
  void AddConnectionObserver(
      gcm::GCMConnectionObserver* observer) override;
  void RemoveConnectionObserver(
      gcm::GCMConnectionObserver* observer) override;
  gcm::GCMClient* GetGCMClientForTesting() const override;
  bool IsStarted() const override;
  bool IsConnected() const override;
  void GetGCMStatistics(GetGCMStatisticsCallback callback,
                        ClearActivityLogs clear_logs) override;
  void SetGCMRecording(const GCMStatisticsRecordingCallback& callback,
                       bool recording) override;
  gcm::InstanceIDHandler* GetInstanceIDHandlerInternal() override;
  void AddHeartbeatInterval(const std::string& scope,
                            int interval_ms) override;
  void RemoveHeartbeatInterval(const std::string& scope) override;

  void GetToken(const std::string& app_id,
                const std::string& authorized_entity,
                const std::string& scope,
                base::TimeDelta time_to_live,
                GetTokenCallback callback) override;
  void ValidateToken(const std::string& app_id,
                     const std::string& authorized_entity,
                     const std::string& scope,
                     const std::string& token,
                     ValidateTokenCallback callback) override;
  void DeleteToken(const std::string& app_id,
                   const std::string& authorized_entity,
                   const std::string& scope,
                   DeleteTokenCallback callback) override;
  void AddInstanceIDData(const std::string& app_id,
                         const std::string& instance_id,
                         const std::string& extra_data) override;
  void RemoveInstanceIDData(const std::string& app_id) override;
  void GetInstanceIDData(const std::string& app_id,
                         GetInstanceIDDataCallback callback) override;

  void OnSocketOpen() override;
  void OnSocketText(std::string text) override;
  void OnSocketClosed(uint16_t code) override;

 protected:
  gcm::GCMClient::Result EnsureStarted(
      gcm::GCMClient::StartMode start_mode) override;
  void RegisterImpl(const std::string& app_id,
                    const std::vector<std::string>& sender_ids) override;
  void UnregisterImpl(const std::string& app_id) override;
  void SendImpl(const std::string& app_id,
                const std::string& receiver_id,
                const gcm::OutgoingMessage& message) override;
  void RecordDecryptionFailure(const std::string& app_id,
                               fcm::FcmDecryptionResult result) override;

 private:
  struct PendingRegister {
    std::string channel_id;
    std::string app_id;
    std::string authorized_entity;
    GetTokenCallback callback;
    std::unique_ptr<base::OneShotTimer> timeout;
  };

  void OnStoreReady();
  void MaybeConnect();
  void MaybeDisconnect();
  void SendHello();
  void SendPing();
  void SendRegister(const PendingRegister& reg);
  void SendAck(const std::string& channel_id,
               const std::string& version,
               int code);
  void SendNack(const std::string& version, int code);
  void SendUnregister(const std::string& channel_id);
  void OnHello(const base::DictValue& msg);
  void OnRegisterReply(const base::DictValue& msg);
  void OnNotification(const base::DictValue& msg);
  void OnRegisterTimeout(const std::string& channel_id);
  void OnSocketClosedAsync(uint16_t code);
  void OnPushEnabledPrefChanged();
  void OnPushBackgroundPrefChanged();
  void UpdateBackgroundWanted();
  void ScheduleReconnect();
  void ResetBackoff();
  bool HasChannelsOrPending() const;

  NetworkContextGetter network_context_getter_;
  RailPushStore store_;
  PrefChangeRegistrar pref_registrar_;
  base::RepeatingCallback<void(bool)> background_wanted_callback_;
  std::optional<bool> reported_background_wanted_;

  std::unique_ptr<RailPushSocket> socket_;
  bool enabled_ = true;
  bool store_ready_ = false;
  bool hello_done_ = false;
  int reconnect_delay_ = 1;

  std::vector<std::unique_ptr<PendingRegister>> pending_registers_;
  std::vector<base::OnceClosure> pending_store_ops_;

  base::OneShotTimer reconnect_timer_;
  base::RepeatingTimer ping_timer_;

  base::WeakPtrFactory<RailPushDriver> weak_factory_{this};
};

}

#endif
