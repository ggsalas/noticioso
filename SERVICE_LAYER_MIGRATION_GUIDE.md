# Service Layer Architecture Migration Guide

## Overview
This guide provides step-by-step instructions to migrate from the current domain-based architecture to a Service Layer Architecture. Each phase is designed to be implemented independently with zero breaking changes.

## Prerequisites
- Ensure all tests pass: `npm test`
- Create backup branch: `git checkout -b backup-before-service-migration`
- Create feature branch: `git checkout -b feature/service-layer-architecture`

---

## Phase 1: Create Storage Service (Day 1 - 2 hours)

### Goal
Abstract AsyncStorage operations into a dedicated service

### What to Build
- **StorageService class** with methods: `getItem()`, `setItem()`, `removeItem()`, `clear()`
- **Generic type support** for type-safe storage operations
- **Error handling** with try/catch and meaningful error messages
- **Singleton instance** export for easy consumption

### Implementation Steps
1. **Create services directory**: `mkdir services`
2. **Create StorageService.ts**: Import AsyncStorage, create class with async methods
3. **Add error handling**: Wrap AsyncStorage calls in try/catch blocks
4. **Export singleton**: Create and export `storageService` instance
5. **Test functionality**: Verify storage operations work correctly

### Key Methods
```typescript
async getItem<T>(key: string): Promise<T | null>
async setItem<T>(key: string, value: T): Promise<void>
async removeItem(key: string): Promise<void>
```

---

## Phase 2: Create Network Service (Day 1 - 3 hours)

### Goal
Centralize HTTP requests and XML parsing

### What to Build
- **NetworkService class** with fetch operations for feeds and articles
- **XML parsing** using existing XMLParser from fast-xml-parser
- **Content sanitization** using existing safe-html library
- **Error handling** for network failures and parsing errors

### Implementation Steps
1. **Create NetworkService.ts**: Import required dependencies (XMLParser, sanitize)
2. **Add fetch methods**: `fetchFeedContent()` and `fetchArticleContent()`
3. **Move XML parsing logic**: Extract from `domain/getFeedContent.ts`
4. **Move sanitization logic**: Extract HTML cleaning functionality
5. **Add error handling**: Wrap network calls with meaningful error messages
6. **Test with real URLs**: Verify parsing works with existing feeds

### Key Methods
```typescript
async fetchFeedContent(url: string): Promise<FeedData>
async fetchArticleContent(url: string): Promise<string>
sanitizeContent(content: string): string
```

---

## Phase 3: Create Feed Service (Day 2 - 4 hours)

### Goal
Centralize feed business logic and CRUD operations

### What to Build
- **FeedService class** with all feed-related business logic
- **Dependency injection** for StorageService and NetworkService
- **Validation methods** for feed data integrity
- **Date filtering logic** for articles based on feed settings
- **CRUD operations** for feed management

### Implementation Steps
1. **Create FeedService.ts**: Set up class with constructor dependencies
2. **Move storage operations**: Extract from `domain/getFeeds.ts`
3. **Add business logic**: Include validation, filtering, and CRUD methods
4. **Implement getFeedContent()**: Combine network fetch with filtering logic
5. **Add factory function**: For clean dependency injection
6. **Test all operations**: Verify CRUD and content fetching works

### Key Methods
```typescript
async getFeeds(): Promise<Feed[]>
async createOrEditFeed(feed: Feed): Promise<boolean>
async deleteFeed(feed: Feed): Promise<boolean>
async getFeedContent(url: string): Promise<FeedData>
async importFeeds(data: string): Promise<boolean>
```

---

## Phase 4: Create Article Service (Day 2 - 2 hours)

### Goal
Handle article processing and content extraction

### What to Build
- **ArticleService class** for article content processing
- **Readability integration** for content extraction
- **Image processing logic** for lazy-loaded images
- **Dependency on NetworkService** for fetching HTML content

### Implementation Steps
1. **Create ArticleService.ts**: Import Readability and parseHTML from linkedom
2. **Move article logic**: Extract from `domain/getArticle.ts`
3. **Keep image processing**: Move `handleLazyImages` functionality
4. **Add constructor dependency**: Inject NetworkService for HTML fetching
5. **Test article extraction**: Verify content processing works correctly

### Key Methods
```typescript
async getArticle(url: string): Promise<Article>
private extractContent(html: string): Article
private handleLazyImages(content: string): string
```

---

## Phase 5: Update Providers (Day 3 - 3 hours)

### Goal
Refactor providers to use services instead of direct domain imports

### What to Change
- **FeedsProvider**: Replace domain imports with service instances
- **Service instantiation**: Use factory functions with dependency injection
- **Error handling**: Update error messages to reflect service layer
- **Same public API**: Maintain existing provider interface for components

### Implementation Steps
1. **Update imports**: Replace domain imports with service imports
2. **Create service instances**: Use useMemo with factory functions
3. **Update handler methods**: Call service methods instead of domain functions
4. **Maintain API**: Keep same function signatures for backward compatibility
5. **Test provider**: Ensure all existing functionality works
6. **Create service hooks**: Optional custom hooks for direct service access

### Key Changes
```typescript
// Before: import from domain
import { getFeeds, createOrEditFeed } from "@/domain/getFeeds";

// After: use services
const feedService = useMemo(() => createFeedService(storageService, networkService), []);
```

---

## Phase 6: Update Components (Day 3 - 2 hours)

### Goal
Update components to use services where needed

### What to Change
- **Import statements**: Update any direct domain imports to services
- **Component logic**: Use service hooks or provider methods
- **Type imports**: Ensure all types are still accessible
- **Existing functionality**: Verify no breaking changes

### Implementation Steps
1. **Search for domain imports**: Use `grep -r "from.*domain" app/ components/`
2. **Update article components**: Replace `getArticle` imports with `useArticleService`
3. **Update feed components**: Replace `getFeedContent` imports with `useFeedService`
4. **Fix import paths**: Update any remaining domain references
5. **Test components**: Verify all UI functionality works correctly

### Key Changes
```typescript
// Before
import { getArticle } from "@/domain/getArticle";

// After
import { useArticleService } from "@/hooks/useServices";
const articleService = useArticleService();
```

---

## Phase 7: Cleanup (Day 3 - 1 hour)

### Goal
Remove old domain files and update documentation

### What to Remove/Update
- **Domain files**: Delete `getFeeds.ts`, `getFeedContent.ts`, `getArticle.ts`
- **AGENTS.md**: Update project structure documentation
- **Unused imports**: Clean up any leftover references
- **Type definitions**: Ensure all types remain accessible

### Implementation Steps
1. **Remove domain files**: Delete the 3 main domain files
2. **Update AGENTS.md**: Add service layer to project structure section
3. **Run linter**: Execute `npm run lint` to find unused imports
4. **Fix remaining issues**: Address any type or import errors
5. **Final testing**: Run full test suite and manual testing
6. **Update documentation**: Reflect new architecture in README if needed

### Files to Delete
- `domain/getFeeds.ts` 
- `domain/getFeedContent.ts`
- `domain/getArticle.ts`

---

## Testing Strategy

### Unit Testing
Create tests for each service:

```typescript
// services/__tests__/StorageService.test.ts
// services/__tests__/NetworkService.test.ts
// services/__tests__/FeedService.test.ts
// services/__tests__/ArticleService.test.ts
```

### Integration Testing
Test provider functionality:

```typescript
// providers/__tests__/FeedsProvider.test.ts
```

### Manual Testing Checklist
- [ ] Can add new feeds
- [ ] Can edit existing feeds
- [ ] Can delete feeds
- [ ] Can import/export feeds
- [ ] Feed content loads correctly
- [ ] Article content loads correctly
- [ ] App works offline (cached data)

---

## Rollback Plan

If issues arise, rollback steps:

1. Revert to backup branch: `git checkout backup-before-service-migration`
2. Or revert specific commits: `git revert <commit-hash>`
3. Restore original domain files from git history

---

## Post-Migration Benefits

### Immediate Benefits
- ✅ Clear separation of concerns
- ✅ Improved testability
- ✅ Better error handling
- ✅ Consistent data access patterns

### Future Opportunities
- 🔄 Add caching layer
- 📡 Switch to different storage solutions
- 🧪 Easy A/B testing of different implementations
- 📊 Add metrics and logging
- 🔄 Add retry logic and better error recovery

---

## Troubleshooting

### Common Issues

**Import Path Errors**
```bash
# Add to tsconfig.json paths if needed
"@/services/*": ["services/*"]
```

**AsyncStorage Errors**
- Ensure `@react-native-async-storage/async-storage` is properly installed
- Check that services are properly instantiated

**Type Errors**
- Ensure all types are properly exported from `types/index.ts`
- Check that service interfaces match expected function signatures

**Runtime Errors**
- Check that service instances are created before use
- Verify that all dependencies are properly injected

### Debug Tools
```typescript
// Add to services for debugging
console.log("Service method called:", { args });
```

---

## Completion Checklist

- [ ] Phase 1: StorageService created and tested
- [ ] Phase 2: NetworkService created and tested  
- [ ] Phase 3: FeedService created and tested
- [ ] Phase 4: ArticleService created and tested
- [ ] Phase 5: FeedsProvider updated
- [ ] Phase 6: Components updated
- [ ] Phase 7: Cleanup completed
- [ ] All tests pass
- [ ] Manual testing completed
- [ ] AGENTS.md updated
- [ ] Documentation updated

**Final Step:** Merge feature branch to main after successful testing.
