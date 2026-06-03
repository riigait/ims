# Core project rules

- Follow existing naming conventions and file layout before introducing new abstractions.
- Do not scan the whole repository unless explicitly asked.
- Do not open unrelated files or dependency folders (node_modules, dist, build, .next, .git, logs, uploads).
- Prefer incremental changes — make the smallest safe change possible.
- Do not refactor working code without permission.
- Do not add new libraries without explaining: what it is, why it is needed, and what the alternative is.
- Do not run full test suites or full builds repeatedly.
- Fix one error at a time — read the exact error, find the file, fix only that.
- Never print or commit secrets (passwords, API keys, tokens, credentials).
- Use `.env` for sensitive values; only update `.env.example` with safe placeholders.
- After finishing a task, respond only with: Files checked, Files changed, What changed, How to test, Next step.
