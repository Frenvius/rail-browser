import type {RailMenuItem} from '../browser.mojom-webui.js';
import {browserProxyFactory} from '../browser.mojom-webui.js';

export interface NativeMenuItem {
  command?: string;
  label?: string;
  accelerator?: string;
  separator?: boolean;
  danger?: boolean;
  checked?: boolean;
  swatches?: string[];
  selected?: string;
  children?: NativeMenuItem[];
}

let pending: ((command: string) => void)|null = null;
let chosen: string|null = null;
let listening = false;

function toMojo(item: NativeMenuItem): RailMenuItem {
  return {
    command: item.command ?? '',
    label: item.label ?? '',
    accelerator: item.accelerator ?? '',
    separator: item.separator ?? false,
    danger: item.danger ?? false,
    checked: item.checked ?? false,
    swatches: item.swatches ?? [],
    selected: item.selected ?? '',
    children: (item.children ?? []).map(toMojo),
  };
}

function listen() {
  if (listening) {
    return;
  }
  listening = true;
  const router = browserProxyFactory.getInstance().callbackRouter;
  router.onRailMenuCommand.addListener((command: string) => {
    chosen = command;
  });
  router.onRailMenuClosed.addListener(() => {
    const run = pending;
    const command = chosen;
    pending = null;
    chosen = null;
    if (run && command !== null) {
      run(command);
    }
  });
}

export function isNativeMenuOpen(): boolean {
  return pending !== null;
}

export function showNativeMenu(
    items: NativeMenuItem[], onCommand: (command: string) => void) {
  listen();
  pending = onCommand;
  chosen = null;
  browserProxyFactory.getInstance().handler.showRailMenu(items.map(toMojo));
}

export function separator(): NativeMenuItem {
  return {separator: true};
}

export function menuItems(
    entries: Array<NativeMenuItem|false|null|undefined>): NativeMenuItem[] {
  const kept = entries.filter((entry): entry is NativeMenuItem => !!entry);
  const trimmed: NativeMenuItem[] = [];
  for (const entry of kept) {
    if (entry.separator && (!trimmed.length || trimmed.at(-1)!.separator)) {
      continue;
    }
    trimmed.push(entry);
  }
  while (trimmed.length && trimmed.at(-1)!.separator) {
    trimmed.pop();
  }
  return trimmed;
}
