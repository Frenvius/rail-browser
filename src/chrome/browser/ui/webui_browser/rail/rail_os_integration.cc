#include "chrome/browser/ui/webui_browser/rail/rail_os_integration.h"

#include <optional>
#include <string>
#include <utility>

#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/location.h"
#include "base/memory/ref_counted.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)
#include <windows.h>

#include "base/win/registry.h"
#include "chrome/browser/shell_integration_win.h"
#include "chrome/browser/win/taskbar_manager.h"
#endif

namespace rail {

#if BUILDFLAG(IS_WIN)
namespace {

constexpr wchar_t kRunKeyPath[] =
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t kRunValueName[] = L"Rail";

std::optional<std::wstring> RunCommand() {
  base::FilePath exe;
  if (!base::PathService::Get(base::FILE_EXE, &exe)) {
    return std::nullopt;
  }
  return L"\"" + exe.value() + L"\"";
}

bool ReadRunAtLogin() {
  const std::optional<std::wstring> command = RunCommand();
  base::win::RegKey key(HKEY_CURRENT_USER, kRunKeyPath, KEY_QUERY_VALUE);
  std::wstring stored;
  return command && key.Valid() &&
         key.ReadValue(kRunValueName, &stored) == ERROR_SUCCESS &&
         stored == *command;
}

void WriteRunAtLogin(bool enabled) {
  base::win::RegKey key(HKEY_CURRENT_USER, kRunKeyPath, KEY_SET_VALUE);
  if (!key.Valid()) {
    return;
  }
  if (!enabled) {
    key.DeleteValue(kRunValueName);
    return;
  }
  const std::optional<std::wstring> command = RunCommand();
  if (command) {
    key.WriteValue(kRunValueName, command->c_str());
  }
}

base::SequencedTaskRunner& RunKeyTaskRunner() {
  static base::NoDestructor<scoped_refptr<base::SequencedTaskRunner>> runner(
      base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock()}));
  return **runner;
}

}
#endif

void IsRunAtLogin(base::OnceCallback<void(bool)> callback) {
#if BUILDFLAG(IS_WIN)
  RunKeyTaskRunner().PostTaskAndReplyWithResult(
      FROM_HERE, base::BindOnce(&ReadRunAtLogin), std::move(callback));
#else
  std::move(callback).Run(false);
#endif
}

void SetRunAtLogin(bool enabled) {
#if BUILDFLAG(IS_WIN)
  RunKeyTaskRunner().PostTask(FROM_HERE,
                              base::BindOnce(&WriteRunAtLogin, enabled));
#endif
}

void CanPinToTaskbar(const base::FilePath& profile_path,
                     base::OnceCallback<void(bool)> callback) {
#if BUILDFLAG(IS_WIN)
  browser_util::ShouldOfferToPin(
      shell_integration::win::GetAppUserModelIdForBrowser(profile_path),
      browser_util::PinAppToTaskbarChannel::kFirstRunExperience,
      std::move(callback));
#else
  std::move(callback).Run(false);
#endif
}

void PinToTaskbar(const base::FilePath& profile_path) {
#if BUILDFLAG(IS_WIN)
  browser_util::PinAppToTaskbar(
      shell_integration::win::GetAppUserModelIdForBrowser(profile_path),
      browser_util::PinAppToTaskbarChannel::kFirstRunExperience,
      base::DoNothing());
#endif
}

}
