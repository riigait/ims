import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Location } from '@/types/inventory';

const PAGE_SIZE = 20;

export function LocationSearchDropdown({
  locations,
  value,
  onChange,
  placeholder = '— No location —',
}: {
  locations: Location[];
  value: string;
  onChange: (locationId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = locations.find(l => l.id === value);

  const filtered = search.trim()
    ? locations.filter(l => l.name.toLowerCase().includes(search.trim().toLowerCase()))
    : locations;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setSearch('');
    setPage(1);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (locationId: string) => {
    onChange(locationId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-left flex items-center justify-between gap-1 hover:border-[var(--primary)] transition-colors"
      >
        <span className={selected ? 'text-[var(--text)] truncate' : 'text-[var(--text-muted)]'}>
          {selected ? selected.name : placeholder}
        </span>
        <Search size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded bg-[var(--surface-2)]">
              <Search size={13} className="text-[var(--text-muted)] flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search location…"
                className="flex-1 text-sm bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                  <X size={12} />
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1 px-1">
              {filtered.length} location{filtered.length !== 1 ? 's' : ''} found
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] transition-colors text-[var(--text-muted)] ${!value ? 'bg-[var(--surface-2)]' : ''}`}
            >
              — None —
            </button>
            {paginated.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">No locations match.</p>
            ) : (
              paginated.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => handleSelect(l.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] transition-colors text-[var(--text)] ${l.id === value ? 'bg-[var(--surface-2)] font-medium' : ''}`}
                >
                  {l.name}
                </button>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-[var(--text-muted)]">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
