import {TabAlertState, TabNetworkState} from '../tabs.mojom-webui.js';

export interface AlertBadge {
  kind: 'record'|'device'|'pip';
  label: string;
}

const BADGES = new Map<TabAlertState, AlertBadge>([
  [
    TabAlertState.kDesktopCapturing,
    {kind: 'record', label: 'Sharing your screen'},
  ],
  [TabAlertState.kTabCapturing, {kind: 'record', label: 'Sharing this tab'}],
  [
    TabAlertState.kMediaRecording,
    {kind: 'record', label: 'Using your camera or microphone'},
  ],
  [
    TabAlertState.kAudioRecording,
    {kind: 'record', label: 'Using your microphone'},
  ],
  [TabAlertState.kVideoRecording, {kind: 'record', label: 'Using your camera'}],
  [
    TabAlertState.kBluetoothConnected,
    {kind: 'device', label: 'Connected to a Bluetooth device'},
  ],
  [
    TabAlertState.kBluetoothScanActive,
    {kind: 'device', label: 'Scanning for Bluetooth devices'},
  ],
  [
    TabAlertState.kUsbConnected,
    {kind: 'device', label: 'Connected to a USB device'},
  ],
  [
    TabAlertState.kHidConnected,
    {kind: 'device', label: 'Connected to a HID device'},
  ],
  [
    TabAlertState.kSerialConnected,
    {kind: 'device', label: 'Connected to a serial port'},
  ],
  [
    TabAlertState.kVrPresentingInHeadset,
    {kind: 'device', label: 'Presenting in a headset'},
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
