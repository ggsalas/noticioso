# Noticioso Android - Agent Guidelines

## Git
- NEVER run git commands that modify state (no git add, git commit, git push, git rebase, git reset, git merge, nothing that changes history or index)
- Read-only git commands are allowed (git log, git diff, git show, git status, git branch)
- NEVER create commits or interact with git in any way that modifies the repo
- The user manages git exclusively

## Build/Test/Lint Commands
- `npm run lint` - Run Expo linter
- `npm test` - Run Jest tests in watch mode (single test: `npm test -- --testNamePattern="test name"`)
- `npm start` - Start Expo dev server
- `npm run android` - Start on Android device
- `npm run ios` - Start on iOS device

## Project Structure
- React Native Expo app with TypeScript
- Expo Router for navigation (`app/` directory)
- Path aliases: `@/*` and `~/*` point to project root
- Components in `components/`, services in `services/`, providers in `providers/`

## Service Layer Architecture
Services encapsulate all business logic and data access. Each service is a class with a singleton export:

```
services/
  StorageService.ts   -- AsyncStorage abstraction, receives AsyncStorage via constructor
  FeedService.ts      -- RSS fetch, XML parse, feed CRUD, receives StorageService via constructor
  ArticleService.ts   -- HTML fetch, Readability extraction, lazy image handling
```

- Dependencies are injected via constructor WITHOUT default values (e.g. `constructor(private storage: StorageService)`)
- The singleton export is used in the app (e.g. `feedService`) and passes all required dependencies explicitly
- Tests instantiate the class directly with mock dependencies instead of using `jest.mock()`
- IMPORTANT: Do NOT use default values in constructor parameters for classes with singleton exports - this can cause initialization order issues in JavaScript modules

## Code Style
- TypeScript with strict mode enabled
- Named exports preferred over default exports for components
- Props destructured in function parameters with explicit types
- camelCase for variables/functions, PascalCase for components/types
- Import order: external libraries first, then local imports with `@/` or `~/`
- Use React hooks following hooks rules (useState, useEffect, custom hooks)
- Type definitions in `types/index.ts` with explicit type exports
- Async functions return `Promise<boolean | undefined>` for success/failure states
