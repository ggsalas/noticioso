import { registerWebModule, NativeModule } from 'expo';

import { FeedRefreshModuleEvents } from './FeedRefreshModule.types';

class FeedRefreshModule extends NativeModule<FeedRefreshModuleEvents> {
  async refreshFeeds(urls: string[]): Promise<string> {
    // Web stub - not implemented for Phase 0 (Android-only)
    return 'Web platform not supported for native feed refresh';
  }
}

export default registerWebModule(FeedRefreshModule, 'FeedRefreshModule');
