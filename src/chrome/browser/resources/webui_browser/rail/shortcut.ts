const IS_MAC = navigator.userAgent.includes('Macintosh');

const MAC_SHORTCUTS: Record<string, string> = {
  'Ctrl+Alt+M': 'Cmd+Shift+Option+M',
  'Ctrl+Alt+N': 'Cmd+Shift+Option+N',
  'Ctrl+H': 'Cmd+Y',
  'Ctrl+J': 'Cmd+Shift+J',
  'Ctrl+O': 'Cmd+Option+O',
  'Ctrl+S': 'Cmd+Shift+S',
  'Ctrl+Shift+I': 'Cmd+Option+I',
  'Ctrl+Shift+J': 'Cmd+Option+J',
  'Ctrl+Tab': 'Ctrl+Tab',
  'Ctrl+Shift+Tab': 'Ctrl+Shift+Tab',
  'Ctrl+U': 'Cmd+Option+U',
  'Alt+Left': 'Cmd+[',
  'Alt+Right': 'Cmd+]',
  'Alt+F4': 'Cmd+Shift+W',
  'Shift+Esc': '',
};

export function shortcut(value: string): string {
  if (!IS_MAC) {
    return value;
  }
  if (/^Alt\+[1-9]$/.test(value)) {
    return `Ctrl+${value.at(-1)}`;
  }
  return MAC_SHORTCUTS[value] ??
      value.replace(/^Ctrl(?=\+)/, 'Cmd').replaceAll('Alt+', 'Option+');
}
