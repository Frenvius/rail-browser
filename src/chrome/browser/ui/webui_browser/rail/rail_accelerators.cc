#include "chrome/browser/ui/webui_browser/rail/rail_accelerators.h"

#include "ui/base/accelerators/accelerator.h"
#include "ui/events/event_constants.h"
#include "ui/events/keycodes/keyboard_codes.h"

namespace rail {

namespace {

struct Binding {
  ui::KeyboardCode keycode;
  int modifiers;
  const char* command;
};

constexpr Binding kBindings[] = {
    {ui::VKEY_RIGHT, ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN, "next-space"},
    {ui::VKEY_LEFT, ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN, "previous-space"},
    {ui::VKEY_N, ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN, "new-space"},
};

}

bool HandleRailAccelerator(const ui::Accelerator& accelerator,
                           webui_browser::mojom::Page* page) {
  if (!page) {
    return false;
  }
  for (const Binding& binding : kBindings) {
    if (accelerator == ui::Accelerator(binding.keycode, binding.modifiers)) {
      page->RunRailCommand(binding.command);
      return true;
    }
  }
  return false;
}

}
