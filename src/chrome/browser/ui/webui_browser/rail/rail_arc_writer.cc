#include "chrome/browser/ui/webui_browser/rail/rail_arc_writer.h"

#include <algorithm>
#include <memory>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "base/functional/concurrent_callbacks.h"
#include "base/memory/ref_counted.h"
#include "base/memory/ref_counted_memory.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/strcat.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/favicon/favicon_service_factory.h"
#include "chrome/browser/history/history_service_factory.h"
#include "chrome/browser/password_manager/factories/profile_password_store_factory.h"
#include "chrome/browser/profiles/profile.h"
#include "components/favicon/core/favicon_service.h"
#include "components/favicon_base/favicon_types.h"
#include "components/history/core/browser/history_service.h"
#include "components/history/core/browser/history_types.h"
#include "components/keyed_service/core/service_access_type.h"
#include "components/password_manager/core/browser/password_form.h"
#include "components/password_manager/core/browser/password_store/password_store_interface.h"
#include "components/password_manager/core/browser/password_store/stored_credential.h"
#include "components/password_manager/core/browser/password_string.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/storage_partition.h"
#include "mojo/public/cpp/bindings/callback_helpers.h"
#include "net/cookies/cookie_access_result.h"
#include "net/cookies/cookie_inclusion_status.h"
#include "net/cookies/cookie_options.h"
#include "services/network/public/mojom/cookie_manager.mojom.h"
#include "url/gurl.h"

namespace rail {

namespace {

struct WriteJob {
  base::WeakPtr<Profile> profile;
  ProfileStores data;
  StoreWriteResult result;
  StoreWriteCallback callback;
};

void Finish(std::unique_ptr<WriteJob> job) {
  std::move(job->callback).Run(std::move(job->result));
}

GURL CookieSourceOf(const net::CanonicalCookie& cookie) {
  std::string host = cookie.Domain();
  if (host.starts_with('.')) {
    host.erase(0, 1);
  }
  return GURL(base::StrCat({cookie.IsSecure() ? "https://" : "http://", host,
                            "/"}));
}

void OnCookieSet(base::OnceCallback<void(bool)> done,
                 net::CookieAccessResult result) {
  std::move(done).Run(result.status.IsInclude());
}

net::CookieAccessResult UnknownCookieFailure() {
  net::CookieInclusionStatus status;
  status.AddExclusionReason(
      net::CookieInclusionStatus::ExclusionReason::EXCLUDE_UNKNOWN_ERROR);
  return net::CookieAccessResult(status);
}

password_manager::PasswordForm::Scheme SchemeOf(int value) {
  const int max = static_cast<int>(
      password_manager::PasswordForm::Scheme::kMaxValue);
  if (value < 0 || value > max) {
    return password_manager::PasswordForm::Scheme::kHtml;
  }
  return static_cast<password_manager::PasswordForm::Scheme>(value);
}

password_manager::StoredCredential CredentialOf(const ImportedLogin& login) {
  password_manager::StoredCredential credential;
  credential.scheme = SchemeOf(login.scheme);
  credential.signon_realm = login.signon_realm;
  credential.url = GURL(login.origin);
  credential.action = GURL(login.action);
  credential.username_element = base::UTF8ToUTF16(login.username_element);
  credential.username_value = base::UTF8ToUTF16(login.username_value);
  credential.password_element = base::UTF8ToUTF16(login.password_element);
  credential.submit_element = base::UTF8ToUTF16(login.submit_element);
  credential.password_value = password_manager::PasswordString(
      base::UTF8ToUTF16(login.password));
  credential.date_created = login.date_created;
  credential.date_last_used = login.date_last_used;
  credential.times_used_in_html_form = login.times_used;
  credential.type = password_manager::PasswordForm::Type::kImported;
  return credential;
}

void WriteHistory(std::unique_ptr<WriteJob> job);

void OnCookiesWritten(std::unique_ptr<WriteJob> job,
                      std::vector<bool> outcomes);

void WritePasswords(std::unique_ptr<WriteJob> job);

void OnPasswordsWritten(
    scoped_refptr<password_manager::PasswordStoreInterface>,
    std::unique_ptr<WriteJob> job,
    bool written) {
  if (!written) {
    job->result.imported_logins.clear();
  }
  WriteHistory(std::move(job));
}

base::OnceClosure AsClosure(base::OnceCallback<void(bool)> done) {
  return base::BindOnce(std::move(done), true);
}

void OnCookiesWritten(std::unique_ptr<WriteJob> job,
                      std::vector<bool> outcomes) {
  const int written = static_cast<int>(std::count(outcomes.begin(),
                                                  outcomes.end(), true));
  job->result.cookies = written;
  job->result.cookies_skipped =
      job->data.cookies_skipped + static_cast<int>(outcomes.size()) - written;
  job->result.cookies_locked = job->data.cookies_locked;
  WritePasswords(std::move(job));
}

void WriteCookies(std::unique_ptr<WriteJob> job) {
  if (!job->profile) {
    Finish(std::move(job));
    return;
  }
  std::vector<std::unique_ptr<net::CanonicalCookie>> cookies =
      std::move(job->data.cookies);
  network::mojom::CookieManager* manager =
      job->profile->GetDefaultStoragePartition()
          ->GetCookieManagerForBrowserProcess();
  base::ConcurrentCallbacks<bool> outcomes;
  for (const std::unique_ptr<net::CanonicalCookie>& cookie : cookies) {
    const GURL source = CookieSourceOf(*cookie);
    if (!source.is_valid()) {
      outcomes.CreateCallback().Run(false);
      continue;
    }
    manager->SetCanonicalCookie(
        *cookie, source, net::CookieOptions::MakeAllInclusive(),
        mojo::WrapCallbackWithDefaultInvokeIfNotRun(
            base::BindOnce(&OnCookieSet, outcomes.CreateCallback()),
            UnknownCookieFailure()));
  }
  std::move(outcomes).Done(base::BindOnce(&OnCookiesWritten, std::move(job)));
}

void WritePasswords(std::unique_ptr<WriteJob> job) {
  if (!job->profile) {
    Finish(std::move(job));
    return;
  }
  scoped_refptr<password_manager::PasswordStoreInterface> store =
      ProfilePasswordStoreFactory::GetForProfile(
          job->profile.get(), ServiceAccessType::EXPLICIT_ACCESS);
  if (!store) {
    job->result.password_store_ready = false;
    WriteHistory(std::move(job));
    return;
  }
  std::vector<password_manager::StoredCredential> credentials;
  credentials.reserve(job->data.passwords.size());
  for (const ImportedLogin& login : job->data.passwords) {
    credentials.push_back(CredentialOf(login));
    job->result.imported_logins.push_back(ImportedLoginKey(login));
  }
  job->result.password_store_ready = true;
  job->result.passwords = static_cast<int>(credentials.size());
  job->result.passwords_locked = job->data.passwords_locked;
  password_manager::PasswordStoreInterface* raw = store.get();
  raw->AddLogins(
      std::move(credentials),
      AsClosure(mojo::WrapCallbackWithDefaultInvokeIfNotRun(
          base::BindOnce(&OnPasswordsWritten, store, std::move(job)), false)));
}

void WriteFavicons(WriteJob& job) {
  favicon::FaviconService* favicons = FaviconServiceFactory::GetForProfile(
      job.profile.get(), ServiceAccessType::EXPLICIT_ACCESS);
  if (!favicons) {
    return;
  }
  for (ImportedFavicon& favicon : job.data.favicons) {
    const GURL page(favicon.page_url);
    const GURL icon(favicon.icon_url);
    const auto type = static_cast<favicon_base::IconType>(favicon.icon_type);
    if (!page.is_valid() || !icon.is_valid() ||
        type == favicon_base::IconType::kInvalid) {
      continue;
    }
    favicons->MergeFavicon(
        page, icon, type,
        base::MakeRefCounted<base::RefCountedBytes>(std::move(favicon.png)),
        favicon.size);
  }
}

void WriteHistory(std::unique_ptr<WriteJob> job) {
  if (!job->profile) {
    Finish(std::move(job));
    return;
  }
  history::HistoryService* history_service =
      HistoryServiceFactory::GetForProfile(job->profile.get(),
                                           ServiceAccessType::EXPLICIT_ACCESS);
  if (history_service) {
    history_service->AddPagesWithDetails(job->data.urls,
                                         history::SOURCE_OS_MIGRATION_IMPORTED);
    job->result.urls = static_cast<int>(job->data.urls.size());
    job->result.watermark = job->data.watermark;
  }
  WriteFavicons(*job);
  Finish(std::move(job));
}

}

void WriteProfileStores(Profile* profile,
                        ProfileStores data,
                        StoreWriteCallback callback) {
  if (!profile) {
    std::move(callback).Run(StoreWriteResult());
    return;
  }
  auto job = std::make_unique<WriteJob>();
  job->profile = profile->GetWeakPtr();
  job->data = std::move(data);
  job->callback = std::move(callback);
  WriteCookies(std::move(job));
}

}
