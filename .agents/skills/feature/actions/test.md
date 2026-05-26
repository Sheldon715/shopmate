# Test Action

1. Read current-feature.md to understand what was implemented
2. Identify which project areas changed:
   - Backend: `server/`
   - Android: `client/android/`
   - Docs/data/tooling: `context/`, `docs/`, `data/`, `.agents/`, `.codex/`
3. Run the checks that match the changed scope:
   - Backend code changes: `cd server && npm.cmd run build`
   - Backend tests: if Vitest is configured, run `cd server && npm.cmd test` after the backend build.
   - Android code changes: `cd client/android && .\gradlew.bat build`
   - Docs/agent-only changes: reread the changed Markdown/TOML files with UTF-8 and validate syntax where practical. Docs-only changes do not require Vitest.
4. If a feature adds testable backend logic and Vitest is already configured, add focused unit tests:
   - Prefer services, mappers, parsers, prompt builders, vector/RAG helpers, auth helpers, and utilities.
   - Test happy path and error cases.
   - Do not write tests just to write them. Use your best judgment.
5. If a check fails, record the failing command and the key error. Do not report a failed or skipped check as passing.
6. Report exactly which checks ran, which passed, and which were skipped with reasons.
