#include "chrome/browser/ui/webui_browser/rail/rail_import_keyring_linux.h"

#include <array>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "base/containers/span.h"
#include "base/memory/scoped_refptr.h"
#include "base/no_destructor.h"
#include "base/synchronization/lock.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"
#include "dbus/bus.h"
#include "dbus/message.h"
#include "dbus/object_path.h"
#include "dbus/object_proxy.h"
#include "third_party/boringssl/src/include/openssl/evp.h"

namespace rail {

namespace {

constexpr char kSecretServiceName[] = "org.freedesktop.secrets";
constexpr char kSecretServicePath[] = "/org/freedesktop/secrets";
constexpr char kServiceInterface[] = "org.freedesktop.Secret.Service";
constexpr char kItemInterface[] = "org.freedesktop.Secret.Item";
constexpr char kSessionInterface[] = "org.freedesktop.Secret.Session";
constexpr char kSchemaAttribute[] = "xdg:schema";
constexpr char kSchema[] = "chrome_libsecret_os_crypt_password_v2";
constexpr char kApplicationAttribute[] = "application";
constexpr char kNoPrompt[] = "/";
constexpr char kSalt[] = "saltysalt";
constexpr int kCallTimeoutMs = 5000;
constexpr size_t kKeyLength = 16;

struct SearchResult {
  std::vector<dbus::ObjectPath> unlocked;
  std::vector<dbus::ObjectPath> locked;
};

std::string KeyringApplication(const base::FilePath& user_data) {
  for (const ImportSourceSpec& spec : ImportSourceSpecs()) {
    if (spec.root != user_data) {
      continue;
    }
    if (spec.id == "chrome" || spec.id == "vivaldi") {
      return "chrome";
    }
    if (spec.id == "edge" || spec.id == "opera") {
      return "chromium";
    }
    if (spec.id == "brave") {
      return "brave";
    }
    return {};
  }
  return {};
}

std::unique_ptr<dbus::Response> Call(dbus::ObjectProxy* proxy,
                                     dbus::MethodCall& call) {
  auto response = proxy->CallMethodAndBlock(&call, kCallTimeoutMs);
  return response.has_value() ? std::move(response.value()) : nullptr;
}

std::optional<dbus::ObjectPath> OpenSession(dbus::ObjectProxy* service) {
  dbus::MethodCall call(kServiceInterface, "OpenSession");
  dbus::MessageWriter writer(&call);
  writer.AppendString("plain");
  writer.AppendVariantOfString(std::string());
  std::unique_ptr<dbus::Response> response = Call(service, call);
  if (!response) {
    return std::nullopt;
  }
  dbus::MessageReader reader(response.get());
  dbus::MessageReader output(nullptr);
  dbus::ObjectPath session;
  if (!reader.PopVariant(&output) || !reader.PopObjectPath(&session)) {
    return std::nullopt;
  }
  return session;
}

void CloseSession(dbus::Bus* bus, const dbus::ObjectPath& session) {
  dbus::MethodCall call(kSessionInterface, "Close");
  Call(bus->GetObjectProxy(kSecretServiceName, session), call);
}

std::optional<SearchResult> SearchItems(dbus::ObjectProxy* service,
                                        const std::string& application) {
  dbus::MethodCall call(kServiceInterface, "SearchItems");
  dbus::MessageWriter writer(&call);
  dbus::MessageWriter attributes(nullptr);
  writer.OpenArray("{ss}", &attributes);
  for (const auto& [name, value] :
       std::map<std::string, std::string>{{kSchemaAttribute, kSchema},
                                          {kApplicationAttribute, application}}) {
    dbus::MessageWriter entry(nullptr);
    attributes.OpenDictEntry(&entry);
    entry.AppendString(name);
    entry.AppendString(value);
    attributes.CloseContainer(&entry);
  }
  writer.CloseContainer(&attributes);
  std::unique_ptr<dbus::Response> response = Call(service, call);
  if (!response) {
    return std::nullopt;
  }
  dbus::MessageReader reader(response.get());
  SearchResult result;
  if (!reader.PopArrayOfObjectPaths(&result.unlocked) ||
      !reader.PopArrayOfObjectPaths(&result.locked)) {
    return std::nullopt;
  }
  return result;
}

bool UnlockWithoutPrompt(dbus::ObjectProxy* service,
                         const dbus::ObjectPath& item) {
  dbus::MethodCall call(kServiceInterface, "Unlock");
  dbus::MessageWriter writer(&call);
  writer.AppendArrayOfObjectPaths({item});
  std::unique_ptr<dbus::Response> response = Call(service, call);
  if (!response) {
    return false;
  }
  dbus::MessageReader reader(response.get());
  std::vector<dbus::ObjectPath> unlocked;
  dbus::ObjectPath prompt;
  return reader.PopArrayOfObjectPaths(&unlocked) &&
         reader.PopObjectPath(&prompt) && prompt.value() == kNoPrompt &&
         !unlocked.empty();
}

std::optional<std::string> ReadSecret(dbus::Bus* bus,
                                      const dbus::ObjectPath& item,
                                      const dbus::ObjectPath& session) {
  dbus::MethodCall call(kItemInterface, "GetSecret");
  dbus::MessageWriter writer(&call);
  writer.AppendObjectPath(session);
  std::unique_ptr<dbus::Response> response =
      Call(bus->GetObjectProxy(kSecretServiceName, item), call);
  if (!response) {
    return std::nullopt;
  }
  dbus::MessageReader reader(response.get());
  dbus::MessageReader secret(nullptr);
  dbus::ObjectPath secret_session;
  base::span<const uint8_t> parameters;
  base::span<const uint8_t> value;
  if (!reader.PopStruct(&secret) || !secret.PopObjectPath(&secret_session) ||
      !secret.PopArrayOfBytes(&parameters) || !secret.PopArrayOfBytes(&value) ||
      value.empty()) {
    return std::nullopt;
  }
  return std::string(value.begin(), value.end());
}

std::optional<std::string> ReadSafeStoragePassword(
    const std::string& application) {
  dbus::Bus::Options options;
  options.bus_type = dbus::Bus::SESSION;
  options.connection_type = dbus::Bus::PRIVATE;
  scoped_refptr<dbus::Bus> bus =
      base::MakeRefCounted<dbus::Bus>(std::move(options));
  std::optional<std::string> password;
  if (bus->Connect()) {
    dbus::ObjectProxy* service = bus->GetObjectProxy(
        kSecretServiceName, dbus::ObjectPath(kSecretServicePath));
    const std::optional<SearchResult> items = SearchItems(service, application);
    std::optional<dbus::ObjectPath> item;
    if (items && !items->unlocked.empty()) {
      item = items->unlocked.front();
    } else if (items && !items->locked.empty() &&
               UnlockWithoutPrompt(service, items->locked.front())) {
      item = items->locked.front();
    }
    const std::optional<dbus::ObjectPath> session =
        item ? OpenSession(service) : std::nullopt;
    if (session) {
      password = ReadSecret(bus.get(), *item, *session);
      CloseSession(bus.get(), *session);
    }
  }
  bus->ShutdownAndBlock();
  return password;
}

std::optional<std::string> DeriveKey(const std::string& password) {
  std::array<uint8_t, kKeyLength> key;
  const base::span<const uint8_t> salt =
      base::as_byte_span(base::span_from_cstring(kSalt));
  if (!PKCS5_PBKDF2_HMAC_SHA1(password.data(), password.size(), salt.data(),
                              salt.size(), 1, key.size(), key.data())) {
    return std::nullopt;
  }
  return std::string(key.begin(), key.end());
}

}

std::optional<std::string> ReadLinuxImportKey(const base::FilePath& user_data) {
  const std::string application = KeyringApplication(user_data);
  if (application.empty()) {
    return std::nullopt;
  }
  static base::NoDestructor<base::Lock> lock;
  static base::NoDestructor<std::map<std::string, std::string>> keys;
  base::AutoLock hold(*lock);
  if (const auto found = keys->find(application); found != keys->end()) {
    return found->second;
  }
  const std::optional<std::string> password =
      ReadSafeStoragePassword(application);
  std::optional<std::string> key =
      password ? DeriveKey(*password) : std::nullopt;
  if (key) {
    keys->emplace(application, *key);
  }
  return key;
}

}
