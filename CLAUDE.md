# CLAUDE.md

**Quick-start guide for Claude Code - Complete details in linked docs**

---

## Project Overview

Express, React, Vite, Prisma for Multi-department inventory tracking with role-based access, approval workflows, floor plan editor, CSV import/export, and barcode scanning

**Tech Stack**: Express, PostgreSQL, Prisma, TypeScript, Tailwind CSS

---

## Session Start Protocol ⚡

**MANDATORY** at start of each session:

```bash
# Load essential docs (~800 tokens - 2 min read)
✓ .claude/COMMON_MISTAKES.md      # ⚠️ CRITICAL - Read FIRST
✓ .claude/QUICK_START.md          # Essential commands
✓ .claude/ARCHITECTURE_MAP.md     # File locations
```

**At task completion:**
- Create completion doc in `.claude/completions/YYYY-MM-DD-task-name.md`
- Move session file to `.claude/sessions/archive/` (if created)

**⚠️ NEVER auto-load:**
- Files in `.claude/completions/` (0 token cost)
- Files in `.claude/sessions/` (0 token cost)
- Files in `docs/archive/` (0 token cost)

---

## Quick Start Commands

```bash
# Add your common commands here
```

---

## Context / Compact Rule

Claude Code auto-compact is controlled via settings.json:

- `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` — standard context target is 200K tokens
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75` — auto-compact triggers at ~75% usage (~150K tokens used), leaving ~50K safety space

Rules:
- Do not claim the default auto-compact percentage is known unless verified from docs.
- Manual `/compact` is not percentage-based — it compresses the full history.
- Automatic compact can be percentage-controlled via `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.
- Before long coding work, check context with `/status`.
- When context is high, compact with a focused summary preserving: current goal, files changed, bugs found, decisions made, test results, pending TODOs.

**Recommended threshold: 75%** (not 50% — compacting at 100K is too early for long IMS sessions).

---

## No Question Rule

Never stop work to ask preference or clarification questions.

Do not use AskUserQuestion.

If information is missing:
- Make the safest reasonable assumption.
- Continue implementation.
- Document the assumption in the final summary.

Do not ask:
- "Should I proceed?"
- "Which option do you prefer?"
- "Do you want me to continue?"
- "Should I implement this?"

For IMS:
- Prefer backend/data-driven logic.
- Preserve existing behavior unless broken.
- Fix bugs directly.
- Run TypeScript check after edits.
- Summarize files changed, what changed, and any assumptions.

---

**Last Updated**: 2026-06-15
**Optimized with**: [Claude Token Optimizer](https://github.com/nadimtuhin/claude-token-optimizer)
