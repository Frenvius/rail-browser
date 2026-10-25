#include <windows.h>

#include <winhttp.h>

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "base/command_line.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "base/win/scoped_handle.h"

namespace {

enum ExitCode : int {
  kSuccess = 0,
  kInvalidArguments = 1,
  kRequestFailed = 2,
  kUnexpectedStatus = 3,
  kWriteFailed = 4,
  kLengthMismatch = 5,
};

constexpr DWORD kBufferSize = 64 * 1024;

struct InternetCloser {
  void operator()(HINTERNET handle) const { WinHttpCloseHandle(handle); }
};
using ScopedInternet = std::unique_ptr<void, InternetCloser>;

ExitCode Transfer(HINTERNET request, HANDLE file, uint64_t length) {
  std::vector<char> buffer(kBufferSize);
  uint64_t received = 0;
  for (;;) {
    DWORD read = 0;
    if (!WinHttpReadData(request, buffer.data(), kBufferSize, &read)) {
      return kRequestFailed;
    }
    if (read == 0) {
      break;
    }
    received += read;
    if (received > length) {
      return kLengthMismatch;
    }
    DWORD written = 0;
    if (!WriteFile(file, buffer.data(), read, &written, nullptr) ||
        written != read) {
      return kWriteFailed;
    }
  }
  return received == length ? kSuccess : kLengthMismatch;
}

ExitCode Download(const std::wstring& url,
                  const std::wstring& output,
                  uint64_t length) {
  URL_COMPONENTS parts = {};
  parts.dwStructSize = sizeof(parts);
  parts.dwHostNameLength = static_cast<DWORD>(-1);
  parts.dwUrlPathLength = static_cast<DWORD>(-1);
  parts.dwExtraInfoLength = static_cast<DWORD>(-1);
  if (!WinHttpCrackUrl(url.c_str(), 0, 0, &parts) ||
      (parts.nScheme != INTERNET_SCHEME_HTTPS &&
       parts.nScheme != INTERNET_SCHEME_HTTP)) {
    return kInvalidArguments;
  }
  std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
  std::wstring path(parts.lpszUrlPath,
                    parts.dwUrlPathLength + parts.dwExtraInfoLength);

  ScopedInternet session(WinHttpOpen(
      L"Rail Update", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
      WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
  if (!session) {
    return kRequestFailed;
  }
  ScopedInternet connection(
      WinHttpConnect(session.get(), host.c_str(), parts.nPort, 0));
  if (!connection) {
    return kRequestFailed;
  }
  ScopedInternet request(WinHttpOpenRequest(
      connection.get(), L"GET", path.c_str(), nullptr, WINHTTP_NO_REFERER,
      WINHTTP_DEFAULT_ACCEPT_TYPES,
      parts.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0));
  if (!request ||
      !WinHttpSendRequest(request.get(), WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                          WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
      !WinHttpReceiveResponse(request.get(), nullptr)) {
    return kRequestFailed;
  }
  DWORD status = 0;
  DWORD status_size = sizeof(status);
  if (!WinHttpQueryHeaders(request.get(),
                           WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                           WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size,
                           WINHTTP_NO_HEADER_INDEX) ||
      status != 200) {
    return kUnexpectedStatus;
  }

  std::wstring partial = output + L".part";
  base::win::ScopedHandle file(CreateFileW(partial.c_str(), GENERIC_WRITE, 0,
                                           nullptr, CREATE_ALWAYS,
                                           FILE_ATTRIBUTE_NORMAL, nullptr));
  if (!file.is_valid()) {
    return kWriteFailed;
  }
  ExitCode result = Transfer(request.get(), file.get(), length);
  file.Close();
  if (result == kSuccess &&
      !MoveFileExW(partial.c_str(), output.c_str(),
                   MOVEFILE_REPLACE_EXISTING)) {
    result = kWriteFailed;
  }
  if (result != kSuccess) {
    DeleteFileW(partial.c_str());
  }
  return result;
}

}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, wchar_t*, int) {
  base::CommandLine::Init(0, nullptr);
  const base::CommandLine::StringVector& args =
      base::CommandLine::ForCurrentProcess()->GetArgs();
  uint64_t length = 0;
  if (args.size() != 3 ||
      !base::StringToUint64(base::WideToUTF8(args[2]), &length) ||
      length == 0) {
    return kInvalidArguments;
  }
  return Download(args[0], args[1], length);
}
