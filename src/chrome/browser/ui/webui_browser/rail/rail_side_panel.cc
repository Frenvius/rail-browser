#include "chrome/browser/ui/webui_browser/rail/rail_side_panel.h"

#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/side_panel/side_panel_entry_key.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/extension_host.h"
#include "extensions/browser/extension_host_registry.h"
#include "extensions/browser/extension_registry.h"
#include "extensions/common/extension.h"

namespace rail {

std::string ExtensionSidePanelTitle(Profile* profile,
                                    const SidePanelEntryKey& key) {
  if (!key.extension_id()) {
    return std::string();
  }
  const extensions::Extension* extension =
      extensions::ExtensionRegistry::Get(profile)->enabled_extensions().GetByID(
          *key.extension_id());
  return extension ? extension->short_name() : std::string();
}

void LoadExtensionSidePanel(content::WebContents* contents) {
  if (!contents->GetController().IsInitialNavigation()) {
    return;
  }
  for (extensions::ExtensionHost* host :
       extensions::ExtensionHostRegistry::Get(contents->GetBrowserContext())
           ->extension_hosts()) {
    if (host->host_contents() == contents) {
      host->CreateRendererSoon();
      return;
    }
  }
}

}
