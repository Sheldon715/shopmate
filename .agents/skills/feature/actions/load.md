# Load Action

1. Check $ARGUMENTS (after "load"):
   - If it looks like a filename (single word, no spaces): Look for `context/feature/{name}.md`
   - If it is multiple words: use it as an inline feature description and generate goals
   - If empty: Error - "load" requires a spec filename or feature description

2. Update current-feature.md:
   - Update H1 heading to include feature name (e.g., `# Current Feature: Add Navbar`)
   - Set `## 状态` to `Not Started`
   - Write goals as bullet points under `## 目标`
   - Write implementation and verification checklist items under `## 待办清单`
   - Write spec source, constraints, behavior boundaries, and verification plan under `## 备注`
   - Keep `## 历史记录` append-only and do not rewrite old entries

3. Confirm spec loaded and show the feature summary
