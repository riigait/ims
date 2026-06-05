import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export function FilterDropdown({
  label, value, onChange,
  options,
  pageSizeOptions = [20, 50, 100],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  pageSizeOptions?: number[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedLabel = value ? (options.find(o => o.id === value)?.name ?? label) : label;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded text-sm bg-[var(--surface)] text-[var(--text)] ${value ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}>
        <span className={`truncate ${value ? 'text-[var(--primary)] font-medium' : 'text-[var(--text-muted)]'}`}>{selectedLabel}</span>
        <ChevronDown size={14} className="flex-shrink-0 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-1 left-0 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg flex flex-col">
          <div className="p-2 border-b border-[var(--border)]">
            <input autoFocus type="text" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search…"
              className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]" />
          </div>
          <ul className="overflow-y-auto max-h-48">
            <li>
              <button type="button" onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${!value ? 'font-semibold text-[var(--primary)]' : 'text-[var(--text-muted)]'}`}>
                All
              </button>
            </li>
            {paginated.map(o => (
              <li key={o.id}>
                <button type="button" onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${value === o.id ? 'font-semibold text-[var(--primary)]' : 'text-[var(--text)]'}`}>
                  {o.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--text-muted)]">No results</li>
            )}
          </ul>
          {filtered.length > pageSize && (
            <div className="p-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-2 py-0.5 text-xs border border-[var(--border)] rounded disabled:opacity-40">‹</button>
                <span className="text-xs text-[var(--text-muted)] px-1 self-center">{page}/{totalPages}</span>
                <button type="button" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-2 py-0.5 text-xs border border-[var(--border)] rounded disabled:opacity-40">›</button>
              </div>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="text-xs px-1 py-0.5 border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
