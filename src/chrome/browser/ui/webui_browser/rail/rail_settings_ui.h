#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SETTINGS_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SETTINGS_UI_H_

#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "base/callback_list.h"

#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_web_ui_controller.h"
#include "chrome/browser/ui/webui/top_chrome/top_chrome_webui_config.h"
#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"
#include "chrome/browser/ui/webui_browser/rail/rail_settings.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {
class WebUI;
}

namespace rail {

class RailSettingsUI;

inline constexpr char kRailSettingsHost[] = "rail-settings";
inline constexpr char kRailSettingsURL[] = "chrome://rail-settings/";
inline constexpr char kRailCreditsPath[] = "credits";
inline constexpr char kRailCreditsURL[] = "chrome://rail-settings/credits";

class RailSettingsUIConfig
    : public DefaultTopChromeWebUIConfig<RailSettingsUI> {
 public:
  RailSettingsUIConfig();
};

class RailSettingsUI : public TopChromeWebUIController,
                       public rail_settings::mojom::PageHandlerFactory,
                       public rail_settings::mojom::PageHandler {
 public:
  explicit RailSettingsUI(content::WebUI* web_ui);
  RailSettingsUI(const RailSettingsUI&) = delete;
  RailSettingsUI& operator=(const RailSettingsUI&) = delete;
  ~RailSettingsUI() override;

  static constexpr std::string_view GetWebUIName() { return "RailSettings"; }

  void BindInterface(
      mojo::PendingReceiver<rail_settings::mojom::PageHandlerFactory> receiver);

 private:
  void CreatePageHandler(
      mojo::PendingRemote<rail_settings::mojom::Page> page,
      mojo::PendingReceiver<rail_settings::mojom::PageHandler> handler)
      override;

  void ListProfiles(ListProfilesCallback callback) override;
  void GetSidebarState(GetSidebarStateCallback callback) override;
  void CreateProfile(const std::string& name,
                     CreateProfileCallback callback) override;
  void GetProfileDetail(const std::string& id,
                        GetProfileDetailCallback callback) override;
  void RenameProfile(const std::string& id, const std::string& name) override;
  void DeleteProfile(const std::string& id) override;
  void SetSearchEngine(const std::string& id,
                       const std::string& engine_id) override;
  void SetSearchSuggestions(const std::string& id, bool enabled) override;
  void OpenSearchSettings(const std::string& id) override;
  void GetOrganizeSettings(GetOrganizeSettingsCallback callback) override;
  void SetOpenRouterKey(const std::string& key) override;
  void SetOrganizeModel(const std::string& model) override;
  void GetSidebarIconsOnly(GetSidebarIconsOnlyCallback callback) override;
  void SetSidebarIconsOnly(bool icons_only) override;
  void GetThemedTitlebar(GetThemedTitlebarCallback callback) override;
  void SetThemedTitlebar(bool themed) override;
  void OpenCredits() override;
  void Close() override;

  void OnProfileCreated(CreateProfileCallback callback,
                        std::optional<ProfileEntry> entry);
  void OnProfileResolvedForDetail(GetProfileDetailCallback callback,
                                  Profile* profile);
  void SendProfileDetail(GetProfileDetailCallback callback, Profile* profile);
  void OnProfileResolvedForRename(const std::string& name, Profile* profile);
  void OnProfileResolvedForEngine(const std::string& engine_id,
                                  Profile* profile);

  std::vector<base::CallbackListSubscription> search_engine_subscriptions_;

  mojo::Receiver<rail_settings::mojom::PageHandlerFactory>
      page_factory_receiver_{this};
  mojo::Receiver<rail_settings::mojom::PageHandler> page_handler_receiver_{
      this};
  mojo::Remote<rail_settings::mojom::Page> page_;

  base::WeakPtrFactory<RailSettingsUI> weak_factory_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};

}

#endif
