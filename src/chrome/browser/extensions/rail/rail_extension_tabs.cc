#include "chrome/browser/extensions/rail/rail_extension_tabs.h"

#include "chrome/browser/extensions/window_controller.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/tab_list/tab_list_interface.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/common/extension.h"
#include "ui/base/page_transition_types.h"
#include "ui/gfx/range/range.h"
#include "url/gurl.h"

namespace rail {

bool WindowHoldsTabsOf(BrowserWindowInterface* window,
                       content::BrowserContext* context) {
  TabListInterface* tab_list =
      window ? TabListInterface::From(window) : nullptr;
  if (!tab_list || !context) {
    return false;
  }
  for (tabs::TabInterface* tab : tab_list->GetAllTabs()) {
    content::WebContents* contents = tab->GetContents();
    if (contents && contents->GetBrowserContext() == context) {
      return true;
    }
  }
  return false;
}

bool WindowHoldsTabsOf(const extensions::WindowController* window,
                       content::BrowserContext* context) {
  if (!window || !context) {
    return false;
  }
  for (int index = 0; index < window->GetTabCount(); ++index) {
    content::WebContents* contents = window->GetWebContentsAt(index);
    if (contents && contents->GetBrowserContext() == context) {
      return true;
    }
  }
  return false;
}

bool WindowVisibleTo(const extensions::WindowController* window,
                     content::BrowserContext* context) {
  return window && context &&
         (Profile::FromBrowserContext(context)->IsSameOrParent(
              window->profile()) ||
          WindowHoldsTabsOf(window, context));
}

bool TabVisibleTo(content::WebContents* contents,
                  content::BrowserContext* context,
                  bool include_incognito) {
  if (!contents || !context) {
    return false;
  }
  Profile* extension_profile = Profile::FromBrowserContext(context);
  Profile* tab_profile =
      Profile::FromBrowserContext(contents->GetBrowserContext());
  return tab_profile == extension_profile ||
         (include_incognito && extension_profile->IsSameOrParent(tab_profile));
}

bool TabVisibleTo(content::WebContents* contents,
                  const extensions::Extension* extension) {
  if (!extension) {
    return true;
  }
  return contents &&
         extensions::ExtensionRegistry::Get(contents->GetBrowserContext())
                 ->GetExtensionById(extension->id(),
                                    extensions::ExtensionRegistry::EVERYTHING) ==
             extension;
}

bool GroupVisibleTo(TabListInterface& tab_list,
                    const tab_groups::TabGroupId& group,
                    content::BrowserContext* context,
                    bool include_incognito) {
  const gfx::Range indices = tab_list.GetTabGroupTabIndices(group);
  if (indices.is_empty()) {
    return false;
  }
  tabs::TabInterface* tab = tab_list.GetTab(indices.start());
  return tab && TabVisibleTo(tab->GetContents(), context, include_incognito);
}

std::unique_ptr<content::WebContents> CreateExtensionTabContents(
    BrowserWindowInterface& window,
    content::BrowserContext* context,
    const GURL& url) {
  Profile* profile = Profile::FromBrowserContext(context);
  Profile* window_profile = window.GetProfile();
  if (!profile || profile == window_profile || profile->IsOffTheRecord() ||
      window_profile->IsOffTheRecord()) {
    return nullptr;
  }
  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(content::WebContents::CreateParams(profile));
  content::NavigationController::LoadURLParams params(url);
  params.transition_type = ui::PAGE_TRANSITION_LINK;
  contents->GetController().LoadURLWithParams(params);
  return contents;
}

}  // namespace rail
