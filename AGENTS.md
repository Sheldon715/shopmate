# Repository Guidelines

## Project Structure & Module Organization
This repository is documentation-first. Active docs are in `context/`:

- `context/project-overview.md`: product scope, architecture, and recommended repo layout
- `context/coding-standards.md`: backend, Android, API, database, and testing rules
- `context/ai-interaction.md`: workflow, branch, commit, and review rules
- `context/current-feature.md`: active feature tracker

## Context Files

Read the following to get the full context of the project:

- @context/project-overview.md
- @context/coding-standards.md
- @context/ai-interaction.md
- @context/current-feature.md

The design docs describe a future `docs/` folder, but this checkout uses `context/`. Planned source layout is:

- `client/android/` for the Android app
- `server/` for the Node.js + TypeScript + Express backend
- `data/raw/` and `data/processed/` for product data
- `.agents/skills/` for workflows such as `feature` and `research`

## Build, Test, and Development Commands
There is no runnable app scaffold yet. Once the planned modules exist, use:

- `cd server && npm run lint` to check backend style
- `cd server && npm run build` to compile TypeScript
- `cd server && npm test` to run Vitest
- `cd client/android && gradlew.bat build` to build Android on Windows

If a module is missing, record that in `context/current-feature.md` instead of inventing a passing check.

## Coding Style & Naming Conventions
Follow `context/coding-standards.md` as the default authority. Key rules:

- TypeScript runs in `strict` mode; avoid `any`
- Organize backend code by feature module under `server/src/modules/`
- Use names like `product.service.ts`, `searchProducts`, and `ProductService`
- Kotlin uses `PascalCase` for screens/classes (`ChatScreen.kt`) and `camelCase` for functions
- Database objects use `snake_case` plural tables such as `cart_items`
- Keep controllers thin; business logic belongs in services
- Use branch names such as `feature/chat-streaming` or `fix/sse-disconnect`

## Testing Guidelines
Backend tests use Vitest and live beside the implementation as `*.test.ts`. Prioritize services, utilities, RAG helpers, vector search wrappers, auth helpers, and parsers. For Android, use `gradlew.bat build`; add tests for ViewModels, repositories, and API clients before UI automation.

## Commit & Pull Request Guidelines
Git history is minimal and currently starts with `Initial commit`, so follow the documented standard: use Conventional Commits such as `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, and `chore:`. Before opening a PR, update `context/current-feature.md`, finish the checklist, and record any commands you could not run. Keep PRs scoped to one feature, include test/build status, and attach screenshots for UI work.

## Agent-Specific Workflow
Treat `context/current-feature.md` as required. Document the feature first, implement only the tracked scope, run the relevant checks, and do not commit or merge without explicit user approval. Prefer `.agents/skills/feature` for feature flow and `.agents/skills/research` for documentation-only analysis.
