export const MENU_OPEN_EVENT = 'rail-menu-open';

export function announceMenuOpen(menu: HTMLElement) {
  menu.dispatchEvent(
      new CustomEvent(MENU_OPEN_EVENT, {bubbles: true, composed: true}));
}
