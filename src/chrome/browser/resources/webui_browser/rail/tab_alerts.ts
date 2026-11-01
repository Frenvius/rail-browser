import {TabAlertState, TabNetworkState} from '../tabs.mojom-webui.js';

export type AlertKind =
    'screen'|'camera'|'mic'|'bluetooth'|'usb'|'headset'|'pip';

export interface AlertBadge {
  kind: AlertKind;
  label: string;
}

const BADGES = new Map<TabAlertState, AlertBadge>([
  [
    TabAlertState.kDesktopCapturing,
    {kind: 'screen', label: 'Sharing your screen'},
  ],
  [TabAlertState.kTabCapturing, {kind: 'screen', label: 'Sharing this tab'}],
  [
    TabAlertState.kMediaRecording,
    {kind: 'camera', label: 'Using your camera or microphone'},
  ],
  [
    TabAlertState.kAudioRecording,
    {kind: 'mic', label: 'Using your microphone'},
  ],
  [TabAlertState.kVideoRecording, {kind: 'camera', label: 'Using your camera'}],
  [
    TabAlertState.kBluetoothConnected,
    {kind: 'bluetooth', label: 'Connected to a Bluetooth device'},
  ],
  [
    TabAlertState.kBluetoothScanActive,
    {kind: 'bluetooth', label: 'Scanning for Bluetooth devices'},
  ],
  [
    TabAlertState.kUsbConnected,
    {kind: 'usb', label: 'Connected to a USB device'},
  ],
  [
    TabAlertState.kHidConnected,
    {kind: 'usb', label: 'Connected to a HID device'},
  ],
  [
    TabAlertState.kSerialConnected,
    {kind: 'usb', label: 'Connected to a serial port'},
  ],
  [
    TabAlertState.kVrPresentingInHeadset,
    {kind: 'headset', label: 'Presenting in a headset'},
  ],
  [
    TabAlertState.kPipPlaying,
    {kind: 'pip', label: 'Playing in picture in picture'},
  ],
]);

export function alertBadge(states: TabAlertState[]): AlertBadge|null {
  for (const state of states) {
    const badge = BADGES.get(state);
    if (badge) {
      return badge;
    }
  }
  return null;
}

export function isLoading(state: TabNetworkState): boolean {
  return state === TabNetworkState.kWaiting ||
      state === TabNetworkState.kLoading;
}

export function tabTitle(title: string, state: TabNetworkState): string {
  return title || (isLoading(state) ? 'Loading...' : '');
}

export function tabTooltip(title: string, url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  return host && host !== title ? `${title}\n${host}` : title;
}
