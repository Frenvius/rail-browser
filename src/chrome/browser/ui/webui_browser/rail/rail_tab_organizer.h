#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_ORGANIZER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_ORGANIZER_H_

#include <memory>
#include <optional>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"

class PrefService;
class Profile;

namespace network {
class SimpleURLLoader;
}

namespace os_crypt_async {
class Encryptor;
}

namespace user_prefs {
class PrefRegistrySyncable;
}

namespace rail {

extern const char kAssistantEnabledPref[];
extern const char kTidyEnabledPref[];

void RegisterTabOrganizerProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry);

bool IsAssistantEnabled(PrefService* prefs);

bool IsTidyEnabled(PrefService* prefs);

bool HasOpenRouterKey(PrefService* prefs);

void SetOpenRouterKey(Profile* profile, const std::string& key);

std::string GetOrganizeModel(PrefService* prefs);

void SetOrganizeModel(PrefService* prefs, const std::string& model);

using OrganizeTabsCallback =
    base::OnceCallback<void(const std::optional<std::string>& response)>;

class TabOrganizer {
 public:
  TabOrganizer();
  TabOrganizer(const TabOrganizer&) = delete;
  TabOrganizer& operator=(const TabOrganizer&) = delete;
  ~TabOrganizer();

  void Organize(Profile* profile,
                const std::string& prompt,
                OrganizeTabsCallback callback);

 private:
  void OnEncryptor(base::WeakPtr<Profile> profile,
                   const std::string& prompt,
                   OrganizeTabsCallback callback,
                   scoped_refptr<os_crypt_async::Encryptor> encryptor);
  void OnResponse(OrganizeTabsCallback callback,
                  std::optional<std::string> body);

  std::unique_ptr<network::SimpleURLLoader> loader_;
  base::WeakPtrFactory<TabOrganizer> weak_factory_{this};
};

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_TAB_ORGANIZER_H_
