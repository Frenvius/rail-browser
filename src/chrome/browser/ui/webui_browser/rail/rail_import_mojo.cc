#include "chrome/browser/ui/webui_browser/rail/rail_import_mojo.h"

#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "base/notreached.h"

namespace rail {

namespace {

using ObserverRemote = mojo::SharedRemote<rail_import::mojom::ImportObserver>;

rail_import::mojom::ImportStep StepOf(ImportStep step) {
  switch (step) {
    case ImportStep::kPasswords:
      return rail_import::mojom::ImportStep::kPasswords;
    case ImportStep::kHistory:
      return rail_import::mojom::ImportStep::kHistory;
    case ImportStep::kCookies:
      return rail_import::mojom::ImportStep::kCookies;
    case ImportStep::kExtensions:
      return rail_import::mojom::ImportStep::kExtensions;
    case ImportStep::kFavorites:
      return rail_import::mojom::ImportStep::kFavorites;
    case ImportStep::kPinned:
      return rail_import::mojom::ImportStep::kPinned;
    case ImportStep::kSpaces:
      return rail_import::mojom::ImportStep::kSpaces;
    case ImportStep::kBookmarks:
      return rail_import::mojom::ImportStep::kBookmarks;
  }
  NOTREACHED();
}

rail_import::mojom::ImportState StateOf(ImportState state) {
  switch (state) {
    case ImportState::kPending:
      return rail_import::mojom::ImportState::kPending;
    case ImportState::kRunning:
      return rail_import::mojom::ImportState::kRunning;
    case ImportState::kDone:
      return rail_import::mojom::ImportState::kDone;
    case ImportState::kSkipped:
      return rail_import::mojom::ImportState::kSkipped;
    case ImportState::kFailed:
      return rail_import::mojom::ImportState::kFailed;
  }
  NOTREACHED();
}

rail_import::mojom::ImportCountsPtr CountsOf(const ImportCounts& counts) {
  auto out = rail_import::mojom::ImportCounts::New();
  out->spaces = counts.spaces;
  out->pins = counts.pins;
  out->favorites = counts.favorites;
  out->bookmarks = counts.bookmarks;
  out->history = counts.history;
  out->cookies = counts.cookies;
  out->passwords = counts.passwords;
  out->extensions = counts.extensions;
  return out;
}

rail_import::mojom::ImportLockedPtr LockedOf(const ImportLocked& locked) {
  auto out = rail_import::mojom::ImportLocked::New();
  out->cookies = locked.cookies;
  out->passwords = locked.passwords;
  return out;
}

rail_import::mojom::ImportSourcePtr SourceOf(const ImportSourceInfo& info) {
  auto source = rail_import::mojom::ImportSource::New();
  source->id = info.id;
  source->name = info.name;
  source->icon_path = info.icon_path;
  source->icon = info.icon;
  source->installed = info.installed;
  source->running = info.running;
  for (const ImportProfileInfo& profile : info.profiles) {
    auto entry = rail_import::mojom::ImportProfile::New();
    entry->dir = profile.dir;
    entry->name = profile.name;
    entry->counts = CountsOf(profile.counts);
    entry->locked = LockedOf(profile.locked);
    source->profiles.push_back(std::move(entry));
  }
  return source;
}

void SendEvent(ObserverRemote observer, ImportEvent event) {
  auto message = rail_import::mojom::ImportEvent::New();
  message->step = StepOf(event.step);
  message->state = StateOf(event.state);
  message->profile = std::move(event.profile);
  message->detail = std::move(event.detail);
  observer->OnStep(std::move(message));
}

void SendSummary(ObserverRemote observer, ImportSummary summary) {
  observer->OnFinished(ToMojoSummary(std::move(summary)));
}

}

std::vector<rail_import::mojom::ImportSourcePtr> ToMojoSources(
    const std::vector<ImportSourceInfo>& sources) {
  std::vector<rail_import::mojom::ImportSourcePtr> out;
  out.reserve(sources.size());
  for (const ImportSourceInfo& info : sources) {
    out.push_back(SourceOf(info));
  }
  return out;
}

rail_import::mojom::ImportSummaryPtr ToMojoSummary(ImportSummary summary) {
  auto message = rail_import::mojom::ImportSummary::New();
  message->sidebar = std::move(summary.sidebar);
  message->message = std::move(summary.message);
  return message;
}

ImportEventCallback ForwardImportEvents(ObserverRemote observer) {
  return base::BindRepeating(&SendEvent, std::move(observer));
}

ImportSummaryCallback ForwardImportSummary(ObserverRemote observer) {
  return base::BindOnce(&SendSummary, std::move(observer));
}

}
