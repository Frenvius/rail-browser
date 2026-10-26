import {TRACKED_ELEMENT_VISIBILITY_CHANGED_EVENT, TrackedElementManager} from '//resources/js/tracked_element/tracked_element_manager.js';
import type {TrackedElementVisibilityChangedEvent} from '//resources/js/tracked_element/tracked_element_manager.js';

const REPORT_TIMEOUT_MS = 500;

export function whenReportedVisible(
    element: HTMLElement, nativeId: string): Promise<void> {
  const manager = TrackedElementManager.getInstance();
  if (manager.getElementFor(element)?.visible) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const target = manager.getVisibilityEventTarget(nativeId);
    const finish = () => {
      clearTimeout(timeout);
      target.removeEventListener(
          TRACKED_ELEMENT_VISIBILITY_CHANGED_EVENT, onVisibilityChanged);
      resolve();
    };
    const onVisibilityChanged = (e: Event) => {
      const {detail} = e as TrackedElementVisibilityChangedEvent;
      if (detail.element === element && detail.visible) {
        finish();
      }
    };
    const timeout = setTimeout(finish, REPORT_TIMEOUT_MS);
    target.addEventListener(
        TRACKED_ELEMENT_VISIBILITY_CHANGED_EVENT, onVisibilityChanged);
  });
}
