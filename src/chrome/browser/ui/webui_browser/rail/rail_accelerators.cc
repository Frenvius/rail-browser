#include "chrome/browser/ui/webui_browser/rail/rail_accelerators.h"

#if BUILDFLAG(IS_WIN)
#include <windows.h>
#endif

#include <utility>

#include "chrome/app/chrome_command_ids.h"
#include "chrome/browser/ui/browser_commands.h"
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
    {ui::VKEY_OEM_COMMA, ui::EF_CONTROL_DOWN, "settings"},
    {ui::VKEY_M, ui::EF_CONTROL_DOWN | ui::EF_ALT_DOWN, "mini-window"},
};

constexpr Binding kMiniBindings[] = {
    {ui::VKEY_O, ui::EF_CONTROL_DOWN, "adopt-mini-window"},
};

constexpr std::pair<std::string_view, int> kMenuBrowserCommands[] = {
    {"new-window", IDC_NEW_WINDOW},
    {"new-incognito-window", IDC_NEW_INCOGNITO_WINDOW},
    {"import-settings", IDC_IMPORT_SETTINGS},
    {"history", IDC_SHOW_HISTORY},
    {"downloads", IDC_SHOW_DOWNLOADS},
    {"extensions", IDC_MANAGE_EXTENSIONS},
    {"passwords", IDC_SHOW_PASSWORD_MANAGER},
    {"clear-browsing-data", IDC_CLEAR_BROWSING_DATA},
    {"browser-settings", IDC_OPTIONS},
    {"about", IDC_ABOUT},
    {"dev-tools", IDC_DEV_TOOLS},
    {"dev-tools-console", IDC_DEV_TOOLS_CONSOLE},
    {"view-source", IDC_VIEW_SOURCE},
    {"task-manager", IDC_TASK_MANAGER_APP_MENU},
    {"print", IDC_PRINT},
};

}

void RunBrowserCommand(BrowserWindowInterface* browser,
                       std::string_view command) {
  if (!browser) {
    return;
  }
  if (command == "restore-tab") {
    chrome::RestoreTab(browser);
    return;
  }
  for (const auto& [name, command_id] : kMenuBrowserCommands) {
    if (name == command) {
      chrome::ExecuteCommand(browser, command_id);
      return;
    }
  }
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
    case IDC_CLOSE_TAB:
      return "close-tab";
    case IDC_BACK:
      return "back";
    case IDC_RESTORE_TAB:
      return "reopen-tab";
    default:
      return nullptr;
  }
}

const char* RailCommandForAppCommand(int app_command) {
#if BUILDFLAG(IS_WIN)
  switch (app_command) {
    case APPCOMMAND_BROWSER_BACKWARD:
      return "back";
    case APPCOMMAND_BROWSER_FORWARD:
      return "forward";
    default:
      return nullptr;
  }
#else
  return nullptr;
#endif
}

bool HandleRailAccelerator(const ui::Accelerator& accelerator,
                           webui_browser::mojom::Page* page,
                           bool mini) {
  if (!page) {
    return false;
  }
  if (mini) {
    for (const Binding& binding : kMiniBindings) {
      if (accelerator == ui::Accelerator(binding.keycode, binding.modifiers)) {
        page->RunRailCommand(binding.command);
        return true;
      }
    }
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
