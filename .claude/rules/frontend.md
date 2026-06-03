---
paths:
  - "frontend/src/**/*.ts"
  - "frontend/src/**/*.tsx"
---

# Frontend rules

- All API calls go through the shared axios instance in `frontend/src/services/api.ts`; never use raw `fetch` or a second axios instance.
- The `X-Department-Id` header is injected automatically by the axios interceptor; do not set it manually in page-level code.
- Page components live in `frontend/src/pages/`; reusable UI in `frontend/src/components/`.
- Shared types live in `frontend/src/types/`; do not redefine them inline.
- Use existing context providers (`ThemeContext`, `BellContext`) rather than adding new global state for the same concerns.
- Prefer small, focused components; avoid prop-drilling more than two levels — lift state or use context.
