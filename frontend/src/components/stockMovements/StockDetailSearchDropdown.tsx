import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface StockDetailItem {
  id: string;
  stockId: string;
  productId?: string;
  currentStatus: string;
  currentLocationId?: string;
  product?: { name: string };
  currentLocation?: { name: string };
  assetTag?: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-green-600', damaged: 'text-orange-500', sold: 'text-gray-400',
  lost: 'text-red-500', borrowed: 'text-violet-500', disposed: 'text-gray-500',
  repair: 'text-yellow-600', deployed: 'text-cyan-600', returned: 'text-teal-600',
};

export function StockDetailSearchDropdown({
  stockDetails,
  value,
  onChange,
  excludeIds = [],
}: {
  stockDetails: StockDetailItem[];
  value: string;
  onChange: (stockDetailId: string, locationId?: string) => void;
  excludeIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = stockDetails.find(s => s.id === value);
  const available = stockDetails.filter(s => s.id === value || !excludeIds.includes(s.id));

  const filtered = search.trim()
    ? available.filter(s =>
        s.stockId.toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.assetTag || '').toLowerCase().includes(search.trim().toLowerCase()) ||
        (s.currentLocation?.name || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : available;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize]);

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

  const handleSelect = (id: string) => {
    const sd = stockDetails.find(s => s.id === id);
    onChange(id, sd?.currentLocationId);
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
        {selected ? (
          <span className="text-[var(--text)] truncate font-mono text-xs">
            {selected.stockId}{selected.assetTag ? ` · ${selected.assetTag}` : ''}{selected.currentLocation ? ` · ${selected.currentLocation.name}` : ''}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Select inventory item</span>
        )}
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
                placeholder="Search by item ID, asset tag, location…"
                className="flex-1 text-sm bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <p className="text-xs text-[var(--text-muted)]">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--text-muted)]">Show</span>
                {[20, 50, 100].map(s => (
                  <button key={s} type="button"
                    onClick={() => setPageSize(s)}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${pageSize === s ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {paginated.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">No active items found.</p>
            ) : (
              paginated.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between gap-2 ${s.id === value ? 'bg-[var(--surface-2)] font-medium' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[var(--text)] truncate">{s.stockId}{s.assetTag ? ` · ${s.assetTag}` : ''}</p>
                    {s.currentLocation && (
                      <p className="text-xs text-[var(--text-muted)] truncate">{s.currentLocation.name}</p>
                    )}
                  </div>
                  <span className={`text-xs flex-shrink-0 ${STATUS_COLOR[s.currentStatus] ?? 'text-[var(--text-muted)]'}`}>
                    {s.currentStatus}
                  </span>
                </button>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-[var(--text-muted)]">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
