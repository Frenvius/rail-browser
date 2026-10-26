#include "chrome/browser/ui/webui_browser/rail/rail_arc_data.h"

#include <windows.h>

#include <wincrypt.h>

#include <algorithm>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "base/base64.h"
#include "base/containers/span.h"
#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "base/json/json_reader.h"
#include "base/no_destructor.h"
#include "base/strings/cstring_view.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_util.h"
#include "base/strings/strcat.h"
#include "base/strings/utf_string_conversions.h"
#include "base/synchronization/lock.h"
#include "base/time/time.h"
#include "base/values.h"
#include "crypto/aead.h"
#include "crypto/sha2.h"
#include "net/cookies/canonical_cookie.h"
#include "net/cookies/cookie_partition_key.h"
#include "sql/database.h"
#include "sql/statement.h"
#include "ui/gfx/geometry/size.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr char kImportDatabaseTag[] = "ArcImport";
constexpr std::string_view kV10Prefix = "v10";
constexpr std::string_view kV20Prefix = "v20";
constexpr std::string_view kDpapiPrefix = "DPAPI";
constexpr size_t kKeyLength = 32;
constexpr size_t kNonceLength = 12;
constexpr size_t kTagLength = 16;
constexpr int kHostHashVersion = 24;
constexpr char kCookiesVersionQuery[] =
    "SELECT value FROM meta WHERE key = 'version'";
constexpr char kCookiesQuery[] =
    "SELECT creation_utc, host_key, top_frame_site_key, name, value, path, "
    "expires_utc, is_secure, is_httponly, last_access_utc, priority, "
    "encrypted_value, samesite, source_scheme, source_port, last_update_utc, "
    "source_type, has_cross_site_ancestor FROM cookies";
constexpr char kCookiesCountQuery[] =
    "SELECT COUNT(*) FROM cookies WHERE substr(encrypted_value, 1, 3) != "
    "CAST('v20' AS BLOB)";
constexpr char kCookiesLockedCountQuery[] =
    "SELECT COUNT(*) FROM cookies WHERE substr(encrypted_value, 1, 3) = "
    "CAST('v20' AS BLOB)";
constexpr char kLoginsQuery[] =
    "SELECT origin_url, action_url, username_element, username_value, "
    "password_element, password_value, submit_element, signon_realm, "
    "date_created, date_last_used, scheme, times_used FROM logins WHERE "
    "blacklisted_by_user = 0";
constexpr char kHistoryQuery[] =
    "SELECT url, title, visit_count, typed_count, last_visit_time, hidden "
    "FROM urls WHERE last_visit_time > ? ORDER BY last_visit_time";
constexpr char kHistoryVisitsQuery[] = "SELECT last_visit_time FROM urls";
constexpr char kFaviconsQuery[] =
    "SELECT f.url, f.icon_type, b.image_data, b.width, b.height "
    "FROM icon_mapping m JOIN favicons f ON f.id = m.icon_id "
    "JOIN favicon_bitmaps b ON b.icon_id = f.id WHERE m.page_url = ?";

struct CookieCounts {
  int total = 0;
  int locked = 0;
};

struct LoginIndex {
  std::vector<std::string> keys;
  int locked = 0;
};

using VisitTimes = std::vector<int64_t>;

base::FilePath CookiesPath(const base::FilePath& profile_dir) {
  return profile_dir.AppendASCII("Network").AppendASCII("Cookies");
}

base::FilePath LoginsPath(const base::FilePath& profile_dir) {
  return profile_dir.AppendASCII("Login Data");
}

base::FilePath HistoryPath(const base::FilePath& profile_dir) {
  return profile_dir.AppendASCII("History");
}

base::FilePath FaviconsPath(const base::FilePath& profile_dir) {
  return profile_dir.AppendASCII("Favicons");
}

std::optional<std::string> Unprotect(const std::string& blob) {
  std::vector<BYTE> input(blob.begin(), blob.end());
  DATA_BLOB in;
  in.pbData = input.data();
  in.cbData = static_cast<DWORD>(input.size());
  DATA_BLOB out = {};
  if (!::CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, 0,
                            &out)) {
    return std::nullopt;
  }
  std::string plain(reinterpret_cast<const char*>(out.pbData), out.cbData);
  ::LocalFree(out.pbData);
  return plain;
}

std::optional<std::string> ReadKey(const base::FilePath& user_data) {
  std::string text;
  if (!base::ReadFileToString(user_data.AppendASCII("Local State"), &text)) {
    return std::nullopt;
  }
  const std::optional<base::DictValue> state =
      base::JSONReader::ReadDict(text, base::JSON_PARSE_RFC);
  const base::DictValue* os_crypt =
      state ? state->FindDict("os_crypt") : nullptr;
  const std::string* encoded =
      os_crypt ? os_crypt->FindString("encrypted_key") : nullptr;
  std::string blob;
  if (!encoded || !base::Base64Decode(*encoded, &blob) ||
      !base::StartsWith(blob, kDpapiPrefix)) {
    return std::nullopt;
  }
  std::optional<std::string> key =
      Unprotect(blob.substr(kDpapiPrefix.size()));
  if (!key || key->size() != kKeyLength) {
    return std::nullopt;
  }
  return key;
}

std::optional<std::string> DecryptV10(const std::string& key,
                                      std::string_view encrypted) {
  if (key.size() != kKeyLength || !base::StartsWith(encrypted, kV10Prefix)) {
    return std::nullopt;
  }
  const std::string_view body = encrypted.substr(kV10Prefix.size());
  if (body.size() < kNonceLength + kTagLength) {
    return std::nullopt;
  }
  std::optional<std::vector<uint8_t>> plain = crypto::aead::Open(
      crypto::aead::AES_256_GCM, base::as_byte_span(key),
      base::as_byte_span(body.substr(kNonceLength)),
      base::as_byte_span(body.substr(0, kNonceLength)),
      base::span<const uint8_t>());
  if (!plain) {
    return std::nullopt;
  }
  return std::string(plain->begin(), plain->end());
}

std::optional<std::string> StripHostHash(const std::string& domain,
                                         std::string plain) {
  const std::string hash = crypto::SHA256HashString(domain);
  if (!base::StartsWith(plain, hash)) {
    return std::nullopt;
  }
  return plain.substr(hash.size());
}

std::optional<std::string> ValueOf(sql::Statement& row,
                                   const std::string& domain,
                                   const std::string& key,
                                   bool hashed) {
  const std::string encrypted = row.ColumnString(11);
  if (encrypted.empty()) {
    return row.ColumnString(4);
  }
  if (!row.ColumnString(4).empty()) {
    return std::nullopt;
  }
  std::optional<std::string> plain = DecryptV10(key, encrypted);
  if (!plain) {
    return std::nullopt;
  }
  if (!hashed) {
    return plain;
  }
  return StripHostHash(domain, std::move(*plain));
}

net::CookieSameSite SameSiteOf(int value) {
  switch (value) {
    case 0:
      return net::CookieSameSite::NO_RESTRICTION;
    case 1:
      return net::CookieSameSite::LAX_MODE;
    case 2:
      return net::CookieSameSite::STRICT_MODE;
    default:
      return net::CookieSameSite::UNSPECIFIED;
  }
}

net::CookiePriority PriorityOf(int value) {
  switch (value) {
    case 0:
      return net::CookiePriority::COOKIE_PRIORITY_LOW;
    case 2:
      return net::CookiePriority::COOKIE_PRIORITY_HIGH;
    default:
      return net::CookiePriority::COOKIE_PRIORITY_MEDIUM;
  }
}

net::CookieSourceScheme SchemeOf(int value) {
  const int max = static_cast<int>(net::CookieSourceScheme::kMaxValue);
  if (value < 0 || value > max) {
    return net::CookieSourceScheme::kUnset;
  }
  return static_cast<net::CookieSourceScheme>(value);
}

net::CookieSourceType SourceTypeOf(int value) {
  switch (value) {
    case 1:
      return net::CookieSourceType::kHTTP;
    case 2:
      return net::CookieSourceType::kScript;
    default:
      return net::CookieSourceType::kOther;
  }
}

std::unique_ptr<net::CanonicalCookie> CookieOf(sql::Statement& row,
                                               const std::string& key,
                                               bool hashed) {
  const std::string domain = row.ColumnString(1);
  const base::Time expiration =
      base::Time::FromInternalValue(row.ColumnInt64(6));
  std::optional<std::string> value = ValueOf(row, domain, key, hashed);
  if (!value) {
    return nullptr;
  }
  auto partition = net::CookiePartitionKey::FromStorage(row.ColumnString(2),
                                                        row.ColumnBool(17));
  if (!partition.has_value()) {
    return nullptr;
  }
  return net::CanonicalCookie::FromStorage(
      row.ColumnString(3), std::move(*value), domain, row.ColumnString(5),
      base::Time::FromInternalValue(row.ColumnInt64(0)), expiration,
      base::Time::FromInternalValue(row.ColumnInt64(9)),
      base::Time::FromInternalValue(row.ColumnInt64(15)), row.ColumnBool(7),
      row.ColumnBool(8), SameSiteOf(row.ColumnInt(12)),
      PriorityOf(row.ColumnInt(10)), std::move(partition.value()),
      SchemeOf(row.ColumnInt(13)), row.ColumnInt(14),
      SourceTypeOf(row.ColumnInt(16)),
      net::CanonicalCookieFromStorageCallSite::kSqlitePersistentCookieStore);
}

bool IsExpired(sql::Statement& row, base::Time now) {
  const base::Time expiration =
      base::Time::FromInternalValue(row.ColumnInt64(6));
  return !expiration.is_null() && expiration <= now;
}

int CookieDbVersion(sql::Database& db) {
  sql::Statement statement(db.GetUniqueStatement(kCookiesVersionQuery));
  return statement.Step() ? statement.ColumnInt(0) : 0;
}

void ReadCookies(sql::Database& db,
                 const std::string& key,
                 ProfileStores& data) {
  const base::Time now = base::Time::Now();
  const bool hashed = CookieDbVersion(db) >= kHostHashVersion;
  sql::Statement statement(db.GetUniqueStatement(kCookiesQuery));
  while (statement.Step()) {
    if (IsExpired(statement, now)) {
      continue;
    }
    if (base::StartsWith(statement.ColumnString(11), kV20Prefix)) {
      ++data.cookies_locked;
      continue;
    }
    std::unique_ptr<net::CanonicalCookie> cookie =
        CookieOf(statement, key, hashed);
    if (cookie) {
      data.cookies.push_back(std::move(cookie));
    } else {
      ++data.cookies_skipped;
    }
  }
}

ImportedLogin LoginOf(sql::Statement& row, std::string password) {
  ImportedLogin login;
  login.origin = row.ColumnString(0);
  login.action = row.ColumnString(1);
  login.username_element = row.ColumnString(2);
  login.username_value = row.ColumnString(3);
  login.password_element = row.ColumnString(4);
  login.submit_element = row.ColumnString(6);
  login.signon_realm = row.ColumnString(7);
  login.date_created = base::Time::FromInternalValue(row.ColumnInt64(8));
  login.date_last_used = base::Time::FromInternalValue(row.ColumnInt64(9));
  login.scheme = row.ColumnInt(10);
  login.times_used = row.ColumnInt(11);
  login.password = std::move(password);
  return login;
}

void ReadLogins(sql::Database& db,
                const std::string& key,
                const std::set<std::string>& imported,
                ProfileStores& data) {
  sql::Statement statement(db.GetUniqueStatement(kLoginsQuery));
  while (statement.Step()) {
    const std::string encrypted = statement.ColumnString(5);
    if (encrypted.empty()) {
      continue;
    }
    if (base::StartsWith(encrypted, kV20Prefix)) {
      ++data.passwords_locked;
      continue;
    }
    ImportedLogin login = LoginOf(statement, std::string());
    if (imported.contains(ImportedLoginKey(login))) {
      continue;
    }
    std::optional<std::string> plain = DecryptV10(key, encrypted);
    if (!plain || plain->empty()) {
      continue;
    }
    login.password = std::move(*plain);
    data.passwords.push_back(std::move(login));
  }
}

void ReadHistory(sql::Database& db, int64_t watermark, ProfileStores& data) {
  sql::Statement statement(db.GetUniqueStatement(kHistoryQuery));
  statement.BindInt64(0, watermark);
  while (statement.Step()) {
    const GURL url(statement.ColumnString(0));
    if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
      continue;
    }
    const base::Time last_visit =
        base::Time::FromInternalValue(statement.ColumnInt64(4));
    history::URLRow row(url);
    row.set_title(base::UTF8ToUTF16(statement.ColumnString(1)));
    row.set_visit_count(statement.ColumnInt(2));
    row.set_typed_count(statement.ColumnInt(3));
    row.set_last_visit(last_visit);
    row.set_hidden(statement.ColumnBool(5));
    data.watermark = std::max(data.watermark, last_visit.ToInternalValue());
    data.urls.push_back(std::move(row));
  }
}

std::vector<std::string> PageUrls(const history::URLRows& urls,
                                  std::vector<std::string> sidebar_urls) {
  std::set<std::string> pages(sidebar_urls.begin(), sidebar_urls.end());
  for (const history::URLRow& row : urls) {
    pages.insert(row.url().spec());
  }
  return std::vector<std::string>(pages.begin(), pages.end());
}

void ReadFavicons(sql::Database& db,
                  const std::vector<std::string>& pages,
                  ProfileStores& data) {
  sql::Statement statement(db.GetUniqueStatement(kFaviconsQuery));
  for (const std::string& page : pages) {
    statement.Reset(true);
    statement.BindString(0, page);
    while (statement.Step()) {
      ImportedFavicon favicon;
      favicon.page_url = page;
      favicon.icon_url = statement.ColumnString(0);
      favicon.icon_type = statement.ColumnInt(1);
      favicon.png = statement.ColumnBlobAsVector(2);
      favicon.size = gfx::Size(statement.ColumnInt(3), statement.ColumnInt(4));
      if (favicon.png.empty() || favicon.size.IsEmpty()) {
        continue;
      }
      data.favicons.push_back(std::move(favicon));
    }
  }
}

int CountRows(sql::Database& db, base::cstring_view query) {
  sql::Statement statement(db.GetUniqueStatement(query));
  return statement.Step() ? statement.ColumnInt(0) : 0;
}

bool OpenCopy(const base::FilePath& source,
              const base::FilePath& temp_dir,
              sql::Database& db) {
  const base::FilePath target = temp_dir.Append(source.BaseName());
  if (!base::CopyFile(source, target)) {
    return false;
  }
  const base::FilePath wal(source.value() + FILE_PATH_LITERAL("-wal"));
  const base::FilePath target_wal(target.value() + FILE_PATH_LITERAL("-wal"));
  if (base::PathExists(wal) && !base::CopyFile(wal, target_wal)) {
    return false;
  }
  return db.Open(target);
}

std::string FileStamp(const base::FilePath& file) {
  base::File::Info info;
  if (!base::GetFileInfo(file, &info)) {
    return std::string();
  }
  return base::StrCat(
      {base::NumberToString(info.size), "/",
       base::NumberToString(info.last_modified.ToInternalValue())});
}

std::string StoreStamp(const base::FilePath& db) {
  const std::string main = FileStamp(db);
  if (main.empty()) {
    return main;
  }
  const base::FilePath wal(db.value() + FILE_PATH_LITERAL("-wal"));
  return base::StrCat({main, "+", FileStamp(wal)});
}

template <typename Value>
class StampedCache {
 public:
  std::optional<Value> Find(const base::FilePath& path,
                            const std::string& stamp) {
    base::AutoLock lock(lock_);
    const auto found = entries_.find(path);
    if (found == entries_.end() || found->second.first != stamp) {
      return std::nullopt;
    }
    return found->second.second;
  }

  void Store(const base::FilePath& path,
             const std::string& stamp,
             Value value) {
    base::AutoLock lock(lock_);
    entries_[path] = {stamp, std::move(value)};
  }

 private:
  base::Lock lock_;
  std::map<base::FilePath, std::pair<std::string, Value>> entries_;
};

CookieCounts ReadCookieCounts(const base::FilePath& source,
                              const base::FilePath& temp_dir) {
  CookieCounts counts;
  sql::Database db{sql::Database::Tag(kImportDatabaseTag)};
  if (OpenCopy(source, temp_dir, db)) {
    counts.total = CountRows(db, kCookiesCountQuery);
    counts.locked = CountRows(db, kCookiesLockedCountQuery);
  }
  return counts;
}

LoginIndex ReadLoginIndex(const base::FilePath& source,
                          const base::FilePath& temp_dir) {
  LoginIndex index;
  sql::Database db{sql::Database::Tag(kImportDatabaseTag)};
  if (!OpenCopy(source, temp_dir, db)) {
    return index;
  }
  sql::Statement statement(db.GetUniqueStatement(kLoginsQuery));
  while (statement.Step()) {
    const std::string encrypted = statement.ColumnString(5);
    if (encrypted.empty()) {
      continue;
    }
    if (base::StartsWith(encrypted, kV20Prefix)) {
      ++index.locked;
      continue;
    }
    index.keys.push_back(ImportedLoginKey(LoginOf(statement, std::string())));
  }
  return index;
}

VisitTimes ReadVisitTimes(const base::FilePath& source,
                          const base::FilePath& temp_dir) {
  VisitTimes times;
  sql::Database db{sql::Database::Tag(kImportDatabaseTag)};
  if (!OpenCopy(source, temp_dir, db)) {
    return times;
  }
  sql::Statement statement(db.GetUniqueStatement(kHistoryVisitsQuery));
  while (statement.Step()) {
    times.push_back(statement.ColumnInt64(0));
  }
  return times;
}

template <typename Value>
Value CachedFor(StampedCache<Value>& cache,
                const base::FilePath& source,
                Value (*read)(const base::FilePath& source,
                              const base::FilePath& temp_dir)) {
  const std::string stamp = StoreStamp(source);
  if (stamp.empty()) {
    return Value();
  }
  if (std::optional<Value> cached = cache.Find(source, stamp)) {
    return *std::move(cached);
  }
  base::ScopedTempDir temp;
  if (!temp.CreateUniqueTempDir()) {
    return Value();
  }
  Value value = read(source, temp.GetPath());
  cache.Store(source, stamp, value);
  return value;
}

StampedCache<CookieCounts>& CookieCache() {
  static base::NoDestructor<StampedCache<CookieCounts>> cache;
  return *cache;
}

StampedCache<LoginIndex>& LoginCache() {
  static base::NoDestructor<StampedCache<LoginIndex>> cache;
  return *cache;
}

StampedCache<VisitTimes>& HistoryCache() {
  static base::NoDestructor<StampedCache<VisitTimes>> cache;
  return *cache;
}

}

std::string ImportedLoginKey(const ImportedLogin& login) {
  return base::StrCat(
      {"password:",
       base::HexEncode(crypto::SHA256HashString(base::StrCat(
           {login.origin, "\n", login.username_value, "\n",
            login.signon_realm})))});
}

ProfileStoreCounts CountProfileStores(const base::FilePath& profile_dir,
                                      const ProfileMarks& marks) {
  ProfileStoreCounts counts;
  const CookieCounts cookies =
      CachedFor(CookieCache(), CookiesPath(profile_dir), &ReadCookieCounts);
  counts.cookies = cookies.total;
  counts.locked_cookies = cookies.locked;

  const LoginIndex logins =
      CachedFor(LoginCache(), LoginsPath(profile_dir), &ReadLoginIndex);
  counts.passwords = static_cast<int>(std::count_if(
      logins.keys.begin(), logins.keys.end(), [&marks](const std::string& key) {
        return !marks.imported_logins.contains(key);
      }));
  counts.locked_passwords = logins.locked;

  const VisitTimes visits =
      CachedFor(HistoryCache(), HistoryPath(profile_dir), &ReadVisitTimes);
  counts.urls = static_cast<int>(std::count_if(
      visits.begin(), visits.end(),
      [&marks](int64_t visit) { return visit > marks.watermark; }));
  return counts;
}

ProfileStores ReadProfileStores(const base::FilePath& user_data,
                                const base::FilePath& profile_dir,
                                ProfileMarks marks,
                                std::vector<std::string> sidebar_urls) {
  ProfileStores data;
  base::ScopedTempDir temp;
  if (!temp.CreateUniqueTempDir()) {
    return data;
  }
  const std::string key = ReadKey(user_data).value_or(std::string());

  sql::Database cookies{sql::Database::Tag(kImportDatabaseTag)};
  if (OpenCopy(CookiesPath(profile_dir), temp.GetPath(), cookies)) {
    ReadCookies(cookies, key, data);
  }

  sql::Database logins{sql::Database::Tag(kImportDatabaseTag)};
  if (OpenCopy(LoginsPath(profile_dir), temp.GetPath(), logins)) {
    ReadLogins(logins, key, marks.imported_logins, data);
  }

  sql::Database history{sql::Database::Tag(kImportDatabaseTag)};
  if (OpenCopy(HistoryPath(profile_dir), temp.GetPath(), history)) {
    ReadHistory(history, marks.watermark, data);
  }

  sql::Database favicons{sql::Database::Tag(kImportDatabaseTag)};
  if (OpenCopy(FaviconsPath(profile_dir), temp.GetPath(), favicons)) {
    ReadFavicons(favicons, PageUrls(data.urls, std::move(sidebar_urls)), data);
  }
  return data;
}

}
