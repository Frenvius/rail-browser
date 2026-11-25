#include "chrome/browser/ui/webui_browser/rail/rail_push_driver.h"

#include <algorithm>
#include <utility>

#include "base/base64url.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/string_util.h"
#include "base/task/sequenced_task_runner.h"
#include "base/time/time.h"
#include "base/uuid.h"
#include "base/values.h"
#include "components/gcm_driver/common/gcm_message.h"
#include "components/gcm_driver/gcm_client.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"

namespace rail {

namespace {

constexpr int kMaxReconnectDelaySec = 300;
constexpr int kPingIntervalMin = 4;
constexpr char kWebPushAppIdPrefix[] = "wp:";

}

void RegisterPushProfilePrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(kPushEnabledPref, true);
  registry->RegisterBooleanPref(kPushBackgroundPref, true);
}

RailPushDriver::RailPushDriver(
    base::FilePath store_path,
    scoped_refptr<base::SequencedTaskRunner> blocking_runner,
    NetworkContextGetter network_context_getter,
    PrefService* prefs,
    base::RepeatingCallback<void(bool)> background_wanted_callback)
    : gcm::GCMDriver(store_path, blocking_runner),
      network_context_getter_(std::move(network_context_getter)),
      store_(store_path.Append(FILE_PATH_LITERAL("Rail Push"))
                 .Append(FILE_PATH_LITERAL("state.json")),
             blocking_runner),
      background_wanted_callback_(std::move(background_wanted_callback)) {
  enabled_ = prefs->GetBoolean(kPushEnabledPref);
  pref_registrar_.Init(prefs);
  pref_registrar_.Add(
      kPushEnabledPref,
      base::BindRepeating(&RailPushDriver::OnPushEnabledPrefChanged,
                          base::Unretained(this)));
  pref_registrar_.Add(
      kPushBackgroundPref,
      base::BindRepeating(&RailPushDriver::OnPushBackgroundPrefChanged,
                          base::Unretained(this)));
  store_.Load(base::BindOnce(&RailPushDriver::OnStoreReady,
                              base::Unretained(this)));
}

RailPushDriver::~RailPushDriver() = default;

void RailPushDriver::Shutdown() {
  background_wanted_callback_.Reset();
  enabled_ = false;
  weak_factory_.InvalidateWeakPtrs();
  if (socket_) {
    socket_->Close();
    socket_.reset();
  }
  reconnect_timer_.Stop();
  ping_timer_.Stop();
  pref_registrar_.RemoveAll();
  for (auto& reg : pending_registers_) {
    reg->timeout->Stop();
    std::move(reg->callback).Run("", gcm::GCMClient::GCM_DISABLED);
  }
  pending_registers_.clear();
  pending_store_ops_.clear();
  gcm::GCMDriver::Shutdown();
}

void RailPushDriver::ValidateRegistration(
    const std::string& app_id,
    const std::vector<std::string>& sender_ids,
    const std::string& registration_id,
    ValidateRegistrationCallback callback) {
  std::move(callback).Run(false);
}

void RailPushDriver::AddConnectionObserver(
    gcm::GCMConnectionObserver* observer) {}

void RailPushDriver::RemoveConnectionObserver(
    gcm::GCMConnectionObserver* observer) {}

gcm::GCMClient* RailPushDriver::GetGCMClientForTesting() const {
  return nullptr;
}

bool RailPushDriver::IsStarted() const {
  return enabled_;
}

bool RailPushDriver::IsConnected() const {
  return hello_done_;
}

void RailPushDriver::GetGCMStatistics(GetGCMStatisticsCallback callback,
                                       ClearActivityLogs) {
  std::move(callback).Run(gcm::GCMClient::GCMStatistics());
}

void RailPushDriver::SetGCMRecording(const GCMStatisticsRecordingCallback&,
                                      bool) {}

void RailPushDriver::SetAccountTokens(
    const std::vector<gcm::GCMClient::AccountTokenInfo>&) {}

void RailPushDriver::UpdateAccountMapping(const gcm::AccountMapping&) {}

void RailPushDriver::RemoveAccountMapping(const CoreAccountId&) {}

base::Time RailPushDriver::GetLastTokenFetchTime() {
  return base::Time();
}

void RailPushDriver::SetLastTokenFetchTime(const base::Time&) {}

gcm::InstanceIDHandler* RailPushDriver::GetInstanceIDHandlerInternal() {
  return this;
}

void RailPushDriver::AddHeartbeatInterval(const std::string&, int) {}

void RailPushDriver::RemoveHeartbeatInterval(const std::string&) {}

gcm::GCMClient::Result RailPushDriver::EnsureStarted(
    gcm::GCMClient::StartMode) {
  return enabled_ ? gcm::GCMClient::SUCCESS : gcm::GCMClient::GCM_DISABLED;
}

void RailPushDriver::RegisterImpl(const std::string& app_id,
                                   const std::vector<std::string>&) {
  RegisterFinished(app_id, "", gcm::GCMClient::GCM_DISABLED);
}

void RailPushDriver::UnregisterImpl(const std::string& app_id) {
  UnregisterFinished(app_id, gcm::GCMClient::GCM_DISABLED);
}

void RailPushDriver::SendImpl(const std::string& app_id,
                               const std::string&,
                               const gcm::OutgoingMessage& message) {
  SendFinished(app_id, message.id, gcm::GCMClient::GCM_DISABLED);
}

void RailPushDriver::RecordDecryptionFailure(const std::string&,
                                              gcm::GCMDecryptionResult) {}

void RailPushDriver::GetToken(const std::string& app_id,
                               const std::string& authorized_entity,
                               const std::string& scope,
                               base::TimeDelta time_to_live,
                               GetTokenCallback callback) {
  if (!enabled_ || !base::StartsWith(app_id, kWebPushAppIdPrefix)) {
    std::move(callback).Run("", gcm::GCMClient::GCM_DISABLED);
    return;
  }
  if (!store_ready_) {
    pending_store_ops_.push_back(
        base::BindOnce(&RailPushDriver::GetToken, weak_factory_.GetWeakPtr(),
                       app_id, authorized_entity, scope, time_to_live,
                       std::move(callback)));
    return;
  }
  const ChannelEntry* existing = store_.FindChannel(app_id, authorized_entity);
  if (existing) {
    std::move(callback).Run(existing->endpoint, gcm::GCMClient::SUCCESS);
    return;
  }
  std::string channel_id =
      base::Uuid::GenerateRandomV4().AsLowercaseString();
  auto reg = std::make_unique<PendingRegister>();
  reg->channel_id = channel_id;
  reg->app_id = app_id;
  reg->authorized_entity = authorized_entity;
  reg->callback = std::move(callback);
  reg->timeout = std::make_unique<base::OneShotTimer>();
  reg->timeout->Start(
      FROM_HERE, base::Seconds(30),
      base::BindOnce(&RailPushDriver::OnRegisterTimeout,
                     weak_factory_.GetWeakPtr(), channel_id));
  pending_registers_.push_back(std::move(reg));
  MaybeConnect();
  if (hello_done_) {
    SendRegister(*pending_registers_.back());
  }
}

void RailPushDriver::ValidateToken(const std::string& app_id,
                                    const std::string& authorized_entity,
                                    const std::string& scope,
                                    const std::string& token,
                                    ValidateTokenCallback callback) {
  if (!store_ready_) {
    pending_store_ops_.push_back(base::BindOnce(
        &RailPushDriver::ValidateToken, weak_factory_.GetWeakPtr(), app_id,
        authorized_entity, scope, token, std::move(callback)));
    return;
  }
  const ChannelEntry* ch = store_.FindChannel(app_id, authorized_entity);
  std::move(callback).Run(ch && ch->endpoint == token);
}

void RailPushDriver::DeleteToken(const std::string& app_id,
                                  const std::string& authorized_entity,
                                  const std::string& scope,
                                  DeleteTokenCallback callback) {
  if (!store_ready_) {
    pending_store_ops_.push_back(base::BindOnce(
        &RailPushDriver::DeleteToken, weak_factory_.GetWeakPtr(), app_id,
        authorized_entity, scope, std::move(callback)));
    return;
  }
  std::vector<std::string> removed =
      store_.RemoveChannels(app_id, authorized_entity);
  store_.Save();
  UpdateBackgroundWanted();
  if (hello_done_) {
    for (const auto& cid : removed) {
      SendUnregister(cid);
    }
  }
  MaybeDisconnect();
  std::move(callback).Run(gcm::GCMClient::SUCCESS);
}

void RailPushDriver::AddInstanceIDData(const std::string& app_id,
                                        const std::string& instance_id,
                                        const std::string& extra_data) {
  if (!store_ready_) {
    pending_store_ops_.push_back(
        base::BindOnce(&RailPushDriver::AddInstanceIDData,
                       weak_factory_.GetWeakPtr(), app_id, instance_id,
                       extra_data));
    return;
  }
  store_.SetInstanceIDData(app_id, instance_id, extra_data);
  store_.Save();
}

void RailPushDriver::RemoveInstanceIDData(const std::string& app_id) {
  if (!store_ready_) {
    pending_store_ops_.push_back(
        base::BindOnce(&RailPushDriver::RemoveInstanceIDData,
                       weak_factory_.GetWeakPtr(), app_id));
    return;
  }
  store_.RemoveInstanceIDData(app_id);
  store_.Save();
}

void RailPushDriver::GetInstanceIDData(const std::string& app_id,
                                        GetInstanceIDDataCallback callback) {
  if (!store_ready_) {
    pending_store_ops_.push_back(base::BindOnce(
        &RailPushDriver::GetInstanceIDData, weak_factory_.GetWeakPtr(), app_id,
        std::move(callback)));
    return;
  }
  auto [id, extra] = store_.GetInstanceIDData(app_id);
  std::move(callback).Run(id, extra);
}

void RailPushDriver::OnSocketOpen() {
  SendHello();
}

void RailPushDriver::OnSocketText(std::string text) {
  if (text == "{}") {
    return;
  }
  auto value = base::JSONReader::ReadDict(text, 0);
  if (!value) {
    return;
  }
  const std::string* type = value->FindString("messageType");
  if (!type) {
    return;
  }
  if (*type == "hello") {
    OnHello(*value);
  } else if (*type == "notification") {
    OnNotification(*value);
  } else if (*type == "register") {
    OnRegisterReply(*value);
  }
}

void RailPushDriver::OnSocketClosed(uint16_t code) {
  hello_done_ = false;
  ping_timer_.Stop();
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RailPushDriver::OnSocketClosedAsync,
                                 weak_factory_.GetWeakPtr(), code));
}

void RailPushDriver::OnStoreReady() {
  store_ready_ = true;
  std::vector<base::OnceClosure> ops;
  ops.swap(pending_store_ops_);
  for (auto& op : ops) {
    std::move(op).Run();
  }
  MaybeConnect();
  UpdateBackgroundWanted();
}

void RailPushDriver::MaybeConnect() {
  if (!enabled_ || !store_ready_) {
    return;
  }
  if (socket_) {
    return;
  }
  if (!HasChannelsOrPending()) {
    return;
  }
  socket_ = std::make_unique<RailPushSocket>(this);
  socket_->Connect(network_context_getter_.Run());
}

void RailPushDriver::MaybeDisconnect() {
  if (!socket_) {
    return;
  }
  if (HasChannelsOrPending()) {
    return;
  }
  socket_->Close();
}

void RailPushDriver::SendHello() {
  base::DictValue msg;
  msg.Set("messageType", "hello");
  msg.Set("uaid", store_.GetUaid());
  msg.Set("use_webpush", true);
  base::ListValue channel_ids;
  for (const auto& id : store_.AllChannelIds()) {
    channel_ids.Append(id);
  }
  msg.Set("channelIDs", std::move(channel_ids));
  if (socket_) {
    socket_->SendText(*base::WriteJson(msg));
  }
}

void RailPushDriver::SendPing() {
  if (socket_) {
    socket_->SendText("{}");
  }
}

void RailPushDriver::SendRegister(const PendingRegister& reg) {
  base::DictValue msg;
  msg.Set("messageType", "register");
  msg.Set("channelID", reg.channel_id);
  std::string decoded;
  if (base::Base64UrlDecode(reg.authorized_entity,
                             base::Base64UrlDecodePolicy::IGNORE_PADDING,
                             &decoded) &&
      decoded.size() == 65 &&
      static_cast<unsigned char>(decoded[0]) == 0x04) {
    msg.Set("key", reg.authorized_entity);
  }
  if (socket_) {
    socket_->SendText(*base::WriteJson(msg));
  }
}

void RailPushDriver::SendAck(const std::string& channel_id,
                              const std::string& version,
                              int code) {
  base::DictValue ack;
  ack.Set("messageType", "ack");
  base::ListValue updates;
  base::DictValue update;
  update.Set("channelID", channel_id);
  update.Set("version", version);
  update.Set("code", code);
  updates.Append(std::move(update));
  ack.Set("updates", std::move(updates));
  if (socket_) {
    socket_->SendText(*base::WriteJson(ack));
  }
}

void RailPushDriver::SendNack(const std::string& version, int code) {
  base::DictValue nack;
  nack.Set("messageType", "nack");
  nack.Set("version", version);
  nack.Set("code", code);
  if (socket_) {
    socket_->SendText(*base::WriteJson(nack));
  }
}

void RailPushDriver::SendUnregister(const std::string& channel_id) {
  base::DictValue msg;
  msg.Set("messageType", "unregister");
  msg.Set("channelID", channel_id);
  if (socket_) {
    socket_->SendText(*base::WriteJson(msg));
  }
}

void RailPushDriver::OnHello(const base::DictValue& msg) {
  const std::string* uaid = msg.FindString("uaid");
  if (!uaid || uaid->empty()) {
    return;
  }
  store_.SetUaid(*uaid);
  store_.Save();
  hello_done_ = true;
  ResetBackoff();
  ping_timer_.Start(
      FROM_HERE, base::Minutes(kPingIntervalMin),
      base::BindRepeating(&RailPushDriver::SendPing, base::Unretained(this)));
  for (const auto& reg : pending_registers_) {
    SendRegister(*reg);
  }
}

void RailPushDriver::OnRegisterReply(const base::DictValue& msg) {
  const std::string* channel_id = msg.FindString("channelID");
  if (!channel_id) {
    return;
  }
  auto it = std::find_if(
      pending_registers_.begin(), pending_registers_.end(),
      [&](const auto& r) {
        return base::EqualsCaseInsensitiveASCII(r->channel_id, *channel_id);
      });
  if (it == pending_registers_.end()) {
    return;
  }
  auto reg = std::move(*it);
  pending_registers_.erase(it);
  reg->timeout->Stop();

  std::optional<int> status = msg.FindInt("status");
  if (!status || *status != 200) {
    std::move(reg->callback).Run("", gcm::GCMClient::SERVER_ERROR);
    MaybeDisconnect();
    return;
  }
  const std::string* endpoint = msg.FindString("pushEndpoint");
  if (!endpoint || endpoint->empty()) {
    std::move(reg->callback).Run("", gcm::GCMClient::SERVER_ERROR);
    MaybeDisconnect();
    return;
  }
  store_.AddChannel(
      {reg->channel_id, reg->app_id, reg->authorized_entity, *endpoint});
  store_.Save();
  UpdateBackgroundWanted();
  std::move(reg->callback).Run(*endpoint, gcm::GCMClient::SUCCESS);
}

void RailPushDriver::OnNotification(const base::DictValue& msg) {
  const std::string* channel_id = msg.FindString("channelID");
  const std::string* version = msg.FindString("version");
  if (!channel_id || !version) {
    return;
  }
  const ChannelEntry* channel = store_.FindChannelById(*channel_id);
  if (!channel) {
    SendAck(*channel_id, *version, 100);
    SendUnregister(*channel_id);
    return;
  }
  gcm::IncomingMessage incoming;
  incoming.sender_id = channel->authorized_entity;
  incoming.message_id = *version;
  const std::string* data = msg.FindString("data");
  if (data && !data->empty()) {
    std::string decoded;
    if (!base::Base64UrlDecode(*data, base::Base64UrlDecodePolicy::IGNORE_PADDING,
                               &decoded)) {
      SendNack(*version, 301);
      return;
    }
    incoming.raw_data = decoded;
    const base::DictValue* headers = msg.FindDict("headers");
    if (headers) {
      const std::string* encoding = headers->FindString("encoding");
      if (encoding && *encoding == "aes128gcm") {
        incoming.data["content-encoding"] = "aes128gcm";
      } else if (encoding && *encoding == "aesgcm") {
        const std::string* encryption = headers->FindString("encryption");
        const std::string* crypto_key = headers->FindString("crypto_key");
        if (encryption) {
          incoming.data["encryption"] = *encryption;
        }
        if (crypto_key) {
          incoming.data["crypto-key"] = *crypto_key;
        }
      }
    }
  }
  std::string app_id = channel->app_id;
  DispatchMessage(app_id, incoming);
  SendAck(*channel_id, *version, 100);
}

void RailPushDriver::OnRegisterTimeout(const std::string& channel_id) {
  auto it = std::find_if(
      pending_registers_.begin(), pending_registers_.end(),
      [&](const auto& r) {
        return base::EqualsCaseInsensitiveASCII(r->channel_id, channel_id);
      });
  if (it == pending_registers_.end()) {
    return;
  }
  auto reg = std::move(*it);
  pending_registers_.erase(it);
  std::move(reg->callback).Run("", gcm::GCMClient::NETWORK_ERROR);
  MaybeDisconnect();
}

void RailPushDriver::OnSocketClosedAsync(uint16_t code) {
  socket_.reset();
  if (!enabled_ || code == 4000) {
    return;
  }
  ScheduleReconnect();
}

void RailPushDriver::OnPushEnabledPrefChanged() {
  bool new_enabled =
      pref_registrar_.prefs()->GetBoolean(kPushEnabledPref);
  if (enabled_ == new_enabled) {
    return;
  }
  enabled_ = new_enabled;
  if (!enabled_) {
    if (socket_) {
      socket_->Close();
    }
    reconnect_timer_.Stop();
    ping_timer_.Stop();
  } else if (store_ready_) {
    MaybeConnect();
  }
  UpdateBackgroundWanted();
}

void RailPushDriver::OnPushBackgroundPrefChanged() {
  UpdateBackgroundWanted();
}

void RailPushDriver::UpdateBackgroundWanted() {
  if (!background_wanted_callback_) {
    return;
  }
  bool wanted = enabled_ &&
                store_ready_ &&
                pref_registrar_.prefs()->GetBoolean(kPushBackgroundPref) &&
                !store_.AllChannelIds().empty();
  if (reported_background_wanted_.has_value() &&
      *reported_background_wanted_ == wanted) {
    return;
  }
  reported_background_wanted_ = wanted;
  background_wanted_callback_.Run(wanted);
}

void RailPushDriver::ScheduleReconnect() {
  reconnect_timer_.Start(
      FROM_HERE, base::Seconds(reconnect_delay_),
      base::BindOnce(&RailPushDriver::MaybeConnect,
                     weak_factory_.GetWeakPtr()));
  reconnect_delay_ = std::min(reconnect_delay_ * 2, kMaxReconnectDelaySec);
}

void RailPushDriver::ResetBackoff() {
  reconnect_delay_ = 1;
  reconnect_timer_.Stop();
}

bool RailPushDriver::HasChannelsOrPending() const {
  return !store_.AllChannelIds().empty() || !pending_registers_.empty();
}

}
