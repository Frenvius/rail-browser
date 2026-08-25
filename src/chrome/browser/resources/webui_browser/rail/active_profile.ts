import {browserProxyFactory} from '../browser.mojom-webui.js';

export class ActiveProfile {
  private current_: string|null = null;
  private pending_: Promise<void> = Promise.resolve();

  apply(profileId: string, rebind: () => void): Promise<void> {
    if (this.current_ === profileId) {
      return this.pending_;
    }
    this.current_ = profileId;
    this.pending_ = this.pending_.then(async () => {
      await browserProxyFactory.getInstance().handler.setActiveProfile(
          profileId);
      if (this.current_ === profileId) {
        rebind();
      }
    });
    return this.pending_;
  }
}
