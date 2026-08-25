#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_FAVICON_SOURCE_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_FAVICON_SOURCE_H_

#include "base/memory/weak_ptr.h"
#include "chrome/browser/ui/webui/favicon_source.h"

class Profile;

namespace rail {

class ActiveProfileFaviconSource : public FaviconSource {
 public:
  explicit ActiveProfileFaviconSource(Profile* profile);
  ~ActiveProfileFaviconSource() override;

  void SetProfile(Profile* profile);

  base::WeakPtr<ActiveProfileFaviconSource> GetWeakPtr();

 private:
  base::WeakPtrFactory<ActiveProfileFaviconSource> weak_factory_{this};
};

}  // namespace rail

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_FAVICON_SOURCE_H_
