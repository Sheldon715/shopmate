# Start Action

1. Read `context/current-feature.md` with UTF-8 and verify `## 目标` and `## 待办清单` are populated.
2. If empty, error: "Run /feature load first".
3. Set `## 状态` to `In Progress`.
4. Create and checkout the feature branch, deriving a kebab-case name from the H1 heading.
5. If the worktree is already dirty, preserve unrelated changes and continue only with the tracked scope.
6. List the goals, then implement them one by one.
