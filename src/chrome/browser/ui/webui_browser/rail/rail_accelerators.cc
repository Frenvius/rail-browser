#include "chrome/browser/ui/webui_browser/rail/rail_accelerators.h"

#include "chrome/app/chrome_command_ids.h"
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
    {ui::VKEY_S, ui::EF_CONTROL_DOWN, "toggle-sidebar"},
};

}

bool IsCommandDisabledInShell(int command_id) {
  switch (command_id) {
    case IDC_BOOKMARK_THIS_TAB:
    case IDC_BOOKMARK_ALL_TABS:
    case IDC_FOCUS_BOOKMARKS:
    case IDC_SHOW_BOOKMARK_BAR:
    case IDC_SHOW_BOOKMARK_MANAGER:
    case IDC_SHOW_BOOKMARK_SIDE_PANEL:
      return true;
    default:
      return false;
  }
}

const char* RailCommandForBrowserCommand(int command_id) {
  switch (command_id) {
    case IDC_SELECT_NEXT_TAB:
      return "next-tab";
    case IDC_SELECT_PREVIOUS_TAB:
      return "previous-tab";
    case IDC_SELECT_TAB_0:
      return "select-tab:0";
    case IDC_SELECT_TAB_1:
      return "select-tab:1";
    case IDC_SELECT_TAB_2:
      return "select-tab:2";
    case IDC_SELECT_TAB_3:
      return "select-tab:3";
    case IDC_SELECT_TAB_4:
      return "select-tab:4";
    case IDC_SELECT_TAB_5:
      return "select-tab:5";
    case IDC_SELECT_TAB_6:
      return "select-tab:6";
    case IDC_SELECT_TAB_7:
      return "select-tab:7";
    case IDC_SELECT_LAST_TAB:
      return "select-tab:last";
    default:
      return nullptr;
  }
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
