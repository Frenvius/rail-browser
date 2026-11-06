#include "chrome/browser/ui/webui_browser/rail/rail_automation_painting.h"

#include <map>
#include <string_view>

#include "base/functional/callback_helpers.h"
#include "base/no_destructor.h"
#include "components/tabs/public/tab_interface.h"
#include "content/public/browser/devtools_agent_host.h"
#include "content/public/browser/devtools_agent_host_client_channel.h"
#include "content/public/browser/devtools_agent_host_observer.h"
#include "content/public/browser/web_contents.h"
#include "third_party/inspector_protocol/crdtp/dispatch.h"
#include "ui/gfx/geometry/size.h"

namespace rail {

namespace {

constexpr std::string_view kDrivingMethodPrefixes[] = {
    "Runtime.evaluate", "Runtime.callFunctionOn", "Input.", "DOM.",
    "Accessibility.",
};

constexpr bool kStayHidden = true;
constexpr bool kStayAwake = false;
constexpr bool kIsActivity = false;

bool IsDrivingMethod(std::string_view method) {
  for (std::string_view prefix : kDrivingMethodPrefixes) {
    if (method.starts_with(prefix)) {
      return true;
    }
  }
  return false;
}

std::string_view MethodOf(base::span<const uint8_t> message) {
  crdtp::Dispatchable dispatchable(crdtp::SpanFrom(message), std::string_view(),
                                   nullptr);
  if (!dispatchable.ok()) {
    return std::string_view();
  }
  crdtp::span<uint8_t> method = dispatchable.Method();
  return std::string_view(reinterpret_cast<const char*>(method.data()),
                          method.size());
}

class DrivenTabs : public content::DevToolsAgentHostObserver {
 public:
  static DrivenTabs& Get() {
    static base::NoDestructor<DrivenTabs> instance;
    return *instance;
  }

  DrivenTabs() { content::DevToolsAgentHost::AddObserver(this); }

  void Keep(content::DevToolsAgentHost* host) {
    if (painting_.contains(host)) {
      return;
    }
    content::WebContents* contents = host->GetWebContents();
    if (!contents || !tabs::TabInterface::MaybeGetFromContents(contents)) {
      return;
    }
    painting_.emplace(host, contents->IncrementCapturerCount(
                                gfx::Size(), kStayHidden, kStayAwake,
                                kIsActivity));
  }

  void DevToolsAgentHostDetached(content::DevToolsAgentHost* host) override {
    painting_.erase(host);
  }

  void DevToolsAgentHostDestroyed(content::DevToolsAgentHost* host) override {
    painting_.erase(host);
  }

 private:
  std::map<content::DevToolsAgentHost*, base::ScopedClosureRunner> painting_;
};

}

void KeepDrivenTabPainting(content::DevToolsAgentHostClientChannel* channel,
                           base::span<const uint8_t> message) {
  if (!IsDrivingMethod(MethodOf(message))) {
    return;
  }
  DrivenTabs::Get().Keep(channel->GetAgentHost());
}

}
