#include "chrome/browser/ui/webui_browser/rail/rail_import.h"

#include <algorithm>
#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/location.h"
#include "base/no_destructor.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/strcat.h"
#include "base/strings/stringprintf.h"
#include "base/task/thread_pool.h"
#include "base/values.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/profiles/profile_manager.h"
#include "chrome/browser/ui/webui_browser/rail/rail_arc_data.h"
#include "chrome/browser/ui/webui_browser/rail/rail_arc_extensions.h"
#include "chrome/browser/ui/webui_browser/rail/rail_arc_import.h"
#include "chrome/browser/ui/webui_browser/rail/rail_arc_writer.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_bookmarks.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_sidebar.h"
#include "chrome/browser/ui/webui_browser/rail/rail_import_sources.h"
#include "chrome/browser/ui/webui_browser/rail/rail_profiles.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"

namespace rail {

const char kImportPref[] = "rail.import";

namespace {

constexpr char kProfilesKey[] = "profiles";
constexpr char kWatermarksKey[] = "watermarks";
constexpr char kImportedKey[] = "imported";
constexpr char kBusyMessage[] = "An import is already running.";
constexpr char kNoProfileMessage[] = "Rail could not reach its profile.";
constexpr char kUnknownSourceMessage[] = "Unknown import source.";
constexpr char kMissingFormat[] = "No %s data was found.";
constexpr char kRunningFormat[] = "Quit %s before importing.";
constexpr char kNothingNewFormat[] = "Nothing new to import from %s.";
constexpr char kImportedFormat[] = "Imported %s from %s.";
constexpr char kProfileFailedMessage[] =
    "Could not create a profile for the imported data.";
constexpr char kProfileClosedMessage[] =
    "The profile closed during the import.";
constexpr char kStoreFailedDetail[] = "Password store is unavailable.";

struct ImportMarks {
  std::set<std::string> imported;
  std::map<std::string, int64_t> watermarks;
};

struct PlannedProfile {
  SourceProfile profile;
  ImportCounts counts;
  ImportLocked locked;
  ArcExtensionScan extensions;
};

struct SourcePlan {
  std::vector<PlannedProfile> profiles;
  SidebarBuild sidebar;
  std::string refusal;
};

struct ImportTotals {
  int cookies = 0;
  int cookies_skipped = 0;
  int cookies_locked = 0;
  int passwords = 0;
  int passwords_locked = 0;
  int urls = 0;
  int extensions = 0;
  int extensions_skipped = 0;
  int extensions_failed = 0;
};

struct ImportJob {
  ImportSourceSpec spec;
  ImportRequest request;
  base::FilePath profile_path;
  ImportMarks marks;
  SourcePlan plan;
  std::map<std::string, std::string> mapping;
  std::vector<std::string> create_queue;
  std::vector<std::string> load_queue;
  base::WeakPtr<Profile> current;
  ImportTotals totals;
};

struct ImportSession {
  bool busy = false;
  std::vector<std::string> pending_ids;
};

ImportSession& Session() {
  static base::NoDestructor<ImportSession> session;
  return *session;
}

std::string MarkKey(const std::string& source_id, const std::string& dir) {
  return base::StrCat({source_id, "/", dir});
}

ImportMarks ReadMarks(const PrefService* prefs) {
  ImportMarks marks;
  if (!prefs) {
    return marks;
  }
  const base::DictValue& root = prefs->GetDict(kImportPref);
  if (const base::ListValue* imported = root.FindList(kImportedKey)) {
    for (const base::Value& id : *imported) {
      if (id.is_string()) {
        marks.imported.insert(id.GetString());
      }
    }
  }
  if (const base::DictValue* values = root.FindDict(kWatermarksKey)) {
    for (const auto [key, value] : *values) {
      int64_t watermark = 0;
      if (value.is_string() &&
          base::StringToInt64(value.GetString(), &watermark)) {
        marks.watermarks[key] = watermark;
      }
    }
  }
  return marks;
}

int64_t WatermarkOf(const ImportMarks& marks, const std::string& key) {
  const auto found = marks.watermarks.find(key);
  return found == marks.watermarks.end() ? 0 : found->second;
}

std::optional<std::string> StoredProfileId(const PrefService* prefs,
                                           const std::string& key) {
  const base::DictValue* profiles =
      prefs->GetDict(kImportPref).FindDict(kProfilesKey);
  const std::string* id = profiles ? profiles->FindString(key) : nullptr;
  if (!id) {
    return std::nullopt;
  }
  return *id;
}

void StoreProfileId(PrefService* prefs,
                    const std::string& key,
                    const std::string& id) {
  ScopedDictPrefUpdate update(prefs, kImportPref);
  update->EnsureDict(kProfilesKey)->Set(key, id);
}

void StoreWatermark(PrefService* prefs,
                    const std::string& key,
                    int64_t watermark) {
  ScopedDictPrefUpdate update(prefs, kImportPref);
  update->EnsureDict(kWatermarksKey)->Set(key, base::NumberToString(watermark));
}

void StoreImportedIds(PrefService* prefs, const std::vector<std::string>& ids) {
  std::set<std::string> seen = ReadMarks(prefs).imported;
  seen.insert(ids.begin(), ids.end());
  base::ListValue imported;
  for (const std::string& id : seen) {
    imported.Append(id);
  }
  ScopedDictPrefUpdate update(prefs, kImportPref);
  update->Set(kImportedKey, std::move(imported));
}

PrefService* PrefsOf(const base::FilePath& profile_path) {
  ProfileManager* manager = g_browser_process->profile_manager();
  Profile* profile = manager && !profile_path.empty()
                         ? manager->GetProfileByPath(profile_path)
                         : nullptr;
  return profile ? profile->GetPrefs() : nullptr;
}

void LoadProfileOf(const std::string& id,
                   base::OnceCallback<void(Profile*)> callback) {
  ProfileManager* manager = g_browser_process->profile_manager();
  if (!manager) {
    std::move(callback).Run(nullptr);
    return;
  }
  const base::FilePath path = manager->user_data_dir().AppendASCII(id);
  if (Profile* loaded = manager->GetProfileByPath(path)) {
    std::move(callback).Run(loaded);
    return;
  }
  manager->CreateProfileAsync(path, std::move(callback));
}

bool HasWork(const ImportCounts& counts) {
  return counts.spaces + counts.pins + counts.favorites + counts.bookmarks +
             counts.history + counts.cookies + counts.passwords +
             counts.extensions >
         0;
}

ImportProfileInfo ProfileInfoOf(const PlannedProfile& planned) {
  return ImportProfileInfo{
      .dir = planned.profile.dir,
      .name = planned.profile.name,
      .counts = planned.counts,
      .locked = planned.locked,
  };
}

SourcePlan PlanProfiles(const ImportSourceSpec& spec,
                        const std::vector<SourceProfile>& profiles,
                        const ImportMarks& marks) {
  SourcePlan plan;
  SidebarInput input{.source_id = spec.id, .imported = marks.imported};
  for (const SourceProfile& profile : profiles) {
    input.dirs.insert(profile.dir);
  }
  if (!spec.sidebar_root.empty()) {
    AddArcSidebar(spec.sidebar_root, input, plan.sidebar);
  }
  if (spec.bookmarks) {
    const bool several = SourceProfiles(spec).size() > 1;
    for (const SourceProfile& profile : profiles) {
      const std::string name =
          several ? base::StrCat({spec.name, " (", profile.name, ")"})
                  : spec.name;
      AddBookmarkSpace(BookmarkSpaceSource{
                           .source_id = spec.id,
                           .dir = profile.dir,
                           .name = name,
                           .file = profile.path.AppendASCII("Bookmarks"),
                       },
                       input, plan.sidebar);
    }
  }
  for (const SourceProfile& profile : profiles) {
    PlannedProfile planned;
    planned.profile = profile;
    planned.counts = plan.sidebar.counts[profile.dir];
    const ProfileStoreCounts stores = CountProfileStores(
        profile.path,
        ProfileMarks{
            .watermark = WatermarkOf(marks, MarkKey(spec.id, profile.dir)),
            .imported_logins = marks.imported,
        });
    planned.counts.history = stores.urls;
    planned.counts.cookies = stores.cookies;
    planned.counts.passwords = stores.passwords;
    planned.locked = ImportLocked{
        .cookies = stores.locked_cookies,
        .passwords = stores.locked_passwords,
    };
    planned.extensions = ReadArcExtensions(profile.path);
    planned.counts.extensions =
        static_cast<int>(planned.extensions.installable.size());
    plan.profiles.push_back(std::move(planned));
  }
  return plan;
}

SourcePlan PlanFor(ImportSourceSpec spec,
                   std::vector<std::string> dirs,
                   ImportMarks marks) {
  if (!SourceInstalled(spec)) {
    return {.refusal = base::StringPrintf(kMissingFormat, spec.name.c_str())};
  }
  if (SourceRunning(spec)) {
    return {.refusal = base::StringPrintf(kRunningFormat, spec.name.c_str())};
  }
  std::vector<SourceProfile> selected;
  for (SourceProfile& profile : SourceProfiles(spec)) {
    if (dirs.empty() || std::find(dirs.begin(), dirs.end(), profile.dir) !=
                             dirs.end()) {
      selected.push_back(std::move(profile));
    }
  }
  return PlanProfiles(spec, selected, marks);
}

std::vector<ImportSourceInfo> CollectSources(ImportMarks marks) {
  std::vector<ImportSourceInfo> sources;
  for (const ImportSourceSpec& spec : ImportSourceSpecs()) {
    ImportSourceInfo info;
    info.id = spec.id;
    info.name = spec.name;
    info.icon_path = ExecutablePath(spec);
    info.icon = PackagedIconDataUrl(spec);
    info.installed = SourceInstalled(spec);
    info.running = SourceRunning(spec);
    if (info.installed) {
      for (const PlannedProfile& planned :
           PlanFor(spec, {}, marks).profiles) {
        info.profiles.push_back(ProfileInfoOf(planned));
      }
    }
    sources.push_back(std::move(info));
  }
  return sources;
}

std::vector<std::string> UrlsOf(const base::ListValue* rows) {
  std::vector<std::string> urls;
  if (!rows) {
    return urls;
  }
  for (const base::Value& row : *rows) {
    const base::DictValue* entry = row.GetIfDict();
    const std::string* url = entry ? entry->FindString("url") : nullptr;
    if (url && !url->empty()) {
      urls.push_back(*url);
    }
  }
  return urls;
}

std::vector<std::string> SidebarUrls(const SidebarBuild& build,
                                     const std::string& dir) {
  std::vector<std::string> urls;
  for (const base::Value& space : build.spaces) {
    const base::DictValue& entry = space.GetDict();
    const std::string* profile = entry.FindString("profile");
    if (profile && *profile == dir) {
      for (const char* key : {"pinned", "tabs"}) {
        const std::vector<std::string> part = UrlsOf(entry.FindList(key));
        urls.insert(urls.end(), part.begin(), part.end());
      }
    }
  }
  const auto favorites = build.favorites.find(dir);
  if (favorites != build.favorites.end()) {
    const std::vector<std::string> part = UrlsOf(&favorites->second);
    urls.insert(urls.end(), part.begin(), part.end());
  }
  return urls;
}

PlannedProfile* FindPlanned(ImportJob& job, const std::string& dir) {
  for (PlannedProfile& planned : job.plan.profiles) {
    if (planned.profile.dir == dir) {
      return &planned;
    }
  }
  return nullptr;
}

void Emit(ImportJob& job,
          ImportStep step,
          ImportState state,
          const std::string& profile,
          std::string detail) {
  job.request.on_event.Run(ImportEvent{
      .step = step,
      .state = state,
      .profile = profile,
      .detail = std::move(detail),
  });
}

void EmitProfileFailed(ImportJob& job,
                       const std::string& dir,
                       const std::string& detail) {
  for (ImportStep step : {ImportStep::kPasswords, ImportStep::kHistory,
                          ImportStep::kCookies, ImportStep::kExtensions}) {
    Emit(job, step, ImportState::kFailed, dir, detail);
  }
}

std::string Counted(int count, const char* singular, const char* plural) {
  return base::StringPrintf("%d %s", count, count == 1 ? singular : plural);
}

std::string Extra(int count, const char* label) {
  if (count == 0) {
    return std::string();
  }
  return base::StringPrintf(", %d %s", count, label);
}

std::string PasswordsDetail(const ImportTotals& totals) {
  return Counted(totals.passwords, "password", "passwords") +
         Extra(totals.passwords_locked, "locked");
}

std::string HistoryDetail(const ImportTotals& totals) {
  return Counted(totals.urls, "page", "pages");
}

std::string CookiesDetail(const ImportTotals& totals) {
  return Counted(totals.cookies, "cookie", "cookies") +
         Extra(totals.cookies_skipped, "skipped") +
         Extra(totals.cookies_locked, "locked");
}

std::string ExtensionsDetail(const ImportTotals& totals) {
  return base::StringPrintf("%d installed", totals.extensions) +
         Extra(totals.extensions_skipped, "skipped") +
         Extra(totals.extensions_failed, "failed");
}

void EmitPasswords(ImportJob& job, const std::string& dir) {
  const ImportTotals& totals = job.totals;
  if (totals.passwords + totals.passwords_locked == 0) {
    Emit(job, ImportStep::kPasswords, ImportState::kSkipped, dir,
         "No saved passwords.");
    return;
  }
  Emit(job, ImportStep::kPasswords, ImportState::kDone, dir,
       PasswordsDetail(totals));
}

void EmitHistory(ImportJob& job, const std::string& dir) {
  if (job.totals.urls == 0) {
    Emit(job, ImportStep::kHistory, ImportState::kSkipped, dir,
         "No new pages.");
    return;
  }
  Emit(job, ImportStep::kHistory, ImportState::kDone, dir,
       HistoryDetail(job.totals));
}

void EmitCookies(ImportJob& job, const std::string& dir) {
  const ImportTotals& totals = job.totals;
  if (totals.cookies + totals.cookies_skipped + totals.cookies_locked == 0) {
    Emit(job, ImportStep::kCookies, ImportState::kSkipped, dir, "No cookies.");
    return;
  }
  Emit(job, ImportStep::kCookies, ImportState::kDone, dir,
       CookiesDetail(totals));
}

void EmitExtensions(ImportJob& job, const std::string& dir) {
  const ImportTotals& totals = job.totals;
  const int seen =
      totals.extensions + totals.extensions_skipped + totals.extensions_failed;
  if (seen == 0) {
    Emit(job, ImportStep::kExtensions, ImportState::kSkipped, dir,
         "No Web Store extensions.");
    return;
  }
  const ImportState state = totals.extensions_failed > 0 ? ImportState::kFailed
                                                         : ImportState::kDone;
  Emit(job, ImportStep::kExtensions, state, dir, ExtensionsDetail(totals));
}

void AddPart(std::vector<std::string>& parts,
             int count,
             const char* singular,
             const char* plural) {
  if (count > 0) {
    parts.push_back(Counted(count, singular, plural));
  }
}

std::string JoinList(const std::vector<std::string>& parts) {
  if (parts.size() < 2) {
    return parts.empty() ? std::string() : parts.front();
  }
  const std::vector<std::string> head(parts.begin(), parts.end() - 1);
  return base::StrCat({base::JoinString(head, ", "), " and ", parts.back()});
}

void Refuse(ImportSummaryCallback callback, const std::string& message) {
  std::move(callback).Run(ImportSummary{.message = message});
}

void Abort(ImportJob& job, const std::string& message) {
  Session().busy = false;
  Refuse(std::move(job.request.on_finished), message);
}

void CreateNextProfile(std::unique_ptr<ImportJob> job);
void ImportNextProfile(std::unique_ptr<ImportJob> job);
void CompleteImport(std::unique_ptr<ImportJob> job);

void OnProfileCreated(std::unique_ptr<ImportJob> job,
                      const std::string& dir,
                      std::optional<ProfileEntry> entry) {
  if (!entry) {
    EmitProfileFailed(*job, dir, kProfileFailedMessage);
    CreateNextProfile(std::move(job));
    return;
  }
  PrefService* prefs = PrefsOf(job->profile_path);
  if (!prefs) {
    Abort(*job, kNoProfileMessage);
    return;
  }
  const std::string key = MarkKey(job->spec.id, dir);
  StoreProfileId(prefs, key, entry->id);
  StoreWatermark(prefs, key, 0);
  job->mapping[dir] = entry->id;
  job->load_queue.push_back(dir);
  CreateNextProfile(std::move(job));
}

void CreateNextProfile(std::unique_ptr<ImportJob> job) {
  if (job->create_queue.empty()) {
    ImportNextProfile(std::move(job));
    return;
  }
  const std::string dir = job->create_queue.front();
  job->create_queue.erase(job->create_queue.begin());
  const PlannedProfile* planned = FindPlanned(*job, dir);
  const std::string name = planned ? planned->profile.name : dir;
  CreateProfile(name, base::BindOnce(&OnProfileCreated, std::move(job), dir));
}

void OnStoresWritten(std::unique_ptr<ImportJob> job,
                     const std::string& dir,
                     StoreWriteResult result) {
  PrefService* prefs = PrefsOf(job->profile_path);
  if (prefs && result.watermark > 0) {
    StoreWatermark(prefs, MarkKey(job->spec.id, dir), result.watermark);
  }
  if (prefs && !result.imported_logins.empty()) {
    StoreImportedIds(prefs, result.imported_logins);
  }
  ImportTotals& totals = job->totals;
  totals.cookies += result.cookies;
  totals.cookies_skipped += result.cookies_skipped;
  totals.cookies_locked += result.cookies_locked;
  totals.passwords += result.passwords;
  totals.passwords_locked += result.passwords_locked;
  totals.urls += result.urls;

  if (result.password_store_ready) {
    EmitPasswords(*job, dir);
  } else {
    Emit(*job, ImportStep::kPasswords, ImportState::kFailed, dir,
         kStoreFailedDetail);
  }
  EmitHistory(*job, dir);
  EmitCookies(*job, dir);
  ImportNextProfile(std::move(job));
}

void OnStoresRead(std::unique_ptr<ImportJob> job,
                  const std::string& dir,
                  ProfileStores data) {
  Profile* profile = job->current.get();
  if (!profile) {
    EmitProfileFailed(*job, dir, kProfileClosedMessage);
    ImportNextProfile(std::move(job));
    return;
  }
  WriteProfileStores(profile, std::move(data),
                     base::BindOnce(&OnStoresWritten, std::move(job), dir));
}

void ReadAndWriteStores(std::unique_ptr<ImportJob> job, const std::string& dir) {
  const PlannedProfile* planned = FindPlanned(*job, dir);
  if (!planned) {
    ImportNextProfile(std::move(job));
    return;
  }
  const base::FilePath path = planned->profile.path;
  const base::FilePath user_data = job->spec.root;
  ProfileMarks marks{
      .watermark = WatermarkOf(job->marks, MarkKey(job->spec.id, dir)),
      .imported_logins = job->marks.imported,
  };
  std::vector<std::string> urls = SidebarUrls(job->plan.sidebar, dir);
  auto task = base::BindOnce(&ReadProfileStores, user_data, path,
                             std::move(marks), std::move(urls));
  auto reply = base::BindOnce(&OnStoresRead, std::move(job), dir);
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()}, std::move(task), std::move(reply));
}

void OnExtensionsInstalled(std::unique_ptr<ImportJob> job,
                           const std::string& dir,
                           ArcExtensionResult result) {
  ImportTotals& totals = job->totals;
  totals.extensions += static_cast<int>(result.installed.size());
  totals.extensions_skipped += static_cast<int>(result.skipped.size());
  totals.extensions_failed += static_cast<int>(result.failed.size());
  EmitExtensions(*job, dir);
  ReadAndWriteStores(std::move(job), dir);
}

void OnProfileLoaded(std::unique_ptr<ImportJob> job,
                     const std::string& dir,
                     Profile* profile) {
  if (!profile) {
    EmitProfileFailed(*job, dir, "Could not open the profile.");
    ImportNextProfile(std::move(job));
    return;
  }
  job->current = profile->GetWeakPtr();
  PlannedProfile* planned = FindPlanned(*job, dir);
  if (!planned) {
    ImportNextProfile(std::move(job));
    return;
  }
  ArcExtensionScan scan = std::move(planned->extensions);
  Emit(*job, ImportStep::kExtensions, ImportState::kRunning, dir,
       std::string());
  InstallArcExtensions(
      profile, std::move(scan),
      base::BindOnce(&OnExtensionsInstalled, std::move(job), dir));
}

void ImportNextProfile(std::unique_ptr<ImportJob> job) {
  if (job->load_queue.empty()) {
    job->current = base::WeakPtr<Profile>();
    CompleteImport(std::move(job));
    return;
  }
  const std::string dir = job->load_queue.front();
  job->load_queue.erase(job->load_queue.begin());
  const std::string id = job->mapping.at(dir);
  LoadProfileOf(id, base::BindOnce(&OnProfileLoaded, std::move(job), dir));
}

ImportCounts MappedSidebarCounts(const ImportJob& job) {
  ImportCounts total;
  for (const auto& [dir, counts] : job.plan.sidebar.counts) {
    if (!job.mapping.contains(dir)) {
      continue;
    }
    total.spaces += counts.spaces;
    total.pins += counts.pins;
    total.favorites += counts.favorites;
    total.bookmarks += counts.bookmarks;
  }
  return total;
}

void EmitSidebarEvents(ImportJob& job) {
  const ImportCounts counts = MappedSidebarCounts(job);
  const auto state_of = [](int count) {
    return count > 0 ? ImportState::kDone : ImportState::kSkipped;
  };
  Emit(job, ImportStep::kSpaces, state_of(counts.spaces), std::string(),
       Counted(counts.spaces, "space", "spaces"));
  Emit(job, ImportStep::kPinned, state_of(counts.pins), std::string(),
       Counted(counts.pins, "pinned tab", "pinned tabs"));
  Emit(job, ImportStep::kFavorites, state_of(counts.favorites), std::string(),
       Counted(counts.favorites, "favorite", "favorites"));
  Emit(job, ImportStep::kBookmarks, state_of(counts.bookmarks), std::string(),
       Counted(counts.bookmarks, "bookmark", "bookmarks"));
}

base::DictValue SidebarOf(ImportJob& job) {
  base::ListValue spaces;
  for (base::Value& space : job.plan.sidebar.spaces) {
    base::DictValue& entry = space.GetDict();
    const std::string* dir = entry.FindString("profile");
    if (!dir || !job.mapping.contains(*dir)) {
      continue;
    }
    entry.Set("profile", job.mapping.at(*dir));
    spaces.Append(std::move(space));
  }
  base::DictValue favorites;
  for (auto& [dir, pins] : job.plan.sidebar.favorites) {
    if (job.mapping.contains(dir) && !pins.empty()) {
      favorites.Set(job.mapping.at(dir), std::move(pins));
    }
  }
  base::ListValue known;
  for (const std::string& id : job.plan.sidebar.known_spaces) {
    known.Append(id);
  }
  base::DictValue sidebar;
  sidebar.Set("spaces", std::move(spaces));
  sidebar.Set("favoritesByProfile", std::move(favorites));
  sidebar.Set("knownSpaces", std::move(known));
  return sidebar;
}

void AppendRowIds(std::vector<std::string>& ids,
                  const base::ListValue* rows) {
  if (!rows) {
    return;
  }
  for (const base::Value& row : *rows) {
    const std::string* id = row.GetIfDict()
                                ? row.GetIfDict()->FindString("id")
                                : nullptr;
    if (id) {
      ids.push_back(*id);
    }
  }
}

std::vector<std::string> PayloadIds(const base::DictValue& sidebar) {
  std::vector<std::string> ids;
  if (const base::ListValue* spaces = sidebar.FindList("spaces")) {
    for (const base::Value& space : *spaces) {
      const base::DictValue& entry = space.GetDict();
      if (const std::string* id = entry.FindString("id")) {
        ids.push_back(*id);
      }
      for (const char* key : {"pinned", "folders", "tidyGroups", "tabs"}) {
        AppendRowIds(ids, entry.FindList(key));
      }
    }
  }
  if (const base::DictValue* favorites =
          sidebar.FindDict("favoritesByProfile")) {
    for (const auto [profile, pins] : *favorites) {
      AppendRowIds(ids, pins.GetIfList());
    }
  }
  return ids;
}

std::string MessageOf(const ImportJob& job) {
  const ImportCounts rows = MappedSidebarCounts(job);
  const ImportTotals& totals = job.totals;
  std::vector<std::string> parts;
  AddPart(parts, rows.spaces, "space", "spaces");
  AddPart(parts, rows.pins, "pinned tab", "pinned tabs");
  AddPart(parts, rows.favorites, "favorite", "favorites");
  AddPart(parts, rows.bookmarks, "bookmark", "bookmarks");
  AddPart(parts, totals.cookies, "cookie", "cookies");
  AddPart(parts, totals.urls, "page", "pages");
  AddPart(parts, totals.extensions, "extension", "extensions");
  AddPart(parts, totals.passwords, "password", "passwords");
  const char* name = job.spec.name.c_str();
  if (parts.empty()) {
    return base::StringPrintf(kNothingNewFormat, name);
  }
  return base::StringPrintf(kImportedFormat, JoinList(parts).c_str(), name);
}

void CompleteImport(std::unique_ptr<ImportJob> job) {
  EmitSidebarEvents(*job);
  const base::DictValue sidebar = SidebarOf(*job);
  Session().pending_ids = PayloadIds(sidebar);
  ImportSummary summary;
  base::JSONWriter::Write(sidebar, &summary.sidebar);
  summary.message = MessageOf(*job);
  std::move(job->request.on_finished).Run(std::move(summary));
}

void OnPlanned(std::unique_ptr<ImportJob> job, SourcePlan plan) {
  if (!plan.refusal.empty()) {
    Session().busy = false;
    Refuse(std::move(job->request.on_finished), plan.refusal);
    return;
  }
  job->plan = std::move(plan);
  PrefService* prefs = PrefsOf(job->profile_path);
  if (!prefs) {
    Abort(*job, kNoProfileMessage);
    return;
  }
  for (const PlannedProfile& planned : job->plan.profiles) {
    if (!HasWork(planned.counts)) {
      continue;
    }
    const std::string& dir = planned.profile.dir;
    const std::optional<std::string> id =
        StoredProfileId(prefs, MarkKey(job->spec.id, dir));
    if (id && ProfileExists(*id)) {
      job->mapping[dir] = *id;
      job->load_queue.push_back(dir);
    } else {
      job->create_queue.push_back(dir);
    }
  }
  CreateNextProfile(std::move(job));
}

}

void ListImportSources(PrefService* prefs, ImportSourcesCallback callback) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()},
      base::BindOnce(&CollectSources, ReadMarks(prefs)), std::move(callback));
}

void StartImport(Profile* profile, ImportRequest request) {
  if (!profile) {
    Refuse(std::move(request.on_finished), kNoProfileMessage);
    return;
  }
  if (Session().busy) {
    Refuse(std::move(request.on_finished), kBusyMessage);
    return;
  }
  const std::optional<ImportSourceSpec> spec =
      FindImportSource(request.source_id);
  if (!spec) {
    Refuse(std::move(request.on_finished), kUnknownSourceMessage);
    return;
  }
  Session().busy = true;
  auto job = std::make_unique<ImportJob>();
  job->spec = *spec;
  job->profile_path = profile->GetPath();
  job->marks = ReadMarks(profile->GetPrefs());
  job->request = std::move(request);
  auto task = base::BindOnce(&PlanFor, job->spec, job->request.profile_dirs,
                             job->marks);
  auto reply = base::BindOnce(&OnPlanned, std::move(job));
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock()}, std::move(task), std::move(reply));
}

void ConfirmImport(base::WeakPtr<Profile> profile, bool merged) {
  PrefService* prefs = profile ? profile->GetPrefs() : nullptr;
  if (merged && prefs) {
    StoreImportedIds(prefs, Session().pending_ids);
  }
  Session().pending_ids.clear();
  Session().busy = false;
}

}
