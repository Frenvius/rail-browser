#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_SOCKET_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_PUSH_SOCKET_H_

#include <cstdint>
#include <string>
#include <vector>

#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "mojo/public/cpp/system/data_pipe.h"
#include "mojo/public/cpp/system/simple_watcher.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/mojom/network_context.mojom.h"
#include "services/network/public/mojom/websocket.mojom.h"

namespace rail {

class RailPushSocket : public network::mojom::WebSocketHandshakeClient,
                       public network::mojom::WebSocketClient {
 public:
  class Delegate {
   public:
    virtual ~Delegate() = default;
    virtual void OnSocketOpen() = 0;
    virtual void OnSocketText(std::string text) = 0;
    virtual void OnSocketClosed(uint16_t code) = 0;
  };

  explicit RailPushSocket(Delegate* delegate);
  ~RailPushSocket() override;

  RailPushSocket(const RailPushSocket&) = delete;
  RailPushSocket& operator=(const RailPushSocket&) = delete;

  void Connect(network::mojom::NetworkContext* context);
  void SendText(const std::string& text);
  void Close();

 private:
  void OnOpeningHandshakeStarted(
      network::mojom::WebSocketHandshakeRequestPtr request) override;
  void OnFailure(const std::string& message,
                 int net_error,
                 int response_code) override;
  void OnConnectionEstablished(
      mojo::PendingRemote<network::mojom::WebSocket> socket,
      mojo::PendingReceiver<network::mojom::WebSocketClient> client_receiver,
      network::mojom::WebSocketHandshakeResponsePtr response,
      mojo::ScopedDataPipeConsumerHandle readable,
      mojo::ScopedDataPipeProducerHandle writable) override;
  void OnDataFrame(bool finish,
                   network::mojom::WebSocketMessageType type,
                   uint64_t data_len) override;
  void OnDropChannel(bool was_clean,
                     uint16_t code,
                     const std::string& reason) override;
  void OnClosingHandshake() override;

  void ReadFromDataPipe(MojoResult result,
                        const mojo::HandleSignalsState& state);
  void ProcessCompletedFrame();
  void ClosePipe(uint16_t code);

  Delegate* const delegate_;
  bool open_ = false;

  mojo::Receiver<network::mojom::WebSocketHandshakeClient>
      handshake_receiver_{this};
  mojo::Receiver<network::mojom::WebSocketClient> client_receiver_{this};
  mojo::Remote<network::mojom::WebSocket> websocket_;
  mojo::ScopedDataPipeConsumerHandle readable_;
  mojo::ScopedDataPipeProducerHandle writable_;
  mojo::SimpleWatcher readable_watcher_;

  std::vector<uint8_t> frame_buf_;
  size_t frame_read_ = 0;
  bool frame_fin_ = false;
  std::string message_buf_;
};

}

#endif
