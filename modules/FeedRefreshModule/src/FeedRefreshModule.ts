import { NativeModule, requireNativeModule } from 'expo';
import type { Feed } from '~/types';

import { FeedRefreshModuleEvents, NativeFeedInput } from './FeedRefreshModule.types';

declare class FeedRefreshModule extends NativeModule<FeedRefreshModuleEvents> {
  refreshFeeds(feeds: NativeFeedInput[]): Promise<string>;
  reconcileArticleDownloads(): Promise<string>;
  /** Make the READY pending generation the active one. Resolves true if one was applied. */
  applyPendingRefresh(): Promise<boolean>;
  /** Delete all cached data (generations, jobs, article metadata, HTML files). */
  clearCaches(): Promise<string>;
  isWorkerBusy(): boolean;
  collectGarbage(): Promise<string>;
  /** Download one article into the shared cache. Resolves with the file path; rejects on failure. */
  downloadArticle(url: string): Promise<string>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FeedRefreshModule>('FeedRefreshModule');

/**
 * Helper to convert Feed objects to NativeFeedInput format
 */
export function toNativeFeedInput(feed: Feed): NativeFeedInput {
  return {
    id: feed.id,
    name: feed.name,
    url: feed.url,
    oldestArticle: Number(feed.oldestArticle),
    lang: feed.lang,
  };
}
