---
name: list-components
description: List project components
argument-hint: [subdirectory]
---

## Task

List ShopMate project components and modules.

If a [subdirectory] is provided via $ARGUMENTS, only list files in that subdirectory.

Default scan targets:

- Android Compose screens/components/models under `client/android/app/src/main/java/`
- Android resources under `client/android/app/src/main/res/`
- Backend Express modules under `server/src/modules/`
- Shared backend utilities/types under `server/src/lib/`, `server/src/types/`, and `server/src/scripts/`

Useful scopes:

- `android` or `compose`: list Kotlin UI screens/components/models.
- `resources`: list drawable and values resources.
- `server` or `backend`: list Express modules, routes, controllers, services, repositories, and types.
- `data`: list catalog/data pipeline scripts and processed catalog artifacts.
- `agents`: list `.codex/agents` and `.agents/skills` entries.

## Output Format

- Numbered list of files with relative paths
- Brief one-line description of each (infer from filename)
- Summary count at the end

If no files found, say "No matching ShopMate components or modules found."
