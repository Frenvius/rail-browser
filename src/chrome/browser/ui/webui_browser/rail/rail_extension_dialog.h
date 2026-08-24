#ifndef CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EXTENSION_DIALOG_H_
#define CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EXTENSION_DIALOG_H_

#include <memory>

#include "ui/gfx/native_ui_types.h"

namespace ui {
class DialogModel;
}

namespace rail {

bool ShowExtensionDialogBubble(gfx::NativeWindow parent,
                               std::unique_ptr<ui::DialogModel>& dialog_model);

}

#endif  // CHROME_BROWSER_UI_WEBUI_BROWSER_RAIL_RAIL_EXTENSION_DIALOG_H_
