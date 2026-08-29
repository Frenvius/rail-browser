#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SYSTEM_BACKDROP_CONTROLLER_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_SYSTEM_BACKDROP_CONTROLLER_H_

#include <memory>

#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)

#include "third_party/skia/include/core/SkColor.h"

namespace views {
class Widget;
}

namespace rail {

enum class SystemBackdropMaterial {
  kMica,
  kMicaAlt,
  kAcrylic,
  kAcrylicThin,
};

struct SystemBackdropConfig {
  SystemBackdropMaterial material = SystemBackdropMaterial::kAcrylic;
  SkColor tint_color = SkColorSetRGB(27, 33, 45);
  SkColor fallback_color = SkColorSetRGB(27, 33, 45);
  float tint_opacity = 0.2f;
  float luminosity_opacity = 0.9f;
};

class SystemBackdropController {
 public:
  static std::unique_ptr<SystemBackdropController> Create(
      views::Widget* widget,
      const SystemBackdropConfig& config);

  SystemBackdropController(const SystemBackdropController&) = delete;
  SystemBackdropController& operator=(const SystemBackdropController&) = delete;
  ~SystemBackdropController();

  void SetConfig(const SystemBackdropConfig& config);
  void SetActive(bool active);
  void SetDarkMode(bool dark_mode);

 private:
  class Impl;

  explicit SystemBackdropController(std::unique_ptr<Impl> impl);

  std::unique_ptr<Impl> impl_;
};

}  // namespace rail

#endif

#endif
