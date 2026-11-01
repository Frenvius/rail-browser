#include "chrome/browser/ui/webui_browser/rail/rail_media_tracker.h"

#include <algorithm>
#include <optional>
#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/memory/weak_ptr.h"
#include "base/strings/utf_string_conversions.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/webui_browser/rail/rail_auto_pip.h"
#include "chrome/browser/ui/webui_browser/rail/rail_media_prefs.h"
#include "components/prefs/pref_service.h"
#include "chrome/browser/ui/webui_browser/rail/rail_tab_audio.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/favicon_status.h"
#include "content/public/browser/media_session.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/navigation_entry.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_observer.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "services/media_session/public/cpp/media_image.h"
#include "services/media_session/public/cpp/media_metadata.h"
#include "services/media_session/public/cpp/media_position.h"
#include "services/media_session/public/mojom/media_session.mojom.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/base/webui/web_ui_util.h"

namespace rail {

using MediaAction = media_session::mojom::MediaSessionAction;
using Action = rail_media::mojom::Action;

void TrackMedia(std::unique_ptr<MediaTracker>& tracker,
                BrowserWindowInterface* browser,
                base::WeakPtr<WebUIBrowserUI> controller) {
  if (tracker) {
    tracker->ReportAll();
    return;
  }
  if (!browser) {
    return;
  }
  tracker = std::make_unique<MediaTracker>(
      browser,
      base::BindRepeating(
          [](base::WeakPtr<WebUIBrowserUI> controller,
             const tabs_api::NodeId& tab, rail_media::mojom::StatePtr state) {
            if (controller && controller->page()) {
              controller->page()->OnMediaChanged(tab, std::move(state));
            }
          },
          std::move(controller)));
}

class MediaTracker::Session
    : public content::WebContentsObserver,
      public media_session::mojom::MediaSessionObserver {
 public:
  Session(MediaTracker* tracker, content::WebContents* contents)
      : WebContentsObserver(contents), tracker_(tracker) {
    TrackAutoPipVideo(contents);
    auto* tab = tabs::TabInterface::MaybeGetFromContents(contents);
    id_ = tabs_api::NodeId::FromTabHandle(tab->GetHandle());
    Bind(content::MediaSession::GetIfExists(contents));
  }

  const tabs_api::NodeId& id() const { return id_; }

  void Report() {
    if (!web_contents() || !info_ ||
        !tracker_->media_prefs_.prefs()->GetBoolean(kSidebarMediaControlsPref)) {
      tracker_->callback_.Run(id_, nullptr);
      return;
    }
    auto state = rail_media::mojom::State::New();
    state->tab = id_;
    state->playing = playing_;
    state->controllable = info_->is_controllable ||
                          (was_controllable_ && web_contents()->IsAudioMuted());
    state->muted = info_->muted || web_contents()->IsAudioMuted();
    state->active = tracker_->model_ &&
                    tracker_->model_->GetActiveWebContents() == web_contents();
    state->dismissed = dismissed_;
    state->can_play = HasAction(MediaAction::kPlay);
    state->can_pause = HasAction(MediaAction::kPause);
    state->can_previous = HasAction(MediaAction::kPreviousTrack);
    state->can_next = HasAction(MediaAction::kNextTrack);
    state->last_played = last_played_;
    state->title = "Media";
    if (!info_->hide_metadata) {
      state->title = base::UTF16ToUTF8(metadata_ && !metadata_->title.empty()
                                           ? metadata_->title
                                           : web_contents()->GetTitle());
      state->artist = metadata_ ? base::UTF16ToUTF8(metadata_->artist) : "";
      state->source =
          metadata_ ? base::UTF16ToUTF8(metadata_->source_title) : "";
      state->artwork = artwork_;
      auto* entry = web_contents()->GetController().GetLastCommittedEntry();
      if (entry && !entry->GetFavicon().image.IsEmpty()) {
        state->favicon =
            webui::GetBitmapDataUrl(*entry->GetFavicon().image.ToSkBitmap());
      }
    }
    tracker_->callback_.Run(id_, std::move(state));
  }

  void RunAction(Action action) {
    auto* contents = web_contents();
    auto* session =
        contents ? content::MediaSession::GetIfExists(contents) : nullptr;
    if (!session || !info_) {
      return;
    }
    switch (action) {
      case Action::kPlay:
        if (HasAction(MediaAction::kPlay)) {
          session->Resume(content::MediaSession::SuspendType::kUI);
        }
        break;
      case Action::kPause:
        if (HasAction(MediaAction::kPause)) {
          session->Suspend(content::MediaSession::SuspendType::kUI);
        }
        break;
      case Action::kPrevious:
        if (HasAction(MediaAction::kPreviousTrack)) {
          session->PreviousTrack();
        }
        break;
      case Action::kNext:
        if (HasAction(MediaAction::kNextTrack)) {
          session->NextTrack();
        }
        break;
      case Action::kMute:
        ToggleTabMuted(tracker_->browser_, id_);
        Report();
        break;
      case Action::kActivate: {
        int index = tracker_->model_->GetIndexOfWebContents(contents);
        if (index != TabStripModel::kNoTab) {
          tracker_->model_->ActivateTabAt(index);
        }
        break;
      }
      case Action::kDismiss:
        dismissed_ = true;
        session->Suspend(content::MediaSession::SuspendType::kUI);
        Report();
        break;
    }
  }

 private:
  bool HasAction(MediaAction action) const {
    return std::ranges::contains(actions_, action);
  }

  void Bind(content::MediaSession* session) {
    if (!session || receiver_.is_bound()) {
      return;
    }
    session->AddObserver(receiver_.BindNewPipeAndPassRemote());
  }

  void MediaSessionCreated(content::MediaSession* session) override {
    Bind(session);
  }

  void WebContentsDestroyed() override {
    receiver_.reset();
    weak_factory_.InvalidateWeakPtrs();
    info_.reset();
    tracker_->callback_.Run(id_, nullptr);
    Observe(nullptr);
  }

  void PrimaryPageChanged(content::Page&) override {
    metadata_.reset();
    artwork_.clear();
    ++artwork_generation_;
    last_played_ = 0;
    dismissed_ = false;
    playing_ = false;
    was_controllable_ = false;
    info_.reset();
    actions_.clear();
    Report();
  }

  void MediaSessionInfoChanged(
      media_session::mojom::MediaSessionInfoPtr info) override {
    bool playing = info->playback_state ==
                   media_session::mojom::MediaPlaybackState::kPlaying;
    if (playing && !playing_) {
      dismissed_ = false;
      last_played_ = ++tracker_->sequence_;
    }
    playing_ = playing;
    was_controllable_ = was_controllable_ || info->is_controllable;
    info_ = std::move(info);
    Report();
  }

  void MediaSessionMetadataChanged(
      const std::optional<media_session::MediaMetadata>& metadata) override {
    metadata_ = metadata;
    Report();
  }

  void MediaSessionActionsChanged(
      const std::vector<MediaAction>& actions) override {
    actions_ = actions;
    Report();
  }

  void MediaSessionImagesChanged(
      const base::flat_map<media_session::mojom::MediaSessionImageType,
                           std::vector<media_session::MediaImage>>& images)
      override {
    uint32_t generation = ++artwork_generation_;
    artwork_.clear();
    Report();
    auto it =
        images.find(media_session::mojom::MediaSessionImageType::kArtwork);
    auto* session = web_contents()
                        ? content::MediaSession::GetIfExists(web_contents())
                        : nullptr;
    auto info = session ? session->GetMediaSessionInfoSync() : nullptr;
    if (!info || info->hide_metadata || it == images.end() ||
        it->second.empty()) {
      return;
    }
    session->GetMediaImageBitmap(
        it->second.front(), 16, 96,
        base::BindOnce(&Session::OnArtwork, weak_factory_.GetWeakPtr(),
                       generation));
  }

  void OnArtwork(uint32_t generation, const SkBitmap& bitmap) {
    if (generation != artwork_generation_ || bitmap.drawsNothing()) {
      return;
    }
    artwork_ = webui::GetBitmapDataUrl(bitmap);
    Report();
  }

  void MediaSessionPositionChanged(
      const std::optional<media_session::MediaPosition>&) override {}

  raw_ptr<MediaTracker> tracker_;
  tabs_api::NodeId id_;
  mojo::Receiver<media_session::mojom::MediaSessionObserver> receiver_{this};
  media_session::mojom::MediaSessionInfoPtr info_;
  std::optional<media_session::MediaMetadata> metadata_;
  std::vector<MediaAction> actions_;
  std::string artwork_;
  uint32_t artwork_generation_ = 0;
  uint32_t last_played_ = 0;
  bool playing_ = false;
  bool dismissed_ = false;
  bool was_controllable_ = false;
  base::WeakPtrFactory<Session> weak_factory_{this};
};

MediaTracker::MediaTracker(BrowserWindowInterface* browser, Callback callback)
    : browser_(browser),
      model_(browser->GetTabStripModel()),
      callback_(std::move(callback)) {
  media_prefs_.Init(browser->GetProfile()->GetOriginalProfile()->GetPrefs());
  media_prefs_.Add(
      kSidebarMediaControlsPref,
      base::BindRepeating(&MediaTracker::ReportAll, base::Unretained(this)));
  model_->AddObserver(this);
  Reconcile();
}

MediaTracker::~MediaTracker() {
  if (model_) {
    model_->RemoveObserver(this);
  }
}

void MediaTracker::Reconcile() {
  if (!model_) {
    return;
  }
  std::set<content::WebContents*> live;
  for (int i = 0; i < model_->count(); ++i) {
    auto* contents = model_->GetWebContentsAt(i);
    live.insert(contents);
    if (!sessions_.contains(contents)) {
      sessions_.emplace(contents, std::make_unique<Session>(this, contents));
    }
  }
  for (auto it = sessions_.begin(); it != sessions_.end();) {
    if (!live.contains(it->first)) {
      callback_.Run(it->second->id(), nullptr);
      it = sessions_.erase(it);
    } else {
      ++it;
    }
  }
  ReportAll();
}

void MediaTracker::ReportAll() {
  for (const auto& [contents, session] : sessions_) {
    session->Report();
  }
}

void MediaTracker::OnTabStripModelChanged(TabStripModel*,
                                          const TabStripModelChange&,
                                          const TabStripSelectionChange&) {
  Reconcile();
}

void MediaTracker::OnTabChangedAt(tabs::TabInterface* tab, TabChangeType) {
  auto it = sessions_.find(tab->GetContents());
  if (it != sessions_.end()) {
    it->second->Report();
  }
}

void MediaTracker::OnTabStripModelDestroyed(TabStripModel*) {
  sessions_.clear();
  model_ = nullptr;
  browser_ = nullptr;
}

void MediaTracker::RunAction(const tabs_api::NodeId& tab, Action action) {
  if (!model_) {
    return;
  }
  for (const auto& [contents, session] : sessions_) {
    if (session->id() == tab) {
      session->RunAction(action);
      return;
    }
  }
}

}
