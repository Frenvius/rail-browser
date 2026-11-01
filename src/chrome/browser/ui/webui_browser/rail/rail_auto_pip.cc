#include "chrome/browser/ui/webui_browser/rail/rail_auto_pip.h"

#include <algorithm>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui_browser/rail/rail_media_prefs.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/media_session.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"
#include "services/media_session/public/mojom/media_session.mojom.h"
#include "ui/gfx/geometry/size.h"

namespace rail {

namespace {

class AutoPipVideo : public content::WebContentsObserver,
                     public content::WebContentsUserData<AutoPipVideo> {
 public:
  bool Allowed() const {
    if (size_.IsEmpty() || size_.width() <= size_.height() ||
        web_contents()->IsAudioMuted() ||
        web_contents()->GetCurrentlyPlayingVideoCount() != 1) {
      return false;
    }
    const auto& url = web_contents()->GetLastCommittedURL();
    if (url.path().starts_with("/shorts/") ||
        url.path().starts_with("/reel/") || url.path().starts_with("/reels/")) {
      return false;
    }
    auto* session = content::MediaSession::GetIfExists(web_contents());
    if (!session) {
      return false;
    }
    auto info = session->GetMediaSessionInfoSync();
    return info && !info->muted && info->is_controllable &&
           info->playback_state ==
               media_session::mojom::MediaPlaybackState::kPlaying &&
           info->audio_video_states &&
           std::ranges::contains(
               *info->audio_video_states,
               media_session::mojom::MediaAudioVideoState::kAudioVideo);
  }

 private:
  explicit AutoPipVideo(content::WebContents* contents)
      : WebContentsObserver(contents), WebContentsUserData(*contents) {}

  void MediaResized(const gfx::Size& size,
                    const content::MediaPlayerId&) override {
    size_ = size;
  }

  void PrimaryPageChanged(content::Page&) override { size_ = gfx::Size(); }

  gfx::Size size_;
  friend WebContentsUserData;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

WEB_CONTENTS_USER_DATA_KEY_IMPL(AutoPipVideo);

}

void TrackAutoPipVideo(content::WebContents* contents) {
  AutoPipVideo::CreateForWebContents(contents);
}

std::optional<bool> AutoPipVideoAllowed(content::WebContents* contents) {
  auto* video = AutoPipVideo::FromWebContents(contents);
  if (!video) {
    return std::nullopt;
  }
  auto* profile = Profile::FromBrowserContext(contents->GetBrowserContext());
  auto* prefs = profile->GetOriginalProfile()->GetPrefs();
  if (!prefs->GetBoolean(kAutoPipEnabledPref) ||
      (profile->IsOffTheRecord() && !prefs->GetBoolean(kAutoPipPrivatePref))) {
    return false;
  }
  return video->Allowed();
}

}
