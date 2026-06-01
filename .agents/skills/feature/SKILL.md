---
name: feature
description: Manage current feature workflow - start, review, explain or complete
argument-hint: load|start|review|explain|complete|test
---

# Feature Workflow

Manages the ShopMate feature lifecycle from tracker load to implementation,
review, and completion.

## Working File

@context/current-feature.md

### File Structure

`context/current-feature.md` is the source of truth and uses Chinese section
headings:

- `# Current Feature: <feature name>` - H1 heading with feature name when active
- `## 状态` - Not Started | In Progress | Complete
- `## 目标` - bullet points of what success looks like
- `## 待办清单` - actionable checklist for implementation and verification
- `## 备注` - spec source, constraints, behavior boundaries, and verification plan
- `## 历史记录` - completed features, append only

## Task

Execute the requested action: $ARGUMENTS

| Action | Description |
|--------|-------------|
| `load` | Load a feature spec or inline description into the Chinese tracker |
| `start` | Begin implementation and create / switch to a feature branch |
| `review` | Check the focused diff against tracker goals |
| `explain` | Document what changed and why |
| `complete` | Prepare narrow staging, commit / merge / push only with explicit user approval, then leave the tracker reset local |
| `test` | Check for testable logic for server actions and utilities |

See [actions/](actions/) for detailed instructions.

If no action provided, explain the available options.
