#include "chrome/browser/ui/webui_browser/rail/rail_downloads.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/functional/callback.h"
#include "chrome/browser/download/download_core_service.h"
#include "chrome/browser/download/download_core_service_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/downloads/downloads_dom_handler.h"
#include "content/public/browser/download_manager.h"
#include "content/public/browser/web_ui.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace rail {

class Downloads::Relay : public downloads::mojom::Page {
 public:
  explicit Relay(mojo::PendingRemote<downloads::mojom::Page> page)
      : page_(std::move(page)) {}

  void Start(Profile* profile,
             content::WebUI* web_ui,
             mojo::PendingReceiver<downloads::mojom::PageHandler> receiver,
             base::OnceClosure on_closed) {
    page_.set_disconnect_handler(std::move(on_closed));
    handler_ = std::make_unique<DownloadsDOMHandler>(
        std::move(receiver), receiver_.BindNewPipeAndPassRemote(),
        profile->GetDownloadManager(), web_ui);
  }

  void RemoveItem(int32_t index) override { page_->RemoveItem(index); }

  void UpdateItem(int32_t index, downloads::mojom::DataPtr data) override {
    page_->UpdateItem(index, std::move(data));
  }

  void InsertItems(int32_t index,
                   std::vector<downloads::mojom::DataPtr> items) override {
    page_->InsertItems(index, std::move(items));
  }

  void ClearAll() override { page_->ClearAll(); }

 private:
  mojo::Remote<downloads::mojom::Page> page_;
  mojo::Receiver<downloads::mojom::Page> receiver_{this};
  std::unique_ptr<DownloadsDOMHandler> handler_;
};

Downloads::Downloads(content::WebUI* web_ui) : web_ui_(web_ui) {}

Downloads::~Downloads() = default;

void Downloads::CreatePageHandler(
    Profile* profile,
    mojo::PendingRemote<downloads::mojom::Page> page,
    mojo::PendingReceiver<downloads::mojom::PageHandler> receiver) {
  if (DownloadCoreService* service =
          DownloadCoreServiceFactory::GetForBrowserContext(profile)) {
    service->InitializeHistory();
  }
  auto relay = std::make_unique<Relay>(std::move(page));
  relay->Start(profile, web_ui_, std::move(receiver),
               base::BindOnce(&Downloads::Drop, base::Unretained(this),
                              relay.get()));
  relays_.push_back(std::move(relay));
}

void Downloads::Drop(Relay* relay) {
  std::erase_if(relays_, [relay](const std::unique_ptr<Relay>& entry) {
    return entry.get() == relay;
  });
}

}
