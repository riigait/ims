# Core project rules

- Follow existing naming conventions and file layout before introducing new abstractions.
- Prefer incremental changes; suggest a test or verification step with every edit.
- Never commit `.env`, credentials, or secrets; use `.env.example` with safe placeholders.
- Flag risky migrations, schema changes, and auth-middleware changes before proceeding.
- All new protected API routes must use `authMiddleware` plus the appropriate department-scope guard.
- Record stable new conventions in a reviewed recommendation entry, not only in chat.
