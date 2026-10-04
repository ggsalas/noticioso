import { NativeModule, requireNativeModule } from 'expo';

import { FeedRefreshModuleEvents } from './FeedRefreshModule.types';

declare class FeedRefreshModule extends NativeModule<FeedRefreshModuleEvents> {
  refreshFeeds(urls: string[]): Promise<string>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FeedRefreshModule>('FeedRefreshModule');
