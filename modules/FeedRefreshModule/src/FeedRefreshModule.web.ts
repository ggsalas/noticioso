import { registerWebModule, NativeModule } from 'expo';

import { FeedRefreshModuleEvents, NativeFeedInput } from './FeedRefreshModule.types';

class FeedRefreshModule extends NativeModule<FeedRefreshModuleEvents> {
  async refreshFeeds(feeds: NativeFeedInput[]): Promise<string> {
    // Web stub - not implemented for Stage 2 (Android-only)
    return 'Web platform not supported for native feed refresh';
  }

  async reconcileArticleDownloads(): Promise<string> {
    return 'Web platform not supported';
  }

  isWorkerBusy(): boolean {
    return false;
  }

  async downloadArticle(url: string): Promise<string> {
    throw new Error('Web platform not supported');
  }

  async collectGarbage(): Promise<string> {
    return 'Web platform not supported';
  }

  async applyPendingRefresh(): Promise<boolean> {
    return false;
  }

  async clearCaches(): Promise<string> {
    return 'Web platform not supported';
  }
}

export default registerWebModule(FeedRefreshModule, 'FeedRefreshModule');
