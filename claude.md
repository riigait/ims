# CLAUDE.md

## Main Goal

Minimize Claude Code token and credit usage.

Keep the working context small.

Do not over-explore, over-test, or overbuild.

---

## Core Rules

Claude must NOT:

1. Scan the whole repository unless I explicitly ask.
2. Open unrelated files.
3. Read dependency folders.
4. Read large files unless needed.
5. Run full tests repeatedly.
6. Run full builds repeatedly.
7. Refactor working code without permission.
8. Rewrite large files unnecessarily.
9. Add new libraries without explaining why.
10. Create extra files unless needed.
11. Change project structure without permission.
12. Use trial-and-error fixes across many files.
13. Print or expose secrets.
14. Commit changes automatically.
15. Delete files without approval.
16. Show code previews or before/after comparisons when editing.
17. Print full file contents after making changes.
18. Show diffs or code blocks just to confirm what was changed — describe it in words instead.

---

## Ignore These Folders

Do not inspect these unless I specifically ask:

- node_modules
- dist
- build
- .next
- .nuxt
- coverage
- .git
- logs
- uploads
- temp
- cache
- venv
- .venv
- vendor
- public/assets
- generated files
- media files
- zip files

---

## Project Context File

Project-specific instructions should be placed in:

```
PROJECT_CONTEXT.md
```

Do not read `PROJECT_CONTEXT.md` automatically unless:

- I ask you to read it.
- The current task needs project-specific rules.
- You are unsure about the project direction.

Keep `CLAUDE.md` focused on Claude Code usage rules only.

---

## Workflow For Every Task

Before editing, Claude must briefly say:

- What was found
- Which files need to be inspected
- What will be changed
- What will not be touched

Then follow this process:

1. Understand the task.
2. Inspect only the smallest number of files needed.
3. Make the smallest safe change.
4. Do not touch unrelated code.
5. Test only the affected area.
6. Stop after the change and summarize briefly.

---

## Search Rules

When searching code:

- Use targeted search terms.
- Search only likely folders.
- Do not open every search result.
- Stop once the correct file is found.
- Do not search dependency or generated folders.

Avoid broad commands like:

```
find .
ls -R
cat large-file
```

Prefer targeted commands like:

```
grep -n "keyword" file
sed -n '1,120p' file
```

---

## Testing Rules

Do not test many things automatically.

Before running tests, explain what test will be run and why.

Prefer:

- Run the smallest related test.
- Check only the affected page or function.
- Fix one error at a time.
- Stop if the error is unclear and ask.

Avoid:

- Full test suite repeatedly
- Full build repeatedly
- Repeated install commands
- Random trial-and-error fixes

---

## Terminal Output Rules

Avoid commands that produce huge output.

If command output is long, summarize only the important error lines.

Do not paste unnecessary logs.

---

## Model Usage Rule

Use the cheapest and fastest model available for normal coding.

Use Haiku if available.

Use Sonnet or Opus only for:

- Complex debugging
- Architecture decisions
- Major design planning
- Difficult multi-file reasoning

If Claude wants to use Sonnet or Opus, explain why first.

---

## Claude Code Commands

Check current usage:

```
/usage
```

After finishing a clear phase but continuing the same topic:

```
/compact
```

Keep only: current task goal, files changed, important decisions, errors fixed, and next step.

When switching to a different task:

```
/clear
```

Recommended starting prompt:

```
/clear
Read CLAUDE.md first and follow it strictly.
Do not scan the whole repository.
Do not run full tests.
First tell me the smallest set of files you need to inspect.
```

---

## Dependency Rules

Do not install packages unless necessary.

Before adding a package, explain:

- **Package:** name
- **Reason:** why it is needed
- **Alternative without package:** what can be done instead
- **Why package is better:** clear justification

Prefer existing project libraries first.

---

## Error Fixing Rule

When fixing errors:

- Read the exact error.
- Identify the file causing it.
- Fix only the related issue.
- Do not guess and change many files.
- Stop after one fix and explain the result.

Avoid trial-and-error coding.

---

## Security Rule

Never print, edit, or commit secrets such as:

- Passwords
- API keys
- Tokens
- Database credentials
- Private keys
- Private URLs

Use `.env` for sensitive values.

Only update `.env.example` with safe placeholders.

---

## Final Response Format

After finishing a task, respond only with:

```
Files checked:
- file/path

Files changed:
- file/path

What changed:
- short explanation

How to test:
- simple command or manual step

Next step:
- one recommended next step only
```

---

## Final Reminder

Build small.

Search small.

Test small.

Explain short.

Do not overbuild.

Ask first before large changes.
