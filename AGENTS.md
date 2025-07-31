# Noticioso Android - Agent Guidelines

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
- Components in `components/`, domain logic in `domain/`, providers in `providers/`

## Code Style
- TypeScript with strict mode enabled
- Named exports preferred over default exports for components
- Props destructured in function parameters with explicit types
- camelCase for variables/functions, PascalCase for components/types
- Import order: external libraries first, then local imports with `@/` or `~/`
- Use React hooks following hooks rules (useState, useEffect, custom hooks)
- Type definitions in `types/index.ts` with explicit type exports
- Async functions return `Promise<boolean | undefined>` for success/failure states
