#include "chrome/browser/ui/webui_browser/rail/rail_space_partition.h"

#include <memory>
#include <optional>
#include <utility>

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_tabstrip.h"
#include "chrome/browser/ui/navigator/browser_navigator.h"
#include "chrome/browser/ui/navigator/browser_navigator_params.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/site_instance.h"
#include "content/public/browser/storage_partition_config.h"
#include "content/public/browser/web_contents.h"
#include "ui/base/page_transition_types.h"
#include "ui/base/window_open_disposition.h"
#include "url/gurl.h"

namespace rail {

namespace {

constexpr char kPartitionDomain[] = "railspace";

}

content::WebContents* CreateTabInPartition(Browser* browser,
                                           const std::string& partition,
                                           const GURL& url) {
  if (!browser || url.is_empty()) {
    return nullptr;
  }

  if (partition.empty()) {
    return chrome::AddAndReturnTabAt(browser, url, -1, true, std::nullopt,
                                     false);
  }

  Profile* profile = browser->profile();
  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(content::WebContents::CreateParams(
          profile, content::SiteInstance::CreateForFixedStoragePartition(
                       profile, url,
                       content::StoragePartitionConfig::Create(
                           profile, kPartitionDomain, partition,
                           /*in_memory=*/false))));
  contents->GetController().LoadURLWithParams(
      content::NavigationController::LoadURLParams(url));

  NavigateParams params(browser, std::move(contents));
  params.disposition = WindowOpenDisposition::NEW_FOREGROUND_TAB;
  params.transition = ui::PAGE_TRANSITION_TYPED;
  params.tabstrip_index = -1;
  Navigate(&params);
  return params.navigated_or_inserted_contents;
}

}
