# Test Action

1. Read current-feature.md to understand what was implemented
2. Identify which project areas changed:
   - Backend: `server/`
   - Android: `client/android/`
   - Docs/data/tooling: `context/`, `docs/`, `data/`, `.agents/`, `.codex/`
3. Run the checks that match the changed scope:
   - Backend code changes: `cd server && npm.cmd run build`
   - Backend tests: only run `cd server && npm.cmd test` after real Vitest tests are configured. The current script is still a placeholder.
   - Android code changes: `cd client/android && .\gradlew.bat build`
   - Docs/agent-only changes: reread the changed Markdown/TOML files with UTF-8 and validate syntax where practical.
4. If a feature adds testable backend logic and Vitest is already configured, add focused unit tests:
   - Prefer services, mappers, parsers, prompt builders, vector/RAG helpers, auth helpers, and utilities.
   - Test happy path and error cases.
   - Do not write tests just to write them. Use your best judgment.
5. If Vitest is not configured yet, record that backend unit tests are unavailable and keep `npm.cmd run build` as the current backend gate.
6. Report exactly which checks ran, which passed, and which were skipped with reasons.
