---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.ts"
---

# Frontend rules

- Stack: React 18 + TypeScript + Vite + TailwindCSS.
- Use CSS variables (`var(--primary)`, `var(--bg)`, etc.) for theme colors — never hardcode hex.
- Table alignment standard: text/names = left, numbers = right, status/badges/actions = center.
- Header columns must mirror data row structure (same grid + spacer) to stay aligned with ChevronRight icon width.
- Navigation between pages uses `useNavigate` and `useLocation` (React Router v6).
- API calls go through `frontend/src/services/api.ts` — do not fetch directly.
- Role-based UI: check `user.role === 'admin'` for admin-only controls.
