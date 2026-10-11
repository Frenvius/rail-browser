#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_CAPTURE_REGION_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_CAPTURE_REGION_H_

#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)

#include "base/memory/raw_ptr.h"
#include "base/win/windows_types.h"
#include "ui/base/interaction/element_tracker.h"

namespace views {
class Widget;
}

namespace rail {

class CaptureRegion {
 public:
  explicit CaptureRegion(views::Widget* widget);
  CaptureRegion(const CaptureRegion&) = delete;
  CaptureRegion& operator=(const CaptureRegion&) = delete;
  ~CaptureRegion();

 private:
  void Place(ui::TrackedElement* element);
  void Hide(ui::TrackedElement* element);

  raw_ptr<views::Widget> widget_;
  HWND hwnd_ = nullptr;
  ui::ElementTracker::Subscription shown_subscription_;
  ui::ElementTracker::Subscription bounds_subscription_;
  ui::ElementTracker::Subscription hidden_subscription_;
};

}  // namespace rail

#endif

#endif
