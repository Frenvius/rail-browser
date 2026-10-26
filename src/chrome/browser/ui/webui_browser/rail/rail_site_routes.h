#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_ROUTES_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_ROUTES_H_

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "base/containers/flat_map.h"

class BrowserWindowInterface;
class GURL;
class PrefService;

namespace rail {

extern const char kSiteRoutesPref[];
extern const char kSpaceVisitsPref[];

struct SiteRoute {
  std::string domain;
  std::string path;
  std::string space_id;
  bool enabled = true;
  bool from_ai = false;
};

using SpaceVisits =
    base::flat_map<std::string, base::flat_map<std::string, int32_t>>;

std::optional<SiteRoute> ParseSiteRoute(const std::string& site,
                                        const std::string& space_id);

std::vector<SiteRoute> GetSiteRoutes(PrefService* prefs);

void SetSiteRoutes(PrefService* prefs, const std::vector<SiteRoute>& routes);

bool AddSiteRoute(PrefService* prefs, const SiteRoute& route);

std::string AddSiteRouteForSite(PrefService* prefs,
                                const std::string& url,
                                const std::string& space_id);

bool ApplyPlannedRoutes(PrefService* prefs,
                        const std::vector<SiteRoute>& planned);

void RecordSpaceVisit(PrefService* prefs,
                      const std::string& space_id,
                      const GURL& url);

SpaceVisits GetSpaceVisits(PrefService* prefs);

std::vector<std::string> SiteFaviconHosts(PrefService* prefs,
                                          const std::string& site);

void PruneDeletedSpaces(PrefService* prefs);

bool RouteToSpace(BrowserWindowInterface* shell, const GURL& url);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SITE_ROUTES_H_
