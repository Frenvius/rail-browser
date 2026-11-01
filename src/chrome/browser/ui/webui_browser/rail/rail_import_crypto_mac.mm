#include "chrome/browser/ui/webui_browser/rail/rail_import_crypto_mac.h"

#include <CommonCrypto/CommonKeyDerivation.h>

#include <array>
#include <string>
#include <vector>

#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"
#include "crypto/apple/keychain_v2.h"

namespace rail {

std::optional<std::string> ReadMacImportKey(const base::FilePath& user_data) {
  std::string service;
  std::string account;
  for (const ImportSourceSpec& spec : ImportSourceSpecs()) {
    if (spec.root != user_data) {
      continue;
    }
    if (spec.id == "brave") {
      service = "Brave Safe Storage";
      account = "Brave";
    } else if (spec.id == "vivaldi") {
      service = "Vivaldi Safe Storage";
      account = "Vivaldi";
    } else if (spec.id == "edge") {
      service = "Microsoft Edge Safe Storage";
      account = "Microsoft Edge";
    } else if (spec.id == "opera") {
      service = "Opera Safe Storage";
      account = "Opera";
    } else if (spec.id == "arc") {
      service = "Arc Safe Storage";
      account = "Arc";
    } else if (spec.id == "chrome") {
      service = "Chrome Safe Storage";
      account = "Chrome";
    }
    break;
  }
  if (service.empty()) {
    return std::nullopt;
  }
  auto password = crypto::apple::KeychainV2::GetInstance().FindGenericPassword(
      service, account);
  if (!password || password->empty()) {
    return std::nullopt;
  }
  constexpr char salt[] = "saltysalt";
  std::array<uint8_t, 16> key;
  if (CCKeyDerivationPBKDF(kCCPBKDF2,
                           reinterpret_cast<const char*>(password->data()),
                           password->size(), reinterpret_cast<const uint8_t*>(salt),
                           sizeof(salt) - 1, kCCPRFHmacAlgSHA1, 1003,
                           key.data(), key.size()) != 0) {
    return std::nullopt;
  }
  return std::string(key.begin(), key.end());
}

}
