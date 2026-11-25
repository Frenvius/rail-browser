#include "chrome/browser/ui/webui_browser/rail/rail_push_background.h"

#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>

#include "base/command_line.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/no_destructor.h"
#include "base/memory/raw_ptr.h"
#include "base/path_service.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/thread_pool.h"
#include "base/timer/timer.h"
#include "build/build_config.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/chrome_browser_main_extra_parts.h"
#include "chrome/browser/gcm/gcm_profile_service_factory.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/lifetime/termination_notification.h"
#include "chrome/browser/profiles/keep_alive/profile_keep_alive_types.h"
#include "chrome/browser/profiles/keep_alive/scoped_profile_keep_alive.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_attributes_entry.h"
#include "chrome/browser/profiles/profile_attributes_storage.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/status_icons/status_icon.h"
#include "chrome/browser/status_icons/status_icon_menu_model.h"
#include "chrome/browser/status_icons/status_icon_observer.h"
#include "chrome/browser/status_icons/status_tray.h"
#include "chrome/browser/ui/browser_commands.h"
#include "chrome/common/chrome_switches.h"
#include "components/gcm_driver/gcm_profile_service.h"
#include "components/keep_alive_registry/keep_alive_types.h"
#include "components/keep_alive_registry/scoped_keep_alive.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "crypto/hash.h"

#include "ui/gfx/image/image_skia.h"

#if BUILDFLAG(IS_WIN)
#include "base/base_paths.h"
#include "base/win/win_util.h"
#include "chrome/browser/win/app_icon.h"
#include "ui/gfx/geometry/size.h"
#include "ui/gfx/image/image_family.h"
#endif

#if BUILDFLAG(IS_MAC)
#include "base/apple/bundle_locations.h"
#include "base/mac/mac_util.h"
#endif

#if BUILDFLAG(IS_LINUX)
#include "base/strings/string_util.h"
#include "chrome/browser/shell_integration_linux.h"
#include "chrome/common/auto_start_linux.h"
#include "chrome/grit/chrome_unscaled_resources.h"
#include "ui/base/resource/resource_bundle.h"
#endif

namespace rail {

namespace {

inline constexpr char kPushBackgroundProfilesPref[] =
    "rail.push.background_profiles";

#if BUILDFLAG(IS_MAC)
inline constexpr char kPushLoginItemPref[] = "rail.push.login_item";
#endif

enum { kCmdOpenRail = 1, kCmdQuitRail = 2 };

class PushBackgroundManager : public StatusIconObserver,
                              public StatusIconMenuModel::Delegate {
 public:
  static PushBackgroundManager& Get() {
    static base::NoDestructor<PushBackgroundManager> instance;
    return *instance;
  }

  PushBackgroundManager(const PushBackgroundManager&) = delete;
  PushBackgroundManager& operator=(const PushBackgroundManager&) = delete;

  void Start() {
    if (started_) {
      return;
    }
    started_ = true;

    terminating_subscription_ =
        browser_shutdown::AddAppTerminatingCallback(base::BindOnce(
            &PushBackgroundManager::OnAppTerminating, base::Unretained(this)));

    ProfileManager* pm = g_browser_process->profile_manager();
    PrefService* local_state = g_browser_process->local_state();
    const base::ListValue& names =
        local_state->GetList(kPushBackgroundProfilesPref);

    std::vector<std::string> valid_names;
    ProfileAttributesStorage& storage = pm->GetProfileAttributesStorage();
    for (const base::Value& v : names) {
      const std::string* name = v.GetIfString();
      if (!name || name->empty()) {
        continue;
      }
      base::FilePath path =
          pm->user_data_dir().Append(base::FilePath::FromUTF8Unsafe(*name));
      if (!storage.GetProfileAttributesWithPath(path)) {
        continue;
      }
      valid_names.push_back(*name);
      pending_.insert(path);
    }

    if (valid_names.size() != names.size()) {
      base::ListValue pruned;
      for (const auto& n : valid_names) {
        pruned.Append(n);
      }
      local_state->SetList(kPushBackgroundProfilesPref, std::move(pruned));
    }

    if (!pending_.empty()) {
      startup_keep_alive_ = std::make_unique<ScopedKeepAlive>(
          KeepAliveOrigin::BACKGROUND_MODE_MANAGER_STARTUP,
          KeepAliveRestartOption::DISABLED);
      startup_timeout_.Start(
          FROM_HERE, base::Seconds(60),
          base::BindOnce(&PushBackgroundManager::OnStartupTimeout,
                         base::Unretained(this)));
      for (const base::FilePath& path : pending_) {
        pm->LoadProfileByPath(
            path, false,
            base::BindOnce(&PushBackgroundManager::OnProfileLoaded,
                           base::Unretained(this), path));
      }
    }

    MaybeUpdateRunEntry();
  }

  void SetWanted(Profile* profile, bool wanted) {
    if (terminating_ || profile->IsOffTheRecord()) {
      return;
    }

    base::FilePath profile_path = profile->GetPath();
    std::string base_name = profile_path.BaseName().AsUTF8Unsafe();

    PrefService* local_state = g_browser_process->local_state();
    const base::ListValue& existing =
        local_state->GetList(kPushBackgroundProfilesPref);

    bool already_in_list = false;
    for (const base::Value& v : existing) {
      const std::string* s = v.GetIfString();
      if (s && *s == base_name) {
        already_in_list = true;
        break;
      }
    }

    if (wanted && !already_in_list) {
      base::ListValue updated = existing.Clone();
      updated.Append(base_name);
      local_state->SetList(kPushBackgroundProfilesPref, std::move(updated));
    } else if (!wanted && already_in_list) {
      base::ListValue updated;
      for (const base::Value& v : existing) {
        const std::string* s = v.GetIfString();
        if (s && *s != base_name) {
          updated.Append(*s);
        }
      }
      local_state->SetList(kPushBackgroundProfilesPref, std::move(updated));
    }

    MaybeUpdateRunEntry();

    pending_.erase(profile_path);
    MaybeReleasePendingKeepAlive();

    if (wanted) {
      if (!live_.count(profile_path)) {
        live_.emplace(
            profile_path,
            std::make_unique<ScopedProfileKeepAlive>(
                profile, ProfileKeepAliveOrigin::kBackgroundMode));
      }
    } else {
      live_.erase(profile_path);
    }

    UpdateKeepAlive();
  }

  void OnStatusIconClicked() override { OpenWindow(); }

  void ExecuteCommand(int command_id, int event_flags) override {
    if (command_id == kCmdOpenRail) {
      OpenWindow();
    } else if (command_id == kCmdQuitRail) {
      chrome::AttemptExit();
    }
  }

 private:
  friend class base::NoDestructor<PushBackgroundManager>;
  PushBackgroundManager() = default;
  ~PushBackgroundManager() = default;

  void OnAppTerminating() {
    terminating_ = true;
    live_.clear();
    process_keep_alive_.reset();
    startup_keep_alive_.reset();
    startup_timeout_.Stop();
    RemoveTrayIcon();
  }

  void OnProfileLoaded(base::FilePath profile_path, Profile* profile) {
    if (!profile) {
      pending_.erase(profile_path);
      MaybeReleasePendingKeepAlive();
      return;
    }
    gcm::GCMProfileServiceFactory::GetForProfile(profile);
  }

  void OnStartupTimeout() {
    pending_.clear();
    startup_keep_alive_.reset();
  }

  void MaybeReleasePendingKeepAlive() {
    if (pending_.empty()) {
      startup_timeout_.Stop();
      startup_keep_alive_.reset();
    }
  }

  void UpdateKeepAlive() {
    if (!live_.empty()) {
      if (!process_keep_alive_) {
        process_keep_alive_ = std::make_unique<ScopedKeepAlive>(
            KeepAliveOrigin::BACKGROUND_MODE_MANAGER,
            KeepAliveRestartOption::ENABLED);
      }
#if !BUILDFLAG(IS_MAC)
      CreateTrayIcon();
#endif
    } else {
      process_keep_alive_.reset();
#if !BUILDFLAG(IS_MAC)
      RemoveTrayIcon();
#endif
    }
  }

  void CreateTrayIcon() {
    if (!status_tray_) {
      status_tray_ = g_browser_process->status_tray();
    }
    if (!status_tray_ || status_icon_) {
      return;
    }

    gfx::ImageSkia icon;
#if BUILDFLAG(IS_WIN)
    gfx::Size size = GetSmallAppIconSize();
    std::unique_ptr<gfx::ImageFamily> family = GetAppIconImageFamily();
    if (family) {
      icon = family->CreateExact(size).AsImageSkia();
    }
#elif BUILDFLAG(IS_LINUX)
    icon = *ui::ResourceBundle::GetSharedInstance().GetImageSkiaNamed(
        IDR_PRODUCT_LOGO_128);
#endif

    status_icon_ = status_tray_->CreateStatusIcon(
        StatusTray::BACKGROUND_MODE_ICON, icon, u"Rail");
    if (!status_icon_) {
      return;
    }

    auto menu = std::make_unique<StatusIconMenuModel>(this);
    menu->AddItem(kCmdOpenRail, u"Open Rail");
    menu->AddItem(kCmdQuitRail, u"Quit Rail");
    status_icon_->SetContextMenu(std::move(menu));
    status_icon_->AddObserver(this);
  }

  void RemoveTrayIcon() {
    if (status_icon_) {
      status_icon_->RemoveObserver(this);
      std::unique_ptr<StatusIcon> removed =
          status_tray_->RemoveStatusIcon(status_icon_);
      status_icon_ = nullptr;
      removed.reset();
    }
    status_tray_ = nullptr;
  }

  void OpenWindow() {
    ProfileManager* pm = g_browser_process->profile_manager();
    Profile* profile = nullptr;
    if (!live_.empty()) {
      profile = pm->GetProfileByPath(live_.begin()->first);
    }
    if (!profile) {
      profile = ProfileManager::GetLastUsedProfileAllowedByPolicy();
    }
    if (profile) {
      chrome::NewEmptyWindow(profile, false);
    }
  }

  void MaybeUpdateRunEntry() {
    PrefService* local_state = g_browser_process->local_state();
    bool list_non_empty =
        !local_state->GetList(kPushBackgroundProfilesPref).empty();
    if (last_run_entry_wanted_.has_value() &&
        *last_run_entry_wanted_ == list_non_empty) {
      return;
    }
    last_run_entry_wanted_ = list_non_empty;
    UpdateLoginLaunch(list_non_empty);
  }

  static std::string UserDataDirTag() {
    std::string udd_utf8 =
        g_browser_process->profile_manager()->user_data_dir().AsUTF8Unsafe();
    auto hash = crypto::hash::Sha256(udd_utf8);
    return base::HexEncode(
        std::string_view(reinterpret_cast<const char*>(hash.data()), 8));
  }

  static void PostBlocking(base::OnceClosure task) {
    base::ThreadPool::PostTask(
        FROM_HERE,
        {base::MayBlock(), base::TaskShutdownBehavior::CONTINUE_ON_SHUTDOWN},
        std::move(task));
  }

#if BUILDFLAG(IS_WIN)
  static void UpdateLoginLaunch(bool enabled) {
    std::wstring name = L"RailPush_" + base::UTF8ToWide(UserDataDirTag());
    if (!enabled) {
      PostBlocking(base::BindOnce(
          [](std::wstring n) {
            base::win::RemoveCommandFromAutoRun(HKEY_CURRENT_USER, n);
          },
          name));
      return;
    }
    base::FilePath exe_path;
    if (!base::PathService::Get(base::FILE_EXE, &exe_path)) {
      return;
    }
    base::CommandLine cmd(exe_path);
    cmd.AppendSwitch(switches::kNoStartupWindow);
    cmd.AppendSwitchPath(switches::kUserDataDir,
                         g_browser_process->profile_manager()->user_data_dir());
    PostBlocking(base::BindOnce(
        [](std::wstring n, std::wstring c) {
          base::win::AddCommandToAutoRun(HKEY_CURRENT_USER, n, c);
        },
        name, cmd.GetCommandLineString()));
  }
#elif BUILDFLAG(IS_MAC)
  static void UpdateLoginLaunch(bool enabled) {
    PrefService* local_state = g_browser_process->local_state();
    bool registered = local_state->GetBoolean(kPushLoginItemPref);
    if (enabled == registered) {
      return;
    }
    local_state->SetBoolean(kPushLoginItemPref, enabled);
    base::FilePath bundle = base::apple::OuterBundlePath();
    PostBlocking(base::BindOnce(
        [](base::FilePath b, bool add) {
          if (add) {
            base::mac::AddToLoginItems(b, true);
          } else {
            base::mac::RemoveFromLoginItems(b);
          }
        },
        bundle, enabled));
  }
#elif BUILDFLAG(IS_LINUX)
  static std::string QuoteExecArg(const std::string& arg) {
    if (!arg.empty() &&
        arg.find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstu"
                              "vwxyz0123456789/._-+=:,@") == std::string::npos) {
      return arg;
    }
    std::string quoted = "\"";
    for (char c : arg) {
      if (c == '"' || c == '`' || c == '$') {
        quoted += "\\\\";
      } else if (c == '\\') {
        quoted += "\\\\\\";
      } else if (c == '%') {
        quoted += "%";
      }
      quoted += c;
    }
    return quoted + "\"";
  }

  static void UpdateLoginLaunch(bool enabled) {
    std::string file = "rail-push-" + base::ToLowerASCII(UserDataDirTag()) +
                       ".desktop";
    if (!enabled) {
      PostBlocking(base::BindOnce(
          [](std::string f) { AutoStart::Remove(f); }, file));
      return;
    }
    base::FilePath exe_path =
        shell_integration_linux::internal::GetChromeExePath();
    if (exe_path.empty()) {
      return;
    }
    std::string exec = QuoteExecArg(exe_path.value()) + " --" +
                       switches::kNoStartupWindow + " " +
                       QuoteExecArg(std::string("--") + switches::kUserDataDir +
                                    "=" +
                                    g_browser_process->profile_manager()
                                        ->user_data_dir()
                                        .value());
    PostBlocking(base::BindOnce(
        [](std::string f, std::string e) {
          AutoStart::AddApplication(f, "Rail", e, false);
        },
        file, exec));
  }
#endif

  base::CallbackListSubscription terminating_subscription_;
  std::map<base::FilePath, std::unique_ptr<ScopedProfileKeepAlive>> live_;
  std::unique_ptr<ScopedKeepAlive> process_keep_alive_;
  std::unique_ptr<ScopedKeepAlive> startup_keep_alive_;
  std::set<base::FilePath> pending_;
  base::OneShotTimer startup_timeout_;
  raw_ptr<StatusTray> status_tray_ = nullptr;
  raw_ptr<StatusIcon> status_icon_ = nullptr;
  bool terminating_ = false;
  bool started_ = false;
  std::optional<bool> last_run_entry_wanted_;
};

class PushBackgroundMainParts : public ChromeBrowserMainExtraParts {
 public:
  void PostBrowserStart() override { PushBackgroundManager::Get().Start(); }
};

}

void RegisterPushBackgroundLocalStatePrefs(PrefRegistrySimple* registry) {
  registry->RegisterListPref(kPushBackgroundProfilesPref);
#if BUILDFLAG(IS_MAC)
  registry->RegisterBooleanPref(kPushLoginItemPref, false);
#endif
}

void SetPushBackgroundWanted(Profile* profile, bool wanted) {
  PushBackgroundManager::Get().SetWanted(profile, wanted);
}

std::unique_ptr<ChromeBrowserMainExtraParts> CreatePushBackgroundMainParts() {
  return std::make_unique<PushBackgroundMainParts>();
}

}
