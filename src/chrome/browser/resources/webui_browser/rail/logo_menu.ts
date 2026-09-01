import {browserProxyFactory} from '../browser.mojom-webui.js';

import {menuItems, separator, showNativeMenu} from './native_menu.js';

export type LogoMenuCommand = 'close'|'new-tab'|'set-default'|'settings';

export interface LogoMenuHost {
  closeWindow(): void;
  newTab(): void;
}

export async function openLogoMenu(host: LogoMenuHost) {
  const handler = browserProxyFactory.getInstance().handler;
  const {isDefault} = await handler.isDefaultBrowser();
  const items = menuItems([
    !isDefault && {command: 'set-default', label: 'Set Rail as Default Browser'},
    separator(),
    {command: 'new-tab', label: 'New Tab', accelerator: 'Ctrl+T'},
    separator(),
    {command: 'settings', label: 'Settings', accelerator: 'Ctrl+,'},
    separator(),
    {command: 'close', label: 'Close', accelerator: 'Alt+F4'},
  ]);
  showNativeMenu(items, raw => {
    switch (raw as LogoMenuCommand) {
      case 'set-default':
        handler.setAsDefaultBrowser();
        return;
      case 'new-tab':
        host.newTab();
        return;
      case 'settings':
        handler.openRailSettings();
        return;
      case 'close':
        host.closeWindow();
        return;
    }
  });
}
