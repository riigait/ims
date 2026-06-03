---
description: Run the IMS release verification checklist. Use for staging-to-main merges, hotfix releases, or final pre-deploy review.
---

## Inputs

- Branch or PR number to review

## Checklist

1. Confirm all feature work is committed to staging.
2. Check for any pending Prisma migrations that need to run.
3. Confirm `.env.example` is up to date with any new env vars.
4. Confirm no secrets are hardcoded in changed files.
5. Summarize any breaking changes or manual steps needed after deploy.
6. Confirm frontend builds without errors (`npm run build` in `/frontend`).
7. List any open issues or known bugs that should be noted in the release.


# IMS Frontend Design Standard

**Template page:** `frontend/src/pages/InventoryItems.tsx`
Every new page must match this layout exactly — same structure, same tokens, same spacing, same component patterns.

---

## 1. Page Shell

```tsx
<div className="p-6">
  {/* Header */}
  {/* Filters */}
  {/* Table */}
  {/* Pagination */}
  {/* Side Drawer */}
</div>
```

---

## 2. Page Header

```tsx
<div className="mb-6">
  <h1 className="text-3xl font-bold text-[var(--text)]">Page Title</h1>
  <p className="text-sm text-[var(--text-muted)] mt-2">
    {total} total · <span className="text-green-600">{activeCount} active</span>
  </p>
  <p className="text-xs text-[var(--text-muted)] mt-1">
    Short description of what this page shows.
  </p>
</div>
```

---

## 3. Filter Bar

Three rows in order:

**Row 1 — Search + Sort + Clear:**
```tsx
<div className="flex gap-2">
  <input type="text" placeholder="Search…"
    className="flex-1 px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
  <select className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
    <option>Sort: Recently Added</option>
  </select>
  <button className="px-3 py-2 text-xs border border-[var(--border)] rounded hover:bg-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] font-medium whitespace-nowrap">
    Clear
  </button>
</div>
```

**Row 2 — Main filters (3-column grid):**
```tsx
<div className="grid grid-cols-3 gap-2">
  <select className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
    <option value="">All Categories</option>
  </select>
  {/* ... */}
</div>
```

**Row 3 — Advanced filters toggle + collapsed panel:**
```tsx
<button className="text-xs text-[var(--primary)] hover:underline text-left font-medium w-fit">
  ▼ Advanced Filters
</button>
{showAdvanced && (
  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]">
    {/* additional selects */}
  </div>
)}
```

---

## 4. Table

### Corporate format rules
- All column headers: **left-aligned** (no `text-center`)
- Header row text: `text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide`
- Table uses CSS grid columns matching the number of data columns

### Empty state
```tsx
<div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
  <p className="text-[var(--text-muted)]">No items found.</p>
</div>
```

### Table wrapper
```tsx
<div className="border border-[var(--border)] rounded-lg overflow-hidden">
  {/* Header row */}
  <div className="hidden md:grid grid-cols-N gap-4 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
    <div>Column One</div>
    <div>Column Two</div>
    {/* ... all left-aligned by default */}
  </div>

  {/* Data rows */}
  {paginated.map(item => (
    <div
      key={item.id}
      onClick={() => openDrawer(item)}
      className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
    >
      <div className="flex-1 grid grid-cols-N gap-4 text-sm min-w-0">
        <div className="font-medium text-[var(--text)] truncate">{item.field}</div>
        {/* ... */}
      </div>
      <ChevronRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
    </div>
  ))}
</div>
```

### Status badges (inline in table rows)
```tsx
<span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[item.status]}`}>
  {STATUS_LABELS[item.status]}
</span>
```

---

## 5. Pagination

```tsx
<div className="mt-4">
  <Pagination
    currentPage={currentPage}
    totalItems={filtered.length}
    pageSize={pageSize}
    onPageChange={setCurrentPage}
    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
  />
</div>
```

---

## 6. Side Drawer

The drawer has **three fixed zones**:
1. **Header** — always visible, `flex-shrink-0`
2. **Body** — `flex-1 overflow-y-auto` (scrollable content)
3. **Footer** — always visible, `flex-shrink-0`

```tsx
{drawerItem && (
  <div className="fixed inset-0 z-50 flex">
    {/* Backdrop */}
    <div className="flex-1 bg-black/30" onClick={closeDrawer} />

    {/* Panel */}
    <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

      {/* ZONE 1: Header — fixed */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)] truncate">{drawerItem.name}</h2>
          <p className="text-sm text-[var(--text-muted)]">{drawerItem.subtitle}</p>
        </div>
        <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
          <X size={18} />
        </button>
      </div>

      {/* ZONE 2: Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {editingItem ? (
          <EditForm /> {/* see Section 7 */}
        ) : (
          <ViewContent /> {/* see Section 8 */}
        )}
      </div>

      {/* ZONE 3: Footer — fixed */}
      <div className="px-6 py-4 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
        {/* View mode: action buttons */}
        {/* Edit mode: Save + Cancel — see Section 7 */}
      </div>

    </div>
  </div>
)}
```

---

## 7. Edit Form Inside Drawer

The edit form lives in **Zone 2 (Body)** of the drawer.
**Save and Cancel buttons always go in Zone 3 (Footer) — they are fixed, never scroll away.**

```tsx
{/* Zone 2 Body: form fields only, no submit buttons here */}
<form id="edit-form" onSubmit={handleSubmit} className="space-y-5">
  <div>
    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Section Name</h4>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Field Label</label>
        <input type="text"
          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
      </div>
    </div>
  </div>
  {formError && <p className="text-red-500 text-sm">{formError}</p>}
</form>

{/* Zone 3 Footer: Save + Cancel — always fixed */}
<div className="px-6 py-4 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
  {editingItem ? (
    <>
      <button type="submit" form="edit-form"
        className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
        Save
      </button>
      <button type="button" onClick={() => setEditingItem(null)}
        className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
        Cancel
      </button>
    </>
  ) : (
    <>
      <button onClick={() => openEdit(drawerItem)}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
        <Edit size={14} /> Edit
      </button>
    </>
  )}
</div>
```

**Rule:** Use `form="edit-form"` on the submit button so it works from outside the `<form>` tag.

---

## 8. View Content in Drawer (Read-only mode)

Use sections with a `<Field>` display component:

```tsx
function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm text-[var(--text)] font-medium">{value || '—'}</p>
    </div>
  );
}
```

Section layout:
```tsx
<section>
  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Section Title</h3>
  <div className="grid grid-cols-2 gap-3">
    <Field label="Label" value={drawerItem.field} />
    <Field label="Label" value={drawerItem.field} />
  </div>
</section>
```

---

## 9. CSS Design Tokens (always use these — no hardcoded colors)

| Token | Purpose |
|---|---|
| `var(--text)` | Primary text |
| `var(--text-muted)` | Secondary / label text |
| `var(--surface)` | Card / panel background |
| `var(--surface-2)` | Hover / alternate row background |
| `var(--border)` | All borders |
| `var(--primary)` | Brand color — buttons, active state |
| `var(--primary-hover)` | Hover for primary buttons |

---

## 10. Loading State

```tsx
if (loading) return (
  <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
);
```

---

## 11. Quick Checklist for Every New Page

- [ ] Page wrapped in `<div className="p-6">`
- [ ] Header: `text-3xl font-bold` title + `text-sm text-[var(--text-muted)]` subtitle
- [ ] Filters: Search + Sort + Clear in one row, main filters in 3-col grid
- [ ] Table: `border border-[var(--border)] rounded-lg overflow-hidden`
- [ ] Table column headers: left-aligned, `uppercase tracking-wide text-xs font-semibold text-[var(--text-muted)]`
- [ ] Table rows: `ChevronRight` on the right, clickable → opens drawer
- [ ] Empty state: centered message inside surface+border box
- [ ] Pagination at bottom using `<Pagination>` component
- [ ] Drawer: 3-zone layout (fixed header / scrollable body / fixed footer)
- [ ] Edit mode: form fields in body, **Save + Cancel in fixed footer only**
- [ ] All colors use CSS tokens, no hardcoded Tailwind color classes except status badges


# VS Code Extensions

List of all installed extensions. Useful for diagnosing issues and knowing what tools are available.

---

## AI & Copilot

| Extension | ID | Version |
| --- | --- | --- |
| Claude Code | anthropic.claude-code | 2.1.159 |
| ChatGPT | openai.chatgpt | 26.527.x |

---

## Git & GitHub

| Extension | ID | Version |
| --- | --- | --- |
| Git History | donjayamanne.githistory | 0.6.20 |
| GitZip | exilecode.gitzip | 2.3.0 |
| GitHub Actions | github.vscode-github-actions | 0.31.5 |
| GitHub CLI UI | nickcernis.github-cli-ui | 0.4.0 |

---

## Python

| Extension | ID | Version |
| --- | --- | --- |
| Python | ms-python.python | 2026.4.0 |
| Pylance | ms-python.vscode-pylance | 2026.2.1 |
| Debugpy | ms-python.debugpy | 2026.6.0 |
| Python Envs | ms-python.vscode-python-envs | 1.30.0 |

---

## Remote & Containers

| Extension | ID | Version |
| --- | --- | --- |
| Remote Explorer | ms-vscode.remote-explorer | 0.5.0 |
| Remote - SSH | ms-vscode-remote.remote-ssh | 0.123.0 |
| Remote - SSH Edit | ms-vscode-remote.remote-ssh-edit | 0.87.0 |
| Remote - Containers | ms-vscode-remote.remote-containers | 0.459.0 |
| Docker | ms-azuretools.vscode-docker | 2.0.0 |
| Containers | ms-azuretools.vscode-containers | 2.4.5 |

---

## Data & Files

| Extension | ID | Version |
| --- | --- | --- |
| Rainbow CSV | mechatroner.rainbow-csv | 3.24.1 |
| Excel Viewer | grapecity.gc-excelviewer | 4.2.65 |

---

## Utilities

| Extension | ID | Version |
| --- | --- | --- |
| npm Intellisense | christian-kohler.npm-intellisense | 1.4.5 |
| Markdown Lint | davidanson.vscode-markdownlint | 0.61.2 |
| PowerShell | ms-vscode.powershell | 2025.4.0 |

---

## Notes for Debugging

- **Claude Code** — available for AI-assisted fixes directly in editor
- **Git History / GitZip** — useful for checking file history when tracking regressions
- **Docker / Remote Containers** — if app is containerized, check container status first
- **Python + Pylance** — static type errors will show inline; check Problems panel before running
- **Rainbow CSV** — if data files are involved in a bug, open them here for quick inspection
- **PowerShell** — integrated terminal defaults to PowerShell; use it for `npm`, `git`, `node` commands
