import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sub?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  emptyLabel = '— None —',
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.sub?.toLowerCase().includes(search.toLowerCase()))
    : options;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when search or pageSize changes
  useEffect(() => { setPage(1); }, [search, pageSize]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
    setPage(1);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] text-left flex items-center justify-between gap-2 disabled:opacity-50"
      >
        <span className={`truncate ${selectedOption ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
          {selectedOption ? selectedOption.label : emptyLabel}
          {selectedOption?.sub && <span className="text-[var(--text-muted)] ml-1 text-xs">({selectedOption.sub})</span>}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && !disabled && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); handleSelect(''); }}
              className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-[100] left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col"
          style={{ maxHeight: 300 }}>

          {/* Search bar */}
          <div className="p-2 border-b border-[var(--border)] flex-shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-6 pr-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {/* Empty / none option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-1.5 text-xs border-b border-[var(--border)] ${
                !value ? 'bg-[var(--surface-2)] font-semibold text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {emptyLabel}
            </button>

            {paginated.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-[var(--text-muted)]">No results found</div>
            ) : (
              paginated.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 ${
                    o.value === value
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.sub && (
                    <span className={`text-[10px] flex-shrink-0 ${o.value === value ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                      {o.sub}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer: pagination + page size */}
          <div className="border-t border-[var(--border)] px-2 py-1.5 flex items-center justify-between gap-2 flex-shrink-0 bg-[var(--surface-2)] rounded-b-lg">
            {/* Pagination */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-1.5 py-0.5 text-xs rounded border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface)] text-[var(--text)]"
              >
                ‹
              </button>
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-1.5 py-0.5 text-xs rounded border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--surface)] text-[var(--text)]"
              >
                ›
              </button>
            </div>

            {/* Page size */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-muted)]">per page</span>
              {[20, 50, 100].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPageSize(n)}
                  className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    pageSize === n
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Match count */}
          <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] text-center border-t border-[var(--border)]">
            {filtered.length} of {options.length} location{options.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
