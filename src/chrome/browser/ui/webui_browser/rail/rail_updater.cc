#include "chrome/browser/ui/webui_browser/rail/rail_updater.h"

#include <string_view>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/command_line.h"
#include "base/containers/span.h"
#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/no_destructor.h"
#include "base/base_paths.h"
#include "base/path_service.h"
#include "base/process/launch.h"
#include "base/process/process.h"
#include "base/strings/string_number_conversions.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/chrome_browser_main_extra_parts.h"
#include "chrome/browser/lifetime/application_lifetime.h"
#include "chrome/browser/lifetime/browser_shutdown.h"
#include "chrome/browser/ui/webui_browser/rail/rail_buildflags.h"
#include "chrome/common/chrome_paths.h"
#include "chrome/common/pref_names.h"
#include "components/prefs/pref_registry_simple.h"
#include "components/prefs/pref_service.h"
#include "net/base/load_flags.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/data_decoder/public/cpp/data_decoder.h"
#include "services/data_decoder/public/cpp/safe_xml_parser.h"
#include "services/network/public/cpp/resource_request.h"
#include "services/network/public/cpp/shared_url_loader_factory.h"
#include "services/network/public/cpp/simple_url_loader.h"
#include "third_party/boringssl/src/include/openssl/curve25519.h"
#include "third_party/boringssl/src/include/openssl/sha.h"

namespace rail {

const char kUpdateFeedUrlPref[] = "rail.update.feed_url";

namespace {

constexpr char kDefaultFeedUrl[] =
    "https://github.com/Frenvius/rail-browser/releases/latest/download/"
    "appcast.xml";
constexpr char kFeedUrlSwitch[] = "rail-update-feed-url";
constexpr base::FilePath::CharType kDownloadHelper[] =
    FILE_PATH_LITERAL("rail_update.exe");
constexpr char kPublicKey[] = "rx3nRriYut1fS5rA73ajbOg7x54sJRj1jBHm4/UQcbQ=";
constexpr char kSparkleNamespace[] =
    "http://www.andymatuschak.org/xml-namespaces/sparkle";
constexpr char kRailNamespace[] =
    "https://github.com/Frenvius/rail-browser/xml-namespaces/update";
constexpr base::FilePath::CharType kUpdateDirectory[] =
    FILE_PATH_LITERAL("Rail Update");
constexpr base::TimeDelta kFirstCheckDelay = base::Minutes(1);
constexpr base::TimeDelta kCheckInterval = base::Hours(5);
constexpr size_t kMaxFeedBytes = 64 * 1024;

constexpr net::NetworkTrafficAnnotationTag kTrafficAnnotation =
    net::DefineNetworkTrafficAnnotation("rail_update", R"(
      semantics {
        sender: "Rail Updater"
        description:
          "Reads the Rail update feed to learn whether a newer release "
          "exists."
        trigger:
          "A minute after the browser starts, then every five hours."
        data: "None."
        destination: OTHER
        destination_other: "GitHub releases of the Rail repository"
      }
      policy {
        cookies_allowed: NO
        setting: "Enabled in every Rail release build."
        policy_exception_justification: "Not implemented."
      })");

Updater* g_updater = nullptr;

const base::Version& CurrentVersion() {
  static const base::NoDestructor<base::Version> version(
      BUILDFLAG(RAIL_VERSION));
  return *version;
}

base::FilePath UpdateDirectory() {
  base::FilePath user_data;
  base::PathService::Get(chrome::DIR_USER_DATA, &user_data);
  return user_data.Append(kUpdateDirectory);
}

std::optional<Updater::Release> ParseRelease(const base::Value& rss) {
  std::string prefix;
  std::string rail_prefix;
  if (!data_decoder::GetXmlElementNamespacePrefix(rss, kSparkleNamespace,
                                                  &prefix) ||
      !data_decoder::GetXmlElementNamespacePrefix(rss, kRailNamespace,
                                                  &rail_prefix)) {
    return std::nullopt;
  }
  const base::Value* item =
      data_decoder::FindXmlElementPath(rss, {"rss", "channel", "item"},
                                       nullptr);
  if (!item) {
    return std::nullopt;
  }
  const base::Value* version = data_decoder::GetXmlElementChildWithTag(
      *item, data_decoder::GetXmlQualifiedName(prefix, "version"));
  const base::Value* enclosure =
      data_decoder::GetXmlElementChildWithTag(*item, "enclosure");
  std::string version_text;
  if (!version || !enclosure ||
      !data_decoder::GetXmlElementText(*version, &version_text)) {
    return std::nullopt;
  }

  Updater::Release release;
  release.version = base::Version(version_text);
  release.url = GURL(data_decoder::GetXmlElementAttribute(*enclosure, "url"));
  release.signature = data_decoder::GetXmlElementAttribute(
      *enclosure, data_decoder::GetXmlQualifiedName(prefix, "edSignature"));
  release.release_signature = data_decoder::GetXmlElementAttribute(
      *enclosure,
      data_decoder::GetXmlQualifiedName(rail_prefix, "releaseSignature"));
  if (!release.version.IsValid() || !release.url.SchemeIsHTTPOrHTTPS() ||
      !base::StringToInt64(
          data_decoder::GetXmlElementAttribute(*enclosure, "length"),
          &release.length) ||
      release.length <= 0) {
    return std::nullopt;
  }
  return release;
}

bool VerifySignature(base::span<const uint8_t> message,
                     const std::string& signature) {
  std::optional<std::vector<uint8_t>> key = base::Base64Decode(kPublicKey);
  std::optional<std::vector<uint8_t>> sig = base::Base64Decode(signature);
  return key && sig && key->size() == ED25519_PUBLIC_KEY_LEN &&
         sig->size() == ED25519_SIGNATURE_LEN &&
         ED25519_verify(message.data(), message.size(), sig->data(),
                        key->data()) == 1;
}

std::string ReleaseMessage(const base::Version& version,
                           base::span<const uint8_t> payload) {
  uint8_t digest[SHA256_DIGEST_LENGTH];
  SHA256(payload.data(), payload.size(), digest);
  return "rail-update\n" + version.GetString() + "\n" +
         base::HexEncodeLower(digest);
}

bool VerifyInstaller(const base::FilePath& installer,
                     const Updater::Release& release) {
  std::optional<std::vector<uint8_t>> payload =
      base::ReadFileToBytes(installer);
  bool valid =
      payload && payload->size() == static_cast<size_t>(release.length) &&
      VerifySignature(*payload, release.signature) &&
      VerifySignature(
          base::as_byte_span(ReleaseMessage(release.version, *payload)),
          release.release_signature);
  if (!valid) {
    base::DeleteFile(installer);
  }
  return valid;
}

bool PrepareInstaller(const base::FilePath& installer,
                      const Updater::Release& release) {
  base::FilePath directory = installer.DirName();
  base::CreateDirectory(directory);
  base::FileEnumerator files(directory, false, base::FileEnumerator::FILES);
  for (base::FilePath file = files.Next(); !file.empty(); file = files.Next()) {
    if (file != installer) {
      base::DeleteFile(file);
    }
  }
  return base::PathExists(installer) && VerifyInstaller(installer, release);
}

bool DownloadInstaller(const GURL& url,
                       const base::FilePath& installer,
                       int64_t length) {
  base::FilePath module_directory;
  if (!base::PathService::Get(base::DIR_MODULE, &module_directory)) {
    return false;
  }
  base::CommandLine command(module_directory.Append(kDownloadHelper));
  command.AppendArg(url.spec());
  command.AppendArgPath(installer);
  command.AppendArg(base::NumberToString(length));
  base::Process helper = base::LaunchProcess(command, base::LaunchOptions());
  int exit_code = -1;
  return helper.IsValid() && helper.WaitForExit(&exit_code) && exit_code == 0;
}

class UpdaterMainParts : public ChromeBrowserMainExtraParts {
 public:
  void PostBrowserStart() override {
    if (CurrentVersion().IsValid()) {
      updater_ = std::make_unique<Updater>();
    }
  }

  void PostMainMessageLoopRun() override {
    if (updater_) {
      updater_->LaunchPendingInstaller();
      updater_.reset();
    }
  }

 private:
  std::unique_ptr<Updater> updater_;
};

}

void RegisterUpdaterLocalStatePrefs(PrefRegistrySimple* registry) {
  registry->RegisterStringPref(kUpdateFeedUrlPref, kDefaultFeedUrl);
}

std::unique_ptr<ChromeBrowserMainExtraParts> CreateUpdaterMainParts() {
  return std::make_unique<UpdaterMainParts>();
}

Updater::Updater() {
  g_updater = this;
  ScheduleCheck(kFirstCheckDelay);
}

Updater::~Updater() {
  g_updater = nullptr;
}

Updater* Updater::Get() {
  return g_updater;
}

base::CallbackListSubscription Updater::AddReadyCallback(
    ReadyCallback callback) {
  return ready_callbacks_.Add(std::move(callback));
}

base::CallbackListSubscription Updater::AddStatusCallback(
    base::RepeatingClosure callback) {
  return status_callbacks_.Add(std::move(callback));
}

void Updater::CheckNow() {
  if (!check_timer_.IsRunning()) {
    return;
  }
  check_timer_.Stop();
  Check();
}

void Updater::Apply() {
  if (!ready_version_) {
    return;
  }
  relaunch_ = true;
  g_browser_process->local_state()->SetBoolean(prefs::kWasRestarted, true);
  chrome::AttemptExit();
}

void Updater::LaunchPendingInstaller() {
  if (!ready_version_ || browser_shutdown::GetShutdownType() ==
                             browser_shutdown::ShutdownType::kEndSession) {
    return;
  }
  base::CommandLine command(ready_installer_);
  command.AppendArg("/VERYSILENT");
  command.AppendArg("/SUPPRESSMSGBOXES");
  command.AppendArg("/NOCLOSEAPPLICATIONS");
  command.AppendArg("/NORESTART");
  if (relaunch_) {
    command.AppendArg("/RELAUNCH");
  }
  base::LaunchOptions options;
  options.current_directory = ready_installer_.DirName();
  base::LaunchProcess(command, options);
}

void Updater::ScheduleCheck(base::TimeDelta delay) {
  check_timer_.Start(FROM_HERE, delay,
                     base::BindOnce(&Updater::Check, base::Unretained(this)));
}

void Updater::Check() {
  SetStatus(Status::kChecking);
  const base::CommandLine& command_line =
      *base::CommandLine::ForCurrentProcess();
  GURL feed(command_line.HasSwitch(kFeedUrlSwitch)
                ? command_line.GetSwitchValueASCII(kFeedUrlSwitch)
                : g_browser_process->local_state()->GetString(
                      kUpdateFeedUrlPref));
  if (!feed.SchemeIsHTTPOrHTTPS()) {
    Finish(Status::kFailed);
    return;
  }

  auto request = std::make_unique<network::ResourceRequest>();
  request->url = feed;
  request->credentials_mode = network::mojom::CredentialsMode::kOmit;
  request->load_flags = net::LOAD_DISABLE_CACHE;
  loader_ = network::SimpleURLLoader::Create(std::move(request),
                                             kTrafficAnnotation);
  loader_->DownloadToString(
      g_browser_process->shared_url_loader_factory().get(),
      base::BindOnce(&Updater::OnFeedLoaded, weak_factory_.GetWeakPtr()),
      kMaxFeedBytes);
}

void Updater::OnFeedLoaded(std::optional<std::string> body) {
  loader_.reset();
  if (!body) {
    Finish(Status::kFailed);
    return;
  }
  data_decoder::DataDecoder::ParseXmlIsolated(
      *body, data_decoder::mojom::XmlParser::WhitespaceBehavior::kIgnore,
      base::BindOnce(&Updater::OnFeedParsed, weak_factory_.GetWeakPtr()));
}

void Updater::OnFeedParsed(base::expected<base::Value, std::string> result) {
  std::optional<Release> release =
      result.has_value() ? ParseRelease(*result) : std::nullopt;
  if (!release) {
    Finish(Status::kFailed);
    return;
  }
  if (release->version <= CurrentVersion()) {
    base::ThreadPool::PostTask(
        FROM_HERE, {base::MayBlock(), base::TaskPriority::BEST_EFFORT},
        base::GetDeletePathRecursivelyCallback(UpdateDirectory()));
    Finish(Status::kUpToDate);
    return;
  }
  if (ready_version_ == release->version.GetString()) {
    Finish(Status::kReady);
    return;
  }

  base::FilePath installer = UpdateDirectory().AppendASCII(
      "RailSetup-" + release->version.GetString() + ".exe");
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::BEST_EFFORT},
      base::BindOnce(&PrepareInstaller, installer, *release),
      base::BindOnce(&Updater::OnInstallerPrepared, weak_factory_.GetWeakPtr(),
                     *release, installer));
}

void Updater::OnInstallerPrepared(Release release,
                                  base::FilePath installer,
                                  bool valid) {
  if (valid) {
    OnVerified(std::move(release), std::move(installer), true);
    return;
  }

  SetStatus(Status::kDownloading);
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE,
      {base::MayBlock(), base::WithBaseSyncPrimitives(),
       base::TaskPriority::BEST_EFFORT,
       base::TaskShutdownBehavior::CONTINUE_ON_SHUTDOWN},
      base::BindOnce(&DownloadInstaller, release.url, installer,
                     release.length),
      base::BindOnce(&Updater::OnDownloaded, weak_factory_.GetWeakPtr(),
                     release, installer));
}

void Updater::OnDownloaded(Release release,
                           base::FilePath installer,
                           bool downloaded) {
  if (!downloaded) {
    Finish(Status::kFailed);
    return;
  }
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::BEST_EFFORT},
      base::BindOnce(&VerifyInstaller, installer, release),
      base::BindOnce(&Updater::OnVerified, weak_factory_.GetWeakPtr(),
                     release, installer));
}

void Updater::OnVerified(Release release,
                         base::FilePath installer,
                         bool valid) {
  if (valid) {
    ready_version_ = release.version.GetString();
    ready_installer_ = std::move(installer);
    ready_callbacks_.Notify(*ready_version_);
  }
  Finish(valid ? Status::kReady : Status::kFailed);
}

void Updater::SetStatus(Status status) {
  status_ = ready_version_ ? Status::kReady : status;
  status_callbacks_.Notify();
}

void Updater::Finish(Status status) {
  loader_.reset();
  SetStatus(status);
  ScheduleCheck(kCheckInterval);
}

}
