#include "chrome/browser/ui/webui_browser/rail/rail_site_routes.h"

#include <algorithm>
#include <string_view>
#include <utility>

#include "base/containers/flat_set.h"
#include "base/json/json_reader.h"
#include "base/strings/string_util.h"
#include "base/values.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/webui_browser/rail/rail_sidebar_state.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "components/prefs/pref_service.h"
#include "components/prefs/scoped_user_pref_update.h"
#include "url/gurl.h"

namespace rail {

const char kSiteRoutesPref[] = "rail.site_routes";
const char kSpaceVisitsPref[] = "rail.space_visits";

namespace {

constexpr char kDomainKey[] = "domain";
constexpr char kPathKey[] = "path";
constexpr char kSpaceKey[] = "space";
constexpr char kEnabledKey[] = "enabled";
constexpr char kFromAiKey[] = "ai";
constexpr size_t kMaxVisitedHosts = 100;
constexpr size_t kMaxPlannedRoutes = 60;

std::optional<base::flat_set<std::string>> SpaceIds(PrefService* prefs) {
  std::optional<base::DictValue> record =
      base::JSONReader::ReadDict(GetSidebarState(prefs), base::JSON_PARSE_RFC);
  const base::ListValue* spaces = record ? record->FindList("spaces") : nullptr;
  if (!spaces) {
    return std::nullopt;
  }
  base::flat_set<std::string> ids;
  for (const base::Value& space : *spaces) {
    const std::string* id =
        space.is_dict() ? space.GetDict().FindString("id") : nullptr;
    if (id) {
      ids.insert(*id);
    }
  }
  return ids;
}

bool Covers(const SiteRoute& route,
            std::string_view host,
            std::string_view path) {
  if (!route.enabled ||
      (host != route.domain && !base::EndsWith(host, "." + route.domain))) {
    return false;
  }
  return route.path.empty() || path == route.path ||
         base::StartsWith(path, route.path + "/");
}

bool MoreSpecific(const SiteRoute& route, const SiteRoute& than) {
  return std::pair(route.domain.size(), route.path.size()) >
         std::pair(than.domain.size(), than.path.size());
}

bool IsHostName(std::string_view host) {
  return host.find('.') != std::string_view::npos && host.front() != '.' &&
         host.back() != '.' && std::ranges::all_of(host, [](char c) {
           return base::IsAsciiAlphaNumeric(c) || c == '-' || c == '.';
         });
}

bool SameSite(const SiteRoute& a, const SiteRoute& b) {
  return a.domain == b.domain && a.path == b.path;
}

std::string SiteHost(const GURL& url) {
  std::string host(url.host());
  if (base::StartsWith(host, "www.")) {
    host.erase(0, 4);
  }
  return host;
}

void DropRarestHost(base::DictValue& hosts) {
  std::string rarest;
  int fewest = 0;
  for (const auto [host, count] : hosts) {
    const int visits = count.GetIfInt().value_or(0);
    if (rarest.empty() || visits < fewest) {
      rarest = host;
      fewest = visits;
    }
  }
  hosts.Remove(rarest);
}

}

std::optional<SiteRoute> ParseSiteRoute(const std::string& site,
                                        const std::string& space_id) {
  const std::string text(base::TrimWhitespaceASCII(site, base::TRIM_ALL));
  if (text.empty() || space_id.empty()) {
    return std::nullopt;
  }
  const GURL url(text.find("://") == std::string::npos ? "https://" + text
                                                       : text);
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS() ||
      !IsHostName(url.host())) {
    return std::nullopt;
  }
  std::string path(url.path());
  while (!path.empty() && path.back() == '/') {
    path.pop_back();
  }
  return SiteRoute{SiteHost(url), std::move(path), space_id};
}

std::vector<SiteRoute> GetSiteRoutes(PrefService* prefs) {
  std::vector<SiteRoute> routes;
  if (!prefs) {
    return routes;
  }
  for (const base::Value& entry : prefs->GetList(kSiteRoutesPref)) {
    const base::DictValue* dict = entry.GetIfDict();
    const std::string* domain = dict ? dict->FindString(kDomainKey) : nullptr;
    const std::string* space = dict ? dict->FindString(kSpaceKey) : nullptr;
    if (!domain || !space || domain->empty() || space->empty()) {
      continue;
    }
    const std::string* path = dict->FindString(kPathKey);
    routes.push_back(SiteRoute{*domain, path ? *path : std::string(), *space,
                               dict->FindBool(kEnabledKey).value_or(true),
                               dict->FindBool(kFromAiKey).value_or(false)});
  }
  return routes;
}

void SetSiteRoutes(PrefService* prefs, const std::vector<SiteRoute>& routes) {
  if (!prefs) {
    return;
  }
  base::ListValue list;
  for (const SiteRoute& route : routes) {
    if (route.domain.empty() || route.space_id.empty()) {
      continue;
    }
    list.Append(base::DictValue()
                    .Set(kDomainKey, route.domain)
                    .Set(kPathKey, route.path)
                    .Set(kSpaceKey, route.space_id)
                    .Set(kEnabledKey, route.enabled)
                    .Set(kFromAiKey, route.from_ai));
  }
  prefs->SetList(kSiteRoutesPref, std::move(list));
}

bool AddSiteRoute(PrefService* prefs, const SiteRoute& route) {
  if (!prefs || route.domain.empty() || route.space_id.empty()) {
    return false;
  }
  std::vector<SiteRoute> routes = GetSiteRoutes(prefs);
  std::erase_if(routes,
                [&](const SiteRoute& other) { return SameSite(other, route); });
  routes.insert(routes.begin(), route);
  SetSiteRoutes(prefs, routes);
  return true;
}

std::string AddSiteRouteForSite(PrefService* prefs,
                                const std::string& url,
                                const std::string& space_id) {
  std::optional<SiteRoute> route = ParseSiteRoute(url, space_id);
  if (!route) {
    return std::string();
  }
  route->path.clear();
  return AddSiteRoute(prefs, *route) ? route->domain : std::string();
}

bool ApplyPlannedRoutes(PrefService* prefs,
                        const std::vector<SiteRoute>& planned) {
  const std::optional<base::flat_set<std::string>> spaces =
      prefs ? SpaceIds(prefs) : std::nullopt;
  if (!spaces) {
    return false;
  }
  std::vector<SiteRoute> routes = GetSiteRoutes(prefs);
  std::erase_if(routes, [](const SiteRoute& route) { return route.from_ai; });
  size_t added = 0;
  for (const SiteRoute& route : planned) {
    if (added == kMaxPlannedRoutes) {
      break;
    }
    if (!spaces->contains(route.space_id) ||
        std::ranges::any_of(routes, [&](const SiteRoute& other) {
          return SameSite(other, route);
        })) {
      continue;
    }
    routes.push_back(
        SiteRoute{route.domain, route.path, route.space_id, true, true});
    ++added;
  }
  SetSiteRoutes(prefs, routes);
  return true;
}

void RecordSpaceVisit(PrefService* prefs,
                      const std::string& space_id,
                      const GURL& url) {
  if (!prefs || space_id.empty() || !url.SchemeIsHTTPOrHTTPS() ||
      !IsHostName(url.host())) {
    return;
  }
  const std::string host = SiteHost(url);
  ScopedDictPrefUpdate update(prefs, kSpaceVisitsPref);
  base::DictValue* hosts = update->EnsureDict(space_id);
  const int visits = hosts->FindInt(host).value_or(0);
  if (!visits && hosts->size() >= kMaxVisitedHosts) {
    DropRarestHost(*hosts);
  }
  hosts->Set(host, visits + 1);
}

SpaceVisits GetSpaceVisits(PrefService* prefs) {
  SpaceVisits visits;
  if (!prefs) {
    return visits;
  }
  for (const auto [space_id, hosts] : prefs->GetDict(kSpaceVisitsPref)) {
    if (!hosts.is_dict()) {
      continue;
    }
    base::flat_map<std::string, int32_t>& counts = visits[space_id];
    for (const auto [host, count] : hosts.GetDict()) {
      if (count.is_int()) {
        counts[host] = count.GetInt();
      }
    }
  }
  return visits;
}

std::vector<std::string> SiteFaviconHosts(PrefService* prefs,
                                          const std::string& site) {
  std::vector<std::string> hosts;
  if (site.empty()) {
    return hosts;
  }
  hosts.push_back(site);
  if (!base::StartsWith(site, "www.")) {
    hosts.push_back("www." + site);
  }
  base::flat_map<std::string, int> subdomains;
  for (const auto& [space_id, counts] : GetSpaceVisits(prefs)) {
    for (const auto& [host, count] : counts) {
      if (base::EndsWith(host, "." + site)) {
        subdomains[host] += count;
      }
    }
  }
  std::vector<std::pair<std::string, int>> ranked(subdomains.begin(),
                                                  subdomains.end());
  std::ranges::stable_sort(ranked, std::ranges::greater(),
                           &std::pair<std::string, int>::second);
  for (auto& [host, count] : ranked) {
    hosts.push_back(std::move(host));
  }
  return hosts;
}

void PruneDeletedSpaces(PrefService* prefs) {
  const std::optional<base::flat_set<std::string>> spaces = SpaceIds(prefs);
  if (!spaces) {
    return;
  }
  std::vector<SiteRoute> routes = GetSiteRoutes(prefs);
  const size_t removed = std::erase_if(routes, [&](const SiteRoute& route) {
    return !spaces->contains(route.space_id);
  });
  if (removed) {
    SetSiteRoutes(prefs, routes);
  }
  std::vector<std::string> stale;
  for (const auto [space_id, hosts] : prefs->GetDict(kSpaceVisitsPref)) {
    if (!spaces->contains(space_id)) {
      stale.push_back(space_id);
    }
  }
  if (stale.empty()) {
    return;
  }
  ScopedDictPrefUpdate update(prefs, kSpaceVisitsPref);
  for (const std::string& space_id : stale) {
    update->Remove(space_id);
  }
}

bool RouteToSpace(BrowserWindowInterface* shell, const GURL& url) {
  WebUIBrowserWindow* window =
      shell ? WebUIBrowserWindow::FromBrowser(shell) : nullptr;
  webui_browser::mojom::Page* page =
      window ? window->GetWebUIBrowserUI()->page() : nullptr;
  if (!page) {
    return false;
  }
  PrefService* prefs = shell->GetProfile()->GetPrefs();
  const std::optional<base::flat_set<std::string>> spaces = SpaceIds(prefs);
  if (!spaces) {
    return false;
  }
  std::optional<SiteRoute> best;
  for (const SiteRoute& route : GetSiteRoutes(prefs)) {
    if (spaces->contains(route.space_id) &&
        Covers(route, url.host(), url.path()) &&
        (!best || MoreSpecific(route, *best))) {
      best = route;
    }
  }
  if (!best) {
    return false;
  }
  page->OnRailOpenInSpace(url, best->space_id);
  return true;
}

}
