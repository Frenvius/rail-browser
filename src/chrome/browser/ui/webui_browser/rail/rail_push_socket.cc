#include "chrome/browser/ui/webui_browser/rail/rail_push_socket.h"

#include <utility>

#include "base/containers/span.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "net/base/isolation_info.h"
#include "net/storage_access_api/status.h"
#include "services/network/public/cpp/constants.h"
#include "services/network/public/cpp/originating_process_id.h"
#include "services/network/public/mojom/ip_address_space.mojom.h"
#include "url/gurl.h"
#include "url/origin.h"

namespace rail {

namespace {

constexpr char kPushUrl[] = "wss://push.railbrowser.app/";
constexpr size_t kMaxMessageBytes = 65536;

constexpr net::NetworkTrafficAnnotationTag kTrafficAnnotation =
    net::DefineNetworkTrafficAnnotation("rail_web_push", R"(
      semantics {
        sender: "Rail Web Push"
        description:
          "Maintains a WebSocket connection to Rail's push service to deliver "
          "Web Push notifications subscribed by sites."
        trigger:
          "When a site calls PushManager.subscribe() and push is enabled."
        data: "Encrypted Web Push notification payloads."
        destination: OTHER
        destination_other: "Rail's push service at push.railbrowser.app"
      }
      policy {
        cookies_allowed: NO
        setting: "Disable via the push notifications toggle in Rail Settings."
        policy_exception_justification: "Not implemented."
      })");

}

RailPushSocket::RailPushSocket(Delegate* delegate)
    : delegate_(delegate),
      readable_watcher_(FROM_HERE,
                        mojo::SimpleWatcher::ArmingPolicy::MANUAL) {}

RailPushSocket::~RailPushSocket() = default;

void RailPushSocket::Connect(network::mojom::NetworkContext* context) {
  GURL url(kPushUrl);
  auto handshake_remote = handshake_receiver_.BindNewPipeAndPassRemote();
  handshake_receiver_.set_disconnect_handler(
      base::BindOnce(&RailPushSocket::ClosePipe, base::Unretained(this),
                     1006));
  context->CreateWebSocket(
      url, {}, net::StorageAccessApiStatus::kNone,
      net::IsolationInfo::CreateForInternalRequest(url::Origin::Create(url)),
      {}, network::OriginatingProcessId::browser(), url::Origin::Create(url),
      network::mojom::ClientSecurityState::New(),
      network::mojom::kWebSocketOptionBlockAllCookies,
      net::MutableNetworkTrafficAnnotationTag(kTrafficAnnotation),
      std::move(handshake_remote), mojo::NullRemote(), mojo::NullRemote(),
      mojo::NullRemote(), std::nullopt,
      network::GetNoOpNetworkRestrictionsId(),
      network::mojom::IPAddressSpace::kUnknown, std::nullopt);
}

void RailPushSocket::SendText(const std::string& text) {
  if (!open_) {
    return;
  }
  websocket_->SendMessage(network::mojom::WebSocketMessageType::TEXT,
                          text.size());
  writable_->WriteAllData(base::as_byte_span(text));
}

void RailPushSocket::Close() {
  ClosePipe(1000);
}

void RailPushSocket::OnOpeningHandshakeStarted(
    network::mojom::WebSocketHandshakeRequestPtr) {}

void RailPushSocket::OnFailure(const std::string&, int, int) {
  ClosePipe(1006);
}

void RailPushSocket::OnConnectionEstablished(
    mojo::PendingRemote<network::mojom::WebSocket> socket,
    mojo::PendingReceiver<network::mojom::WebSocketClient> client_receiver,
    network::mojom::WebSocketHandshakeResponsePtr,
    mojo::ScopedDataPipeConsumerHandle readable,
    mojo::ScopedDataPipeProducerHandle writable) {
  websocket_.Bind(std::move(socket));
  readable_ = std::move(readable);
  writable_ = std::move(writable);
  client_receiver_.Bind(std::move(client_receiver));
  handshake_receiver_.set_disconnect_handler(base::DoNothing());
  client_receiver_.set_disconnect_handler(base::BindOnce(
      &RailPushSocket::ClosePipe, base::Unretained(this), 1006));
  readable_watcher_.Watch(
      readable_.get(), MOJO_HANDLE_SIGNAL_READABLE,
      MOJO_TRIGGER_CONDITION_SIGNALS_SATISFIED,
      base::BindRepeating(&RailPushSocket::ReadFromDataPipe,
                          base::Unretained(this)));
  websocket_->StartReceiving();
  open_ = true;
  delegate_->OnSocketOpen();
}

void RailPushSocket::OnDataFrame(bool finish,
                                  network::mojom::WebSocketMessageType type,
                                  uint64_t data_len) {
  if (type != network::mojom::WebSocketMessageType::TEXT &&
      type != network::mojom::WebSocketMessageType::CONTINUATION) {
    ClosePipe(1002);
    return;
  }
  if (message_buf_.size() + data_len > kMaxMessageBytes) {
    ClosePipe(1009);
    return;
  }
  if (data_len == 0) {
    if (finish) {
      ProcessCompletedFrame();
    }
    return;
  }
  frame_buf_.resize(data_len);
  frame_read_ = 0;
  frame_fin_ = finish;
  client_receiver_.Pause();
  ReadFromDataPipe(MOJO_RESULT_OK, {});
}

void RailPushSocket::OnDropChannel(bool, uint16_t code, const std::string&) {
  ClosePipe(code);
}

void RailPushSocket::OnClosingHandshake() {}

void RailPushSocket::ReadFromDataPipe(MojoResult,
                                       const mojo::HandleSignalsState&) {
  size_t read = 0;
  const MojoResult result = readable_->ReadData(
      MOJO_READ_DATA_FLAG_NONE,
      base::span(frame_buf_).subspan(frame_read_), read);
  if (result == MOJO_RESULT_OK) {
    frame_read_ += read;
    if (frame_read_ < frame_buf_.size()) {
      readable_watcher_.ArmOrNotify();
    } else {
      client_receiver_.Resume();
      message_buf_.append(
          reinterpret_cast<const char*>(frame_buf_.data()), frame_buf_.size());
      frame_buf_.clear();
      frame_read_ = 0;
      if (frame_fin_) {
        ProcessCompletedFrame();
      }
    }
  } else if (result == MOJO_RESULT_SHOULD_WAIT) {
    readable_watcher_.ArmOrNotify();
  } else {
    ClosePipe(1006);
  }
}

void RailPushSocket::ProcessCompletedFrame() {
  std::string text;
  text.swap(message_buf_);
  delegate_->OnSocketText(std::move(text));
}

void RailPushSocket::ClosePipe(uint16_t code) {
  if (!open_ && !handshake_receiver_.is_bound()) {
    return;
  }
  open_ = false;
  websocket_.reset();
  readable_watcher_.Cancel();
  readable_.reset();
  writable_.reset();
  client_receiver_.reset();
  handshake_receiver_.reset();
  frame_buf_.clear();
  frame_read_ = 0;
  message_buf_.clear();
  delegate_->OnSocketClosed(code);
}

}
