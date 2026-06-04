# Skill: sonar-fix

Fix SonarQube issues reported for this project.

## Workflow

1. The user provides SonarQube issue details: file, line, rule, message.
2. Read only the affected file at the reported line ±10 lines for context.
3. Apply the minimal fix — do not refactor surrounding code.
4. Run `npx tsc --noEmit` in the relevant project root (backend or frontend) to confirm no type errors.
5. Commit the fix with a message in the form:
   `Fix <N> SonarQube <rule> issue(s) in <file>`
6. Push to the current branch.

## Common rules and fixes

| Rule | Description | Fix pattern |
|------|-------------|-------------|
| S3776 | Cognitive complexity > 15 | Extract nested blocks into named helper functions |
| S3358 | Nested ternary | Extract inner ternary to a `const` above the expression |
| S5852 | ReDoS-prone regex | Remove ambiguous quantifiers; exclude separator chars from character classes |
| S6523 | `window` global | Replace `window.X` with `globalThis.X` |
| S1940 | Negated condition | Flip condition and swap branches |
| S4632 | Unnecessary `!` assertion | Remove `!` when the surrounding guard already ensures non-null |
| S5689 | Express version header | Add `app.disable('x-powered-by')` after `express()` |
| S6606 | Prefer `??` | Replace `x !== undefined ? x : y` with `x ?? y` when safe |
| S6853 | Label not linked | Add matching `htmlFor` on `<label>` and `id` on the `<input>` |

## Scope rules
- Fix only the reported line(s).
- Do not open unrelated files.
- One commit per logical group of fixes (same file or same rule).
