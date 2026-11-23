#include "chrome/browser/ui/webui_browser/rail/rail_crash_reporting.h"

#include <memory>

#include "base/files/file_path.h"
#include "build/build_config.h"
#include "third_party/crashpad/crashpad/client/crash_report_database.h"
#include "third_party/crashpad/crashpad/client/settings.h"

#if BUILDFLAG(IS_WIN)
#include "components/crash/core/app/crash_export_thunks.h"
#else
#include "components/crash/core/app/crashpad.h"
#endif

namespace rail {

namespace {

bool UploadsEnabledIn(crashpad::CrashReportDatabase* database) {
  if (!database) {
    return false;
  }
  bool enabled = false;
  database->GetSettings()->GetUploadsEnabled(&enabled);
  return enabled;
}

}

#if BUILDFLAG(IS_WIN)

bool GetSendCrashReports() {
  const wchar_t* path = GetCrashpadDatabasePath_ExportThunk();
  if (!path) {
    return false;
  }
  std::unique_ptr<crashpad::CrashReportDatabase> database =
      crashpad::CrashReportDatabase::InitializeWithoutCreating(
          base::FilePath(path));
  return UploadsEnabledIn(database.get());
}

void SetSendCrashReports(bool enabled) {
  SetUploadConsent_ExportThunk(enabled);
}

#else

bool GetSendCrashReports() {
  return UploadsEnabledIn(crash_reporter::internal::GetCrashReportDatabase());
}

void SetSendCrashReports(bool enabled) {
  crash_reporter::SetUploadConsent(enabled);
}

#endif

}
