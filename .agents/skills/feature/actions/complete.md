# Complete Action

1. Read `context/current-feature.md` with UTF-8 and confirm the checklist, notes, and verification results are current.
2. Review `git status --short` and stage narrowly:
   - Stage only files that belong to the tracked feature.
   - Do not stage unrelated dirty files.
   - Do not stage `docs/` unless the user explicitly asks for documentation changes.
   - Do not stage generated or local config files unless they are explicitly part of the feature.
3. Run `git diff --cached --check` before committing.
4. Commit, merge, push, or delete branches only after explicit user approval in the current request.
   - Use a concise Conventional Commit message, defaulting to Chinese body text for this repo.
   - If approval is missing, stop after reporting the prepared staging/verification plan.
5. After the feature commit / merge / push is complete, reset `context/current-feature.md` locally:
   - Change H1 back to `# Current Feature`.
   - Set `## 状态` back to `Not Started`.
   - Clear `## 目标`, `## 待办清单`, and `## 备注` back to placeholders.
   - Add the feature summary to the END of `## 历史记录`.
6. Leave the tracker reset local by default. Do not commit the reset unless the user explicitly asks for it.
