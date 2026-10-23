#include "chrome/browser/ui/webui_browser/rail/rail_tab_organizer.h"

#include <utility>

#include "base/base64.h"
#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/os_crypt/async/common/encryptor.h"
#include "components/pref_registry/pref_registry_syncable.h"
#include "components/prefs/pref_service.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr char kKeyPref[] = "rail.openrouter_key";
constexpr char kModelPref[] = "rail.organize_model";
constexpr char kDefaultModel[] = "anthropic/claude-haiku-5.5";
constexpr char kEndpoint[] = "https://openrouter.ai/api/v1/chat/completions";
constexpr size_t kMaxResponseBytes = 256 * 1024;

std::string BuildBody(const std::string& model, const std::string& prompt) {
  base::DictValue message;
  message.Set("role", "user");
  message.Set("content", prompt);

  base::ListValue messages;
  messages.Append(std::move(message));

  base::DictValue body;
  body.Set("model", model);
  body.Set("messages", std::move(messages));

  std::string json;
  base::JSONWriter::Write(body, &json);
  return json;
}

void StoreSealedKey(base::WeakPtr<Profile> profile,
                    const std::string& key,
                    scoped_refptr<os_crypt_async::Encryptor> encryptor) {
  if (!profile || !encryptor) {
    return;
  }
  std::string sealed;
  if (!encryptor->EncryptString(key, &sealed)) {
    return;
  }
  profile->GetPrefs()->SetString(kKeyPref, base::Base64Encode(sealed));
}

}

void RegisterTabOrganizerProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterStringPref(kKeyPref, std::string());
  registry->RegisterStringPref(kModelPref, kDefaultModel);
}

bool HasOpenRouterKey(PrefService* prefs) {
  return prefs && !prefs->GetString(kKeyPref).empty();
}

void SetOpenRouterKey(Profile* profile, const std::string& key) {
  if (!profile) {
    return;
  }
  if (key.empty()) {
    profile->GetPrefs()->SetString(kKeyPref, std::string());
    return;
  }
  g_browser_process->os_crypt_async()->GetInstance(
      base::BindOnce(&StoreSealedKey, profile->GetWeakPtr(), key));
}

std::string GetOrganizeModel(PrefService* prefs) {
  return prefs ? prefs->GetString(kModelPref) : std::string(kDefaultModel);
}

void SetOrganizeModel(PrefService* prefs, const std::string& model) {
  if (prefs) {
    prefs->SetString(kModelPref, model.empty() ? kDefaultModel : model);
  }
}

TabOrganizer::TabOrganizer() = default;

TabOrganizer::~TabOrganizer() = default;

void TabOrganizer::Organize(Profile* profile,
                            const std::string& prompt,
                            OrganizeTabsCallback callback) {
  if (!profile || !HasOpenRouterKey(profile->GetPrefs())) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  g_browser_process->os_crypt_async()->GetInstance(base::BindOnce(
      &TabOrganizer::OnEncryptor, weak_factory_.GetWeakPtr(),
      profile->GetWeakPtr(), prompt, std::move(callback)));
}

void TabOrganizer::OnEncryptor(
    base::WeakPtr<Profile> profile,
    const std::string& prompt,
    OrganizeTabsCallback callback,
    scoped_refptr<os_crypt_async::Encryptor> encryptor) {
  if (!profile || !encryptor) {
    std::move(callback).Run(std::nullopt);
    return;
  }
  PrefService* prefs = profile->GetPrefs();
  std::string sealed;
  std::string key;
  if (!base::Base64Decode(prefs->GetString(kKeyPref), &sealed) ||
      !encryptor->DecryptString(sealed, &key) || key.empty()) {
    std::move(callback).Run(std::nullopt);
    return;
  }

  constexpr net::NetworkTrafficAnnotationTag kAnnotation =
      net::DefineNetworkTrafficAnnotation("rail_tab_organizer", R"(
        semantics {
          sender: "Rail Tab Organizer"
          description:
            "Sends the titles and hostnames of the open tabs in the current "
            "space to the OpenRouter chat completions endpoint, which returns "
            "a grouping of those tabs."
          trigger:
            "The user activates Tidy in the sidebar."
          data:
            "Tab titles and hostnames of the active space, and the model name "
            "chosen in settings."
          destination: OTHER
          destination_other: "OpenRouter"
        }
        policy {
          cookies_allowed: NO
          setting:
            "Disabled unless the user stores an OpenRouter API key in Rail "
            "settings."
          policy_exception_justification: "Not implemented."
        })");

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL(kEndpoint);
  request->method = "POST";
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->headers.SetHeader("Authorization", "Bearer " + key);

  loader_ = network::SimpleURLLoader::Create(std::move(request), kAnnotation);
  loader_->AttachStringForUpload(BuildBody(GetOrganizeModel(prefs), prompt),
                                 "application/json");
  loader_->DownloadToString(
      profile->GetURLLoaderFactory().get(),
      base::BindOnce(&TabOrganizer::OnResponse, weak_factory_.GetWeakPtr(),
                     std::move(callback)),
      kMaxResponseBytes);
}

void TabOrganizer::OnResponse(OrganizeTabsCallback callback,
                              std::optional<std::string> body) {
  loader_.reset();
  std::move(callback).Run(body);
}

}
