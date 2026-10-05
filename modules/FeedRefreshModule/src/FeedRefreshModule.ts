import { NativeModule, requireNativeModule } from 'expo';
import type { Feed } from '~/types';

import { FeedRefreshModuleEvents, NativeFeedInput } from './FeedRefreshModule.types';

declare class FeedRefreshModule extends NativeModule<FeedRefreshModuleEvents> {
  refreshFeeds(feeds: NativeFeedInput[]): Promise<string>;
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
