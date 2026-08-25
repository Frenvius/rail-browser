#include "chrome/browser/ui/webui_browser/rail/rail_favicon_source.h"

#include "chrome/browser/profiles/profile.h"
#include "components/favicon_base/favicon_url_parser.h"

namespace rail {

ActiveProfileFaviconSource::ActiveProfileFaviconSource(Profile* profile)
    : FaviconSource(profile, chrome::FaviconUrlFormat::kFavicon2) {}

ActiveProfileFaviconSource::~ActiveProfileFaviconSource() = default;

void ActiveProfileFaviconSource::SetProfile(Profile* profile) {
  if (profile) {
    profile_ = profile->GetOriginalProfile();
  }
}

base::WeakPtr<ActiveProfileFaviconSource>
ActiveProfileFaviconSource::GetWeakPtr() {
  return weak_factory_.GetWeakPtr();
}

}  // namespace rail
