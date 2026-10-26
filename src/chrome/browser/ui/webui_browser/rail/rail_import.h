#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_IMPORT_H_

#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"

class PrefService;
class Profile;

namespace rail {

extern const char kImportPref[];

struct ImportCounts {
  int spaces = 0;
  int pins = 0;
  int favorites = 0;
  int bookmarks = 0;
  int history = 0;
  int cookies = 0;
  int passwords = 0;
  int extensions = 0;
};

struct ImportLocked {
  int cookies = 0;
  int passwords = 0;
};

struct ImportProfileInfo {
  std::string dir;
  std::string name;
  ImportCounts counts;
  ImportLocked locked;
};

struct ImportSourceInfo {
  std::string id;
  std::string name;
  std::string icon_path;
  std::string icon;
  bool installed = false;
  bool running = false;
  std::vector<ImportProfileInfo> profiles;
};

enum class ImportStep {
  kPasswords,
  kHistory,
  kCookies,
  kExtensions,
  kFavorites,
  kPinned,
  kSpaces,
  kBookmarks,
};

enum class ImportState { kPending, kRunning, kDone, kSkipped, kFailed };

struct ImportEvent {
  ImportStep step = ImportStep::kHistory;
  ImportState state = ImportState::kPending;
  std::string profile;
  std::string detail;
};

struct ImportSummary {
  std::string sidebar;
  std::string message;
};

using ImportSourcesCallback =
    base::OnceCallback<void(std::vector<ImportSourceInfo> sources)>;

void ListImportSources(PrefService* prefs, ImportSourcesCallback callback);

using ImportEventCallback = base::RepeatingCallback<void(ImportEvent event)>;
using ImportSummaryCallback = base::OnceCallback<void(ImportSummary summary)>;

struct ImportRequest {
  std::string source_id;
  std::vector<std::string> profile_dirs;
  ImportEventCallback on_event;
  ImportSummaryCallback on_finished;
};

void StartImport(Profile* profile, ImportRequest request);

void ConfirmImport(base::WeakPtr<Profile> profile, bool merged);

}

#endif
