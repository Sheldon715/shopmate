---
name: research
description: Run a research task to generate documentation
argument-hint: <prompt-name>
---

## Task

Execute research task: $ARGUMENTS

---

### Instructions

1. If no argument provided, error: "Usage: /research <prompt-name>"
2. Look for prompt file at `context/research/{$ARGUMENTS}.md`
3. If not found, error: "Prompt file not found at context/research/{$ARGUMENTS}.md"
4. Read the prompt file which should contain:
   - **Output**: Where to write results (e.g., `context/content-types.md`)
   - **Research**: What to investigate
   - **Include**: Specific details to capture
   - **Sources**: What files/tools to use
5. Execute the research using appropriate tools:
   - Read active context docs, backend TypeScript modules, Android Kotlin files, data scripts, and processed artifacts
   - Use PostgreSQL / Qdrant code paths or local scripts as the source of truth when database or vector behavior matters
   - Search the codebase for patterns before making claims
6. Write findings to the specified output location
7. Summarize what was discovered

---

### Rules

- This command produces DOCUMENTATION only
- Do NOT modify source code files
- Do NOT create branches or commits
- Active planning output should stay under `context/` unless the prompt explicitly asks for a public handoff doc
- Long-form research reports may go under `docs/` only when the prompt names that output path
- Use subagents for thorough exploration if needed
