import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Trash2, Search, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { stockMovementsApi, productsApi, locationsApi, departmentsApi, stockDetailsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { StockMovementFilter } from '@/types/filters';
import { FloorPlan, FloorPlanObject } from '@/types/floorplan';
import { formatDate } from '@/utils/ids';
import { filterStockMovements, sortStockMovements } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import StockDetails from '@/components/StockDetails';
import DeploymentMapPicker from '@/components/maps/DeploymentMapPicker';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

interface Department {
  id: string;
  name: string;
}

const MOVEMENT_OPTIONS: { value: MovementType; label: string; color: string }[] = [
  { value: 'stock_in',            label: 'Stock In',              color: 'bg-green-100 text-green-800' },
  { value: 'stock_out',           label: 'Stock Out',             color: 'bg-red-100 text-red-800' },
  { value: 'adjustment',          label: 'Adjustment',            color: 'bg-blue-100 text-blue-800' },
  { value: 'borrowed',            label: 'Borrowed',              color: 'bg-violet-100 text-violet-800' },
  { value: 'returned',            label: 'Returned',              color: 'bg-teal-100 text-teal-800' },
  { value: 'lost',                label: 'Lost',                  color: 'bg-rose-100 text-rose-800' },
  { value: 'found',               label: 'Found',                 color: 'bg-white text-gray-800' },
  { value: 'transfer',            label: 'Transfer to Location',  color: 'bg-purple-100 text-purple-800' },
  { value: 'moved_to_department', label: 'Transfer to Department',color: 'bg-sky-100 text-sky-800' },
  { value: 'pre_deployment',      label: 'Pre Deployment',        color: 'bg-cyan-100 text-cyan-800' },
  { value: 'post_deployment',     label: 'Post Deployment',       color: 'bg-emerald-100 text-emerald-800' },
  { value: 'repair_out',          label: 'Repair Out',            color: 'bg-yellow-100 text-yellow-800' },
  { value: 'repair_return',       label: 'Repair Return',         color: 'bg-lime-100 text-lime-800' },
  { value: 'damaged',             label: 'Damaged',               color: 'bg-orange-100 text-orange-800' },
  { value: 'defective',           label: 'Defective',             color: 'bg-pink-100 text-pink-800' },
  { value: 'disposal',            label: 'Disposal',              color: 'bg-gray-100 text-gray-800' },
  { value: 'opening_stock',       label: 'Opening Stock',         color: 'bg-indigo-100 text-indigo-800' },
];

const FORM_MOVEMENT_OPTIONS = MOVEMENT_OPTIONS.filter(o => o.value !== 'opening_stock');

const movementColor = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.color ?? 'bg-gray-100 text-gray-800';

const movementLabel = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.label ?? type;

const DROPDOWN_PAGE_SIZE = 20;

function ProductSearchDropdown({
  products,
  value,
  onChange,
  excludeIds = [],
  allocatedCounts = {},
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  excludeIds?: string[];
  allocatedCounts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = (p: Product) => Math.max(0, p.currentStock - (allocatedCounts[p.id] || 0));

  const selected = products.find(p => p.id === value);
  const available = products.filter(p => p.id === value || !excludeIds.includes(p.id));

  const filtered = search.trim()
    ? available.filter(p =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(search.trim().toLowerCase())
      )
    : available;

  const totalPages = Math.ceil(filtered.length / DROPDOWN_PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * DROPDOWN_PAGE_SIZE, page * DROPDOWN_PAGE_SIZE);

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

  const handleSelect = (productId: string) => {
    onChange(productId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-left flex items-center justify-between gap-1 hover:border-[var(--primary)] transition-colors"
      >
        <span className={selected ? 'text-[var(--text)] truncate' : 'text-[var(--text-muted)]'}>
          {selected ? `${selected.name} (${remaining(selected)})` : 'Select product'}
        </span>
        <Search size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded bg-[var(--surface-2)]">
              <Search size={13} className="text-[var(--text-muted)] flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or SKU…"
                className="flex-1 text-sm bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                  <X size={12} />
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1 px-1">
              {filtered.length} product{filtered.length !== 1 ? 's' : ''} found
            </p>
          </div>

          {/* Results list */}
          <div className="max-h-48 overflow-y-auto">
            {paginated.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-4">No products match.</p>
            ) : (
              paginated.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between gap-2 ${p.id === value ? 'bg-[var(--surface-2)] font-medium' : ''}`}
                >
                  <span className="truncate text-[var(--text)]">{p.name}</span>
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{remaining(p)} left</span>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
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
              <span className="text-xs text-[var(--text-muted)]">
                Page {page} of {totalPages}
              </span>
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

function LocationSearchDropdown({
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

  const totalPages = Math.ceil(filtered.length / DROPDOWN_PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * DROPDOWN_PAGE_SIZE, page * DROPDOWN_PAGE_SIZE);

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
            {/* Clear / none option */}
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

interface StockDetailItem {
  id: string;
  stockId: string;
  productId?: string;
  currentStatus: string;
  currentLocationId?: string;
  product?: { name: string };
  currentLocation?: { name: string };
  assetTag?: string;
}

const DEDUCTING_MOVEMENT_TYPES: MovementType[] = ['stock_out', 'transfer', 'damaged', 'defective', 'disposal', 'borrowed', 'lost', 'returned', 'found', 'repair_out'];
const SPECIFIC_ITEM_MOVEMENT_TYPES: MovementType[] = [...DEDUCTING_MOVEMENT_TYPES, 'pre_deployment', 'post_deployment', 'repair_return', 'moved_to_department'];
const STATUS_CHANGE_ONLY_TYPES: MovementType[] = [];
const RETURNING_STATUSES: Partial<Record<MovementType, string[]>> = {
  returned: ['borrowed'],
  found: ['lost'],
  post_deployment: ['deployed'],
  repair_return: ['repair'],
};

function StockDetailSearchDropdown({
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

  const STATUS_COLOR: Record<string, string> = {
    active: 'text-green-600', damaged: 'text-orange-500', sold: 'text-gray-400',
    lost: 'text-red-500', borrowed: 'text-violet-500', disposed: 'text-gray-500',
    repair: 'text-yellow-600', deployed: 'text-cyan-600', returned: 'text-teal-600',
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

export function MapLocationPicker({
  locations,
  floorPlans,
  selectedLocationId,
  onSelect,
  onClose,
}: {
  locations: Location[];
  floorPlans: FloorPlan[];
  selectedLocationId: string;
  onSelect: (locationId: string) => void;
  onClose: () => void;
}) {
  const locationIds = new Set(locations.map(location => location.id));
  const plansWithLinks = floorPlans
    .map(plan => ({
      plan,
      linkedCount: (plan.objects || []).filter(obj => obj.linkedLocationId && locationIds.has(obj.linkedLocationId)).length,
    }))
    .filter(entry => entry.linkedCount > 0)
    .sort((a, b) => Number(b.plan.isApproved) - Number(a.plan.isApproved) || b.linkedCount - a.linkedCount);

  const [selectedPlanId, setSelectedPlanId] = useState(plansWithLinks[0]?.plan.id || '');
  const [locationSearch, setLocationSearch] = useState('');
  const [locationPage, setLocationPage] = useState(1);
  const [locationPageSize, setLocationPageSize] = useState(20);
  useEffect(() => {
    if (plansWithLinks.length > 0 && !plansWithLinks.some(entry => entry.plan.id === selectedPlanId)) {
      setSelectedPlanId(plansWithLinks[0].plan.id);
    }
  }, [plansWithLinks, selectedPlanId]);

  const selectedPlan = plansWithLinks.find(entry => entry.plan.id === selectedPlanId)?.plan || plansWithLinks[0]?.plan;
  const locationName = (id?: string) => locations.find(location => location.id === id)?.name || 'Linked location';
  const filteredLocations = locationSearch.trim()
    ? locations.filter(location => {
      const query = locationSearch.trim().toLowerCase();
      return location.name.toLowerCase().includes(query) || location.type.toLowerCase().includes(query);
    })
    : locations;
  const totalLocationPages = Math.max(1, Math.ceil(filteredLocations.length / locationPageSize));
  const paginatedLocations = filteredLocations.slice((locationPage - 1) * locationPageSize, locationPage * locationPageSize);
  const rectFill: Record<string, string> = { room: '#e5e7eb', rack: '#fef3c7', shelf: '#dbeafe' };

  useEffect(() => { setLocationPage(1); }, [locationSearch, locationPageSize]);
  useEffect(() => {
    if (locationPage > totalLocationPages) {
      setLocationPage(totalLocationPages);
    }
  }, [locationPage, totalLocationPages]);

  const renderObject = (obj: FloorPlanObject) => {
    const linked = obj.linkedLocationId && locationIds.has(obj.linkedLocationId);
    const selected = !!obj.linkedLocationId && obj.linkedLocationId === selectedLocationId;
    const common = {
      key: obj.id,
      onClick: linked ? () => onSelect(obj.linkedLocationId as string) : undefined,
      style: { cursor: linked ? 'pointer' : 'default' },
    };

    if (obj.type === 'wall') {
      return <line {...common} x1={obj.startX} y1={obj.startY} x2={obj.endX} y2={obj.endY} stroke={selected ? '#2563eb' : obj.color || '#1e293b'} strokeWidth={Math.max(1, obj.thickness)} strokeLinecap="round" />;
    }
    if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
      return (
        <g {...common}>
          <rect
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            fill={selected ? '#bfdbfe' : obj.color || rectFill[obj.type]}
            stroke={selected ? '#2563eb' : linked ? '#0f766e' : '#64748b'}
            strokeWidth={selected ? 4 : linked ? 2 : 1}
            opacity={linked ? 0.9 : 0.55}
          />
          {(obj.label || obj.linkedLocationId) && obj.width > 48 && obj.height > 24 && (
            <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill="#334155">
              {(obj.label || locationName(obj.linkedLocationId)).slice(0, 24)}
            </text>
          )}
        </g>
      );
    }
    if (obj.type === 'label') {
      return <text {...common} x={obj.x} y={obj.y} fontSize={obj.fontSize} fill={obj.color || '#475569'}>{obj.text}</text>;
    }
    if (obj.type === 'marker') {
      return (
        <g {...common}>
          <circle cx={obj.x} cy={obj.y} r={selected ? 12 : 8} fill={selected ? '#2563eb' : linked ? '#0f766e' : '#94a3b8'} />
          {linked && <text x={obj.x + 12} y={obj.y + 4} fontSize={12} fill="#334155">{locationName(obj.linkedLocationId).slice(0, 18)}</text>}
        </g>
      );
    }
    const shape = obj as any;
    return <line {...common} x1={shape.x - shape.width / 2} y1={shape.y} x2={shape.x + shape.width / 2} y2={shape.y} stroke={obj.type === 'window' ? '#38bdf8' : '#16a34a'} strokeWidth={4} transform={`rotate(${((shape.angle || 0) * 180) / Math.PI} ${shape.x} ${shape.y})`} />;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Map Select Location</h3>
            <p className="text-xs text-[var(--text-muted)]">Click a linked area or choose from the location list.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="min-h-0 p-4 bg-[var(--surface-2)]">
            {selectedPlan ? (
              <div className="h-full flex flex-col gap-3">
                {plansWithLinks.length > 1 && (
                  <select value={selectedPlan.id} onChange={e => setSelectedPlanId(e.target.value)}
                    className="w-full max-w-sm px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
                    {plansWithLinks.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                )}
                <div className="flex-1 min-h-0 bg-white rounded border border-[var(--border)] overflow-auto">
                  <svg viewBox={`0 0 ${selectedPlan.width} ${selectedPlan.height}`} className="w-full h-full min-h-[420px]">
                    <rect x="0" y="0" width={selectedPlan.width} height={selectedPlan.height} fill="#f8fafc" />
                    {(selectedPlan.objects || []).map(renderObject)}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                No linked floor-plan locations found.
              </div>
            )}
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-3 overflow-y-auto">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Locations</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                placeholder="Search locations..."
                className="w-full pl-8 pr-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
              />
            </div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-[var(--text-muted)]">{filteredLocations.length} locations</p>
              <div className="flex gap-1">
                {[20, 50, 100].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setLocationPageSize(size)}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${locationPageSize === size ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {paginatedLocations.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">No locations match.</p>
              ) : paginatedLocations.map(location => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => onSelect(location.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${location.id === selectedLocationId ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface-2)] text-[var(--text)]'}`}
                >
                  {location.name}
                </button>
              ))}
            </div>
            {filteredLocations.length > locationPageSize && (
              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setLocationPage(page => Math.max(1, page - 1))}
                  disabled={locationPage === 1}
                  className="p-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-[var(--text-muted)]">Page {locationPage} of {totalLocationPages}</span>
                <button
                  type="button"
                  onClick={() => setLocationPage(page => Math.min(totalLocationPages, page + 1))}
                  disabled={locationPage === totalLocationPages}
                  className="p-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  movementType: 'stock_in' as MovementType,
  remarks: '',
  toDepartmentId: '',
  deploymentSiteName: '',
  deploymentAddress: '',
  deploymentLatitude: '',
  deploymentLongitude: '',
  deployedToName: '',
  deploymentNotes: '',
  items: [{ stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }],
};

export default function StockMovements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const routeLocation = useLocation();
  const routeState = (routeLocation.state as any) || {};
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStockDetails, setShowStockDetails] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filters, setFilters] = useState<StockMovementFilter & { departmentId?: string; movementStatus?: string }>({
    search: routeState.search ?? '', movementType: undefined, dateRange: 'all', departmentId: undefined,
    movementStatus: routeState.notifFilter === 'movement:pending' ? 'pending' : undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<StockMovement | null>(null);
  const [drawerIsNew, setDrawerIsNew] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize, setItemsPageSize] = useState(20);
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemStockDetails, setItemStockDetails] = useState<Record<number, StockDetailItem[]>>({});
  const [borrowedProductIds, setBorrowedProductIds] = useState<Set<string>>(new Set());
  const [postDeploymentFromAddress, setPostDeploymentFromAddress] = useState<Record<number, string>>({});
  const [deploymentMapOpen, setDeploymentMapOpen] = useState(false);
  const [repairMapOpen, setRepairMapOpen] = useState(false);
  const currentDepartmentId = localStorage.getItem('currentDepartmentId') || user.departmentId || '';
  const currentDepartmentName = departments.find(d => d.id === currentDepartmentId)?.name || 'Current department';
  const currentDepartmentLocations = locations.filter(l => !currentDepartmentId || !l.departmentId || l.departmentId === currentDepartmentId);
  const destinationLocations = formData.toDepartmentId
    ? locations.filter(l => !l.departmentId || l.departmentId === formData.toDepartmentId)
    : [];

  const loadDepartmentLocations = async (departmentId: string) => {
    if (!departmentId) return;
    try {
      const res = await locationsApi.getForDepartment(departmentId);
      setLocations(prev => {
        const byId = new Map(prev.map(location => [location.id, location]));
        (res.data as Location[]).forEach(location => byId.set(location.id, location));
        return Array.from(byId.values());
      });
    } catch {
      setFormError('Could not load destination locations for the selected department');
    }
  };

  const fetchData = async () => {
    try {
      const [movementsRes, productsRes, locationsRes, deptRes] = await Promise.all([
        stockMovementsApi.getAll(),
        productsApi.getAll(),
        locationsApi.getAll(),
        ['superadmin', 'admin'].includes(user.role) ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
      ]);
      setMovements(movementsRes.data);
      setProducts(productsRes.data);
      setLocations(locationsRes.data);
      setDepartments(deptRes.data);
    } catch {
      console.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => { setLoading(true); fetchData(); };
    setLoading(true);
    fetchData();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const openNewDrawer = () => {
    setDrawerItem(null);
    setDrawerIsNew(true);
    setFormData(emptyForm);
    setFormError('');
    setDrawerOpen(true);
  };

  const openViewDrawer = (movement: StockMovement) => {
    setDrawerItem(movement);
    setDrawerIsNew(false);
    setFormError('');
    setItemsPage(1);
    setItemsSearch('');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setDrawerIsNew(false);
    setConfirmingDelete(false);
    setConfirmingStatus(false);
    setFormData(emptyForm);
    setFormError('');
    setItemStockDetails({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = formData.items.filter(item =>
      (item.stockDetailId || item.productId) &&
      (formData.movementType === 'adjustment' ? item.quantity !== 0 : item.quantity > 0)
    );
    if (validItems.length === 0) {
      setFormError('Please select at least one product and enter a valid quantity');
      return;
    }
    if (formData.movementType === 'moved_to_department') {
      if (!formData.toDepartmentId) {
        setFormError('Please select a destination department');
        return;
      }
      if (validItems.some(item => !item.toLocationId)) {
        setFormError('Please select the new location for the transferred item');
        return;
      }
    }
    try {
      await stockMovementsApi.create({
        movementType: formData.movementType,
        remarks: formData.remarks || null,
        toDepartmentId: formData.toDepartmentId || undefined,
        deploymentSiteName: formData.deploymentSiteName || undefined,
        deploymentAddress: formData.deploymentAddress || undefined,
        deploymentLatitude: formData.deploymentLatitude ? Number(formData.deploymentLatitude) : undefined,
        deploymentLongitude: formData.deploymentLongitude ? Number(formData.deploymentLongitude) : undefined,
        deployedToName: formData.deployedToName || undefined,
        deploymentNotes: formData.deploymentNotes || undefined,
        items: validItems,
      });
      await fetchData();
      closeDrawer();
      setError('');
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? 'Failed to create stock movement');
    }
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await stockMovementsApi.delete(drawerItem.id);
      await fetchData();
      closeDrawer();
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to delete stock movement');
      setConfirmingDelete(false);
    }
  };

  const doConfirm = async () => {
    if (!drawerItem) return;
    setConfirmingStatus(true);
    try {
      await stockMovementsApi.update(drawerItem.id, { status: 'committed' });
      await fetchData();
      setDrawerItem(prev => prev ? { ...prev, status: 'committed' } : prev);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to confirm movement');
    } finally {
      setConfirmingStatus(false);
    }
  };

  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name ?? 'Unknown';

  const filteredAndSortedMovements = sortStockMovements(
    filterStockMovements(movements, filters, getProductName)
      .filter(m => !filters.departmentId || m.departmentId === filters.departmentId),
    sortBy, getProductName
  );
  const paginatedMovements = filteredAndSortedMovements.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setFilters({ search: '', movementType: undefined, dateRange: 'all', departmentId: undefined, movementStatus: undefined });
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const mvCount = (type: string) => movements.filter(m => m.movementType === type).length;
  const pendingCount = movements.filter(m => m.status === 'pending').length;

  const filterContent = (
    <>
      <p className="text-sm text-[var(--text-muted)]">
        {filteredAndSortedMovements.length !== movements.length
          ? <><span className="text-[var(--primary)] font-medium">{filteredAndSortedMovements.length} filtered</span> of {movements.length} total</>
          : <>{movements.length} total</>
        }
        {pendingCount > 0 && (
          <> · <span className="text-orange-500 font-medium">{pendingCount} unconfirmed</span></>
        )}
        {' · '}<span className="text-green-600">{mvCount('stock_in')} stock in</span>
        {' · '}<span className="text-red-500">{mvCount('stock_out')} stock out</span>
        {' · '}<span className="text-purple-600">{mvCount('transfer')} transfers</span>
        {' · '}<span className="text-cyan-600">{mvCount('pre_deployment') + mvCount('post_deployment')} deployments</span>
        {' · '}<span className="text-violet-600">{mvCount('borrowed')} borrowed</span>
        {' · '}<span className="text-teal-600">{mvCount('returned')} returned</span>
        {' · '}<span className="text-yellow-600">{mvCount('repair_out') + mvCount('repair_return')} repairs</span>
        {' · '}<span className="text-blue-600">{mvCount('adjustment')} adjustments</span>
        {(mvCount('damaged') + mvCount('defective') + mvCount('disposal') + mvCount('lost')) > 0 && (
          <> · <span className="text-orange-600">{mvCount('damaged') + mvCount('defective') + mvCount('disposal') + mvCount('lost')} losses</span></>
        )}
      </p>
      <div className="flex gap-2">
        <input type="text" placeholder="Search by product name…"
          value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="product-name">Sort: Product Name</option>
          <option value="quantity-high">Sort: Quantity (High)</option>
          <option value="quantity-low">Sort: Quantity (Low)</option>
        </select>
        <button onClick={clearAllFilters} className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">Clear</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={filters.movementType || ''}
          onChange={e => { setFilters({ ...filters, movementType: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Movement Types</option>
          {MOVEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={(filters as any).movementStatus || ''}
          onChange={e => { setFilters({ ...filters, movementStatus: e.target.value || undefined } as any); setCurrentPage(1); }}
          className={`px-3 py-2 border rounded text-sm bg-[var(--surface)] text-[var(--text)] ${(filters as any).movementStatus ? 'border-orange-400 font-semibold text-orange-600' : 'border-[var(--border)]'}`}>
          <option value="">All Statuses</option>
          <option value="pending">Pending (unconfirmed)</option>
          <option value="committed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {user.role === 'superadmin' && (
          <select value={filters.departmentId || ''}
            onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Departments</option>
            {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>
        )}
      </div>
    </>
  );

  return (
    <>
      {showStockDetails && selectedProductId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[var(--text)]">Manage Stock Details</h2>
              <button onClick={() => { setShowStockDetails(false); setSelectedProductId(null); }} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <StockDetails productId={selectedProductId} productName={getProductName(selectedProductId)} />
            </div>
          </div>
        </div>
      )}

      {deploymentMapOpen && (
        <DeploymentMapPicker
          latitude={formData.deploymentLatitude ? Number(formData.deploymentLatitude) : null}
          longitude={formData.deploymentLongitude ? Number(formData.deploymentLongitude) : null}
          onChange={({ latitude, longitude }) => {
            setFormData({
              ...formData,
              deploymentLatitude: latitude.toFixed(6),
              deploymentLongitude: longitude.toFixed(6),
            });
          }}
          onAddressFound={(name) => setFormData(prev => ({ ...prev, deploymentAddress: name }))}
          onClose={() => setDeploymentMapOpen(false)}
        />
      )}

      {repairMapOpen && (
        <DeploymentMapPicker
          latitude={formData.deploymentLatitude ? Number(formData.deploymentLatitude) : null}
          longitude={formData.deploymentLongitude ? Number(formData.deploymentLongitude) : null}
          onChange={({ latitude, longitude }) => {
            setFormData({
              ...formData,
              deploymentLatitude: latitude.toFixed(6),
              deploymentLongitude: longitude.toFixed(6),
            });
          }}
          onAddressFound={(name) => setFormData(prev => ({ ...prev, deploymentAddress: name }))}
          onClose={() => setRepairMapOpen(false)}
        />
      )}

      <DataPageLayout
        title="Stock Movements"
        error={error}
        showForm={false}
        formContent={null}
        onAddClick={openNewDrawer}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        filterContent={filterContent}>
        <div className="space-y-3">
          {filteredAndSortedMovements.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              {movements.length === 0 ? 'No movements recorded yet.' : 'No movements match your filters.'}
            </div>
          ) : paginatedMovements.map(movement => (
            <div
              key={movement.id}
              onClick={() => openViewDrawer(movement)}
              className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${movementColor(movement.movementType)}`}>
                    {movementLabel(movement.movementType)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">#{movement.movementNo}</span>
                  {movement.remarks && (
                    <span className="text-sm text-[var(--text-muted)] truncate max-w-xs">{movement.remarks}</span>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)] flex-shrink-0 ml-2">{formatDate(movement.createdAt)}</span>
              </div>
              <div className="space-y-1">
                {(movement.items || []).slice(0, 3).map((item: any, idx: number) => (
                  <div key={idx} className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text)]">{item.product?.name || 'Unknown'}</span>
                    <span className="mx-1">·</span>
                    <span>qty {item.quantity}</span>
                    {(item.fromLocation || item.toLocation) && (
                      <span className="mx-1">· {item.fromLocation?.name ?? '?'} → {item.toLocation?.name ?? '?'}</span>
                    )}
                  </div>
                ))}
                {(movement.items || []).length > 3 && (
                  <p className="text-xs text-[var(--text-muted)]">+{(movement.items || []).length - 3} more items</p>
                )}
              </div>
              {movement.movementType === 'moved_to_department' ? (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  <span>{movement.department?.name || '—'}</span>
                  <span className="mx-1">→</span>
                  <span className="text-[var(--primary)] font-medium">{(movement as any).toDepartment?.name || '—'}</span>
                </p>
              ) : movement.department?.name ? (
                <p className="text-xs text-[var(--text-muted)] mt-2">{movement.department.name}</p>
              ) : null}
            </div>
          ))}
        </div>
        {filteredAndSortedMovements.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedMovements.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </DataPageLayout>

      {/* Right-Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex drawer-overlay">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden drawer-panel">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  {drawerIsNew ? (
                    <h2 className="text-lg font-semibold text-[var(--text)]">Record Stock Movement</h2>
                  ) : drawerItem && (
                    <>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${movementColor(drawerItem.movementType)}`}>
                        {movementLabel(drawerItem.movementType)}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">#{drawerItem.movementNo}</span>
                    </>
                  )}
                </div>
                {drawerItem && !drawerIsNew && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(drawerItem.createdAt)}</p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerIsNew ? (
                <form id="movement-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Movement Type *</label>
                      <select value={formData.movementType}
                        onChange={async e => {
                          const newType = e.target.value as MovementType;
                          setFormData({ ...formData, movementType: newType, items: formData.items.map(it => ({ ...it, stockDetailId: '', productId: '', fromLocationId: '', toLocationId: '' })) });
                          setItemStockDetails({});
                          if (newType === 'returned' || newType === 'found' || newType === 'post_deployment' || newType === 'repair_return') {
                            try {
                              const status = newType === 'returned' ? 'borrowed' : newType === 'post_deployment' ? 'deployed' : newType === 'repair_return' ? 'repair' : 'lost';
                              const res = await stockDetailsApi.getByStatus(status);
                              setBorrowedProductIds(new Set((res.data as StockDetailItem[]).map(s => s.productId as string)));
                            } catch { setBorrowedProductIds(new Set()); }
                          } else {
                            setBorrowedProductIds(new Set());
                          }
                        }}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                        {FORM_MOVEMENT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {formData.movementType === 'stock_in' && 'Add quantity — received goods or new stock arriving'}
                        {formData.movementType === 'stock_out' && 'Remove quantity — sales, shipments, or stock leaving'}
                        {formData.movementType === 'adjustment' && 'Adjust stock — positive quantity adds, negative quantity deducts'}
                        {formData.movementType === 'returned' && 'Add quantity — customer returns or items coming back'}
                        {formData.movementType === 'damaged' && 'Remove quantity — marks item as damaged, removed from available stock'}
                        {formData.movementType === 'transfer' && 'Move item between locations — no quantity change'}
                        {formData.movementType === 'moved_to_department' && 'Reassign product to a different department — no quantity change, keeps the same product ID'}
                        {formData.movementType === 'pre_deployment' && 'Send item out for deployment — deducts from stock'}
                        {formData.movementType === 'post_deployment' && 'Return deployed item back to active stock — restores quantity'}
                        {formData.movementType === 'repair_out' && 'Send item out for repair — deducts from stock, status changes to Under Repair'}
                        {formData.movementType === 'repair_return' && 'Return item from repair back to active stock — restores quantity'}
                        {formData.movementType === 'defective' && 'Mark item as defective — deducts from stock permanently'}
                        {formData.movementType === 'disposal' && 'Remove quantity — mark item as disposed or retired'}
                        {formData.movementType === 'borrowed' && 'Remove quantity — mark item as temporarily borrowed or issued'}
                        {formData.movementType === 'lost' && 'Remove quantity — mark item as lost or missing'}
                        {formData.movementType === 'found' && 'Restore a lost item - record where it was found, then choose its final location'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">General Remarks</label>
                      <input type="text" value={formData.remarks}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="e.g., Purchase order #123, Batch adjustment..."
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    {formData.movementType === 'pre_deployment' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Deployment Site Name</label>
                            <input type="text" value={formData.deploymentSiteName}
                              onChange={e => setFormData({ ...formData, deploymentSiteName: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Deployed To / Client / Person</label>
                            <input type="text" value={formData.deployedToName}
                              onChange={e => setFormData({ ...formData, deployedToName: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Deployment Address</label>
                          <input type="text" value={formData.deploymentAddress}
                            onChange={e => setFormData({ ...formData, deploymentAddress: e.target.value })}
                            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Latitude</label>
                            <input type="number" step="any" value={formData.deploymentLatitude}
                              onChange={e => setFormData({ ...formData, deploymentLatitude: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Longitude</label>
                            <input type="number" step="any" value={formData.deploymentLongitude}
                              onChange={e => setFormData({ ...formData, deploymentLongitude: e.target.value })}
                              className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                          </div>
                          <button type="button"
                            onClick={() => setDeploymentMapOpen(true)}
                            className="h-[38px] px-3 border border-[var(--border)] rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)] flex items-center gap-1.5 text-sm">
                            <MapPin size={14} />
                            Map
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Deployment Notes</label>
                          <textarea value={formData.deploymentNotes}
                            onChange={e => setFormData({ ...formData, deploymentNotes: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)] resize-none" />
                        </div>
                      </div>
                    )}
                    {formData.movementType === 'moved_to_department' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Current Department</label>
                          <div className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface-2)] text-[var(--text-muted)]">
                            {currentDepartmentName}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Move To Department *</label>
                          <select value={formData.toDepartmentId}
                          onChange={async e => {
                            const toDepartmentId = e.target.value;
                            setFormData({
                              ...formData,
                              toDepartmentId,
                              items: formData.items.map(it => ({ ...it, toLocationId: '' })),
                            });
                            setFormError('');
                            await loadDepartmentLocations(toDepartmentId);
                          }}
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                          <option value="">— Select destination department —</option>
                          {departments
                            .filter(d => d.id !== currentDepartmentId)
                            .map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Items *</h3>
                    <div className="space-y-3">
                      {formData.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-[var(--surface-2)] rounded-lg space-y-2">
                          <div className="flex flex-col gap-2">
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Product *</label>
                              <ProductSearchDropdown
                                products={(formData.movementType === 'returned' || formData.movementType === 'found' || formData.movementType === 'post_deployment' || formData.movementType === 'repair_return') && borrowedProductIds.size > 0
                                  ? products.filter(p => borrowedProductIds.has(p.id))
                                  : products}
                                value={item.productId}
                                excludeIds={(() => {
                                  if (!SPECIFIC_ITEM_MOVEMENT_TYPES.includes(formData.movementType) || formData.movementType === 'returned' || formData.movementType === 'found' || formData.movementType === 'post_deployment' || formData.movementType === 'repair_return') return [];
                                  const alloc: Record<string, number> = {};
                                  formData.items.forEach((it, i) => {
                                    if (i < idx && it.productId) alloc[it.productId] = (alloc[it.productId] || 0) + (it.stockDetailId ? 1 : (it.quantity || 0));
                                  });
                                  return products.filter(p => (alloc[p.id] || 0) >= p.currentStock).map(p => p.id);
                                })()}
                                allocatedCounts={(() => {
                                  if (!SPECIFIC_ITEM_MOVEMENT_TYPES.includes(formData.movementType) || formData.movementType === 'returned' || formData.movementType === 'found' || formData.movementType === 'post_deployment' || formData.movementType === 'repair_return') return {};
                                  const alloc: Record<string, number> = {};
                                  formData.items.forEach((it, i) => {
                                    if (i < idx && it.productId) alloc[it.productId] = (alloc[it.productId] || 0) + (it.stockDetailId ? 1 : (it.quantity || 0));
                                  });
                                  return alloc;
                                })()}
                                onChange={async productId => {
                                  const newItems = [...formData.items];
                                  const selectedProduct = products.find(p => p.id === productId);
                                  newItems[idx] = {
                                    ...item,
                                    productId,
                                    stockDetailId: '',
                                    fromLocationId: selectedProduct?.locationId || '',
                                    quantity: SPECIFIC_ITEM_MOVEMENT_TYPES.includes(formData.movementType) ? 1 : item.quantity,
                                  };
                                  setFormData({ ...formData, items: newItems });
                                  if (SPECIFIC_ITEM_MOVEMENT_TYPES.includes(formData.movementType) && productId) {
                                    try {
                                      const res = await stockDetailsApi.getByProductId(productId);
                                      const returningStatuses = RETURNING_STATUSES[formData.movementType] || [];
                                      const filtered = returningStatuses.length > 0
                                        ? (res.data as StockDetailItem[]).filter(s => returningStatuses.includes(s.currentStatus))
                                        : (res.data as StockDetailItem[]).filter(s => s.currentStatus === 'active');
                                      setItemStockDetails(prev => ({ ...prev, [idx]: filtered }));
                                    } catch { setItemStockDetails(prev => ({ ...prev, [idx]: [] })); }
                                  } else {
                                    setItemStockDetails(prev => { const next = { ...prev }; delete next[idx]; return next; });
                                  }
                                }}
                              />
                            </div>
                            {(SPECIFIC_ITEM_MOVEMENT_TYPES.includes(formData.movementType) || (formData.movementType === 'adjustment' && item.quantity < 0)) && item.productId && (
                              <div>
                                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                                  {formData.movementType === 'moved_to_department' ? 'Specific Item' : 'Inventory Item'} <span className="text-[var(--text-muted)] font-normal normal-case">
                                    {formData.movementType === 'found' || formData.movementType === 'returned'
                                      ? '(optional - choose a unit or use quantity)'
                                      : '(which specific unit?)'}
                                  </span>
                                </label>
                                {itemStockDetails[idx] === undefined ? (
                                  <p className="text-xs text-[var(--text-muted)] italic px-1">Loading items…</p>
                                ) : itemStockDetails[idx].length === 0 ? (
                                  <p className="text-xs text-orange-500 px-1">
                                    {formData.movementType === 'returned'
                                      ? 'No borrowed inventory items found for this product.'
                                      : formData.movementType === 'found'
                                        ? 'No lost inventory items found for this product.'
                                      : formData.movementType === 'post_deployment'
                                        ? 'No deployed inventory items found for this product.'
                                      : formData.movementType === 'repair_return'
                                        ? 'No under-repair inventory items found for this product.'
                                      : 'No active inventory items found for this product.'}
                                  </p>
                                ) : (
                                  <StockDetailSearchDropdown
                                    stockDetails={(() => {
                                      const details = itemStockDetails[idx] || [];
                                      const otherSelected = new Set(
                                        formData.items
                                          .filter((it, i) => i !== idx && it.stockDetailId)
                                          .map(it => it.stockDetailId)
                                      );
                                      const available = details.filter(d => !otherSelected.has(d.id) || d.id === item.stockDetailId);
                                      const unspecifiedQty = formData.items
                                        .filter((it, i) => i !== idx && it.productId === item.productId && !it.stockDetailId)
                                        .reduce((sum, it) => sum + (it.quantity || 0), 0);
                                      const limit = Math.max(0, available.length - unspecifiedQty);
                                      const sliced = available.slice(0, limit);
                                      if (item.stockDetailId && !sliced.some(d => d.id === item.stockDetailId)) {
                                        const sel = available.find(d => d.id === item.stockDetailId);
                                        if (sel) sliced.unshift(sel);
                                      }
                                      return sliced;
                                    })()}
                                    value={item.stockDetailId}
                                    excludeIds={[]}
                                    onChange={async (stockDetailId, locationId) => {
                                      const newItems = [...formData.items];
                                      const qty = formData.movementType === 'adjustment' && newItems[idx].quantity < 0 ? -1
                                               : STATUS_CHANGE_ONLY_TYPES.includes(formData.movementType) ? 0
                                               : 1;
                                      newItems[idx] = { ...newItems[idx], stockDetailId, quantity: qty, fromLocationId: locationId || newItems[idx].fromLocationId };
                                      setFormData({ ...formData, items: newItems });
                                      if (formData.movementType === 'post_deployment' && stockDetailId) {
                                        try {
                                          const res = await stockDetailsApi.getDeployment(stockDetailId);
                                          const addr = res.data?.deploymentAddress || res.data?.deploymentSiteName || '';
                                          setPostDeploymentFromAddress(prev => ({ ...prev, [idx]: addr }));
                                        } catch { setPostDeploymentFromAddress(prev => ({ ...prev, [idx]: '' })); }
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            )}
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Quantity *</label>
                              {item.stockDetailId ? (
                                <div className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text-muted)] select-none">
                                  {STATUS_CHANGE_ONLY_TYPES.includes(formData.movementType)
                                    ? <span>0 <span className="text-xs">(no stock change — status update only)</span></span>
                                    : <span>{item.quantity < 0 ? '−1' : '1'} <span className="text-xs">(fixed — 1 specific unit)</span></span>}
                                </div>
                              ) : formData.movementType === 'adjustment' ? (
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const newItems = [...formData.items];
                                      const abs = Math.abs(newItems[idx].quantity || 0) || 1;
                                      const isNeg = newItems[idx].quantity < 0;
                                      if (isNeg) {
                                        // going positive — clear specific item
                                        newItems[idx] = { ...newItems[idx], quantity: abs, stockDetailId: '' };
                                        setItemStockDetails(prev => { const n = { ...prev }; delete n[idx]; return n; });
                                      } else {
                                        // going negative — load stock details if product selected
                                        newItems[idx] = { ...newItems[idx], quantity: -abs };
                                        if (newItems[idx].productId) {
                                          try {
                                            const res = await stockDetailsApi.getByProductId(newItems[idx].productId!);
                                            const active = (res.data as StockDetailItem[]).filter(s => s.currentStatus === 'active');
                                            setItemStockDetails(prev => ({ ...prev, [idx]: active }));
                                          } catch { /* ignore */ }
                                        }
                                      }
                                      setFormData({ ...formData, items: newItems });
                                    }}
                                    className={`flex-shrink-0 w-9 h-[34px] rounded text-sm font-bold border transition-colors ${item.quantity < 0 ? 'bg-red-500 text-white border-red-500' : 'bg-green-500 text-white border-green-500'}`}
                                  >
                                    {item.quantity < 0 ? '−' : '+'}
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    value={Math.abs(item.quantity) || ''}
                                    onChange={e => {
                                      const abs = parseInt(e.target.value) || 0;
                                      const newItems = [...formData.items];
                                      const sign = newItems[idx].quantity < 0 ? -1 : 1;
                                      newItems[idx] = { ...newItems[idx], quantity: sign * abs };
                                      setFormData({ ...formData, items: newItems });
                                    }}
                                    placeholder="0"
                                    className="flex-1 px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]"
                                  />
                                </div>
                              ) : (
                                <input type="number" min={1} value={item.quantity || ''}
                                  onChange={e => {
                                    const newItems = [...formData.items];
                                    newItems[idx] = { ...newItems[idx], quantity: parseInt(e.target.value) || 0 };
                                    setFormData({ ...formData, items: newItems });
                                  }}
                                  placeholder="0"
                                  className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]" />
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                                {formData.movementType === 'moved_to_department'
                                  ? 'Current Location'
                                  : formData.movementType === 'found'
                                    ? 'Found at Location'
                                    : formData.movementType === 'post_deployment'
                                      ? 'From (Deployment Address)'
                                      : 'From Location'}
                              </label>
                              {formData.movementType === 'post_deployment' ? (
                                <div className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text-muted)] min-h-[34px]">
                                  {postDeploymentFromAddress[idx] || (item.stockDetailId ? 'No deployment address found' : '— Select an item first —')}
                                </div>
                              ) : formData.movementType === 'moved_to_department' && item.stockDetailId ? (
                                <div className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text-muted)]">
                                  {locations.find(l => l.id === item.fromLocationId)?.name || 'No location'}
                                </div>
                              ) : (
                                <LocationSearchDropdown
                                  locations={formData.movementType === 'moved_to_department' ? currentDepartmentLocations : locations}
                                  value={(item.fromLocationId as string) || ''}
                                  onChange={locationId => {
                                    const newItems = [...formData.items];
                                    newItems[idx] = { ...newItems[idx], fromLocationId: locationId };
                                    setFormData({ ...formData, items: newItems });
                                  }}
                                />
                              )}
                            </div>
                            {formData.movementType !== 'pre_deployment' && (
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                                {formData.movementType === 'moved_to_department' ? 'New Location' : 'To Location'}
                              </label>
                              {formData.movementType === 'repair_out' ? (
                                <div className="space-y-1">
                                  <button
                                    type="button"
                                    onClick={() => setRepairMapOpen(true)}
                                    className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-left flex items-center gap-2 hover:border-[var(--primary)] transition-colors"
                                  >
                                    <MapPin size={13} className="flex-shrink-0 text-[var(--text-muted)]" />
                                    <span className={formData.deploymentAddress ? 'text-[var(--text)] truncate' : 'text-[var(--text-muted)]'}>
                                      {formData.deploymentAddress || 'Select repair location on map…'}
                                    </span>
                                  </button>
                                  {formData.deploymentLatitude && formData.deploymentLongitude && (
                                    <p className="text-xs text-[var(--text-muted)] px-1">
                                      {Number(formData.deploymentLatitude).toFixed(6)}, {Number(formData.deploymentLongitude).toFixed(6)}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <LocationSearchDropdown
                                  locations={formData.movementType === 'moved_to_department' ? destinationLocations : locations}
                                  value={(item.toLocationId as string) || ''}
                                  onChange={locationId => {
                                    const newItems = [...formData.items];
                                    newItems[idx] = { ...newItems[idx], toLocationId: locationId };
                                    setFormData({ ...formData, items: newItems });
                                  }}
                                  placeholder={formData.movementType === 'moved_to_department' && !formData.toDepartmentId ? 'Select department first' : 'No location'}
                                />
                              )}
                            </div>
                            )}
                          </div>
                          {formData.items.length > 1 && (
                            <button type="button"
                              onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                              className="text-xs text-red-500 hover:text-red-700">
                              Remove item
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button"
                      onClick={() => setFormData({
                        ...formData,
                        items: [...formData.items, { stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }],
                      })}
                      className="mt-2 text-sm px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)]">
                      + Add Item
                    </button>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                </form>
              ) : drawerItem && (
                <div className="space-y-6">
                  {drawerItem.remarks && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Remarks</h3>
                      <p className="text-sm text-[var(--text)]">{drawerItem.remarks}</p>
                    </section>
                  )}
                  <section>
                    {(() => {
                      const allItems = drawerItem.items || [];
                      const term = itemsSearch.trim().toLowerCase();
                      const filteredItems = term
                        ? allItems.filter((item: any) =>
                            (item.product?.name || '').toLowerCase().includes(term) ||
                            (item.stockDetail?.stockId || '').toLowerCase().includes(term)
                          )
                        : allItems;
                      const totalItemPages = Math.ceil(filteredItems.length / itemsPageSize);
                      const pagedItems = filteredItems.slice((itemsPage - 1) * itemsPageSize, itemsPage * itemsPageSize);
                      return (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                              Items <span className="normal-case font-normal">({allItems.length})</span>
                            </h3>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-[var(--text-muted)]">Show</span>
                              {[20, 50, 100].map(size => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => { setItemsPageSize(size); setItemsPage(1); }}
                                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${itemsPageSize === size ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Items search */}
                          <div className="flex items-center gap-2 px-2 py-1.5 border border-[var(--border)] rounded bg-[var(--surface-2)] mb-2">
                            <Search size={13} className="text-[var(--text-muted)] flex-shrink-0" />
                            <input
                              type="text"
                              value={itemsSearch}
                              onChange={e => { setItemsSearch(e.target.value); setItemsPage(1); }}
                              placeholder="Search by product name or stock ID…"
                              className="flex-1 text-xs bg-transparent outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
                            />
                            {itemsSearch && (
                              <button type="button" onClick={() => { setItemsSearch(''); setItemsPage(1); }} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          {term && (
                            <p className="text-xs text-[var(--text-muted)] mb-2">
                              {filteredItems.length} of {allItems.length} items
                            </p>
                          )}
                          <div className="space-y-2">
                            {pagedItems.map((item: any, idx: number) => (
                              <div key={idx} className="p-3 bg-[var(--surface-2)] rounded-lg text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-xs text-[var(--text-muted)]">Product</p>
                                    <p className="font-medium text-[var(--text)]">{item.product?.name || 'Unknown'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-[var(--text-muted)]">Stock ID</p>
                                    <p className="text-[var(--text)] font-mono text-xs">{item.stockDetail?.stockId || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-[var(--text-muted)]">Quantity</p>
                                    <p className="font-medium text-[var(--text)]">{item.quantity}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-[var(--text-muted)]">Locations</p>
                                    <p className="text-[var(--text)]">{item.fromLocation?.name || '—'} → {item.toLocation?.name || '—'}</p>
                                  </div>
                                </div>
                                {item.reason && (
                                  <p className="text-xs text-[var(--text-muted)] mt-2 italic">{item.reason}</p>
                                )}
                              </div>
                            ))}
                          </div>
                          {totalItemPages > 1 && (
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                              <button
                                type="button"
                                onClick={() => setItemsPage(p => Math.max(1, p - 1))}
                                disabled={itemsPage === 1}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <ChevronLeft size={13} /> Prev
                              </button>
                              <span className="text-xs text-[var(--text-muted)]">
                                Page {itemsPage} of {totalItemPages} · {filteredItems.length} items
                              </span>
                              <button
                                type="button"
                                onClick={() => setItemsPage(p => Math.min(totalItemPages, p + 1))}
                                disabled={itemsPage === totalItemPages}
                                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Next <ChevronRight size={13} />
                              </button>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </section>
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Details</h3>
                    <div className="space-y-2">
                      {drawerItem.movementType === 'moved_to_department' ? (
                        <>
                          <div>
                            <p className="text-xs text-[var(--text-muted)] mb-0.5">Moved From</p>
                            <p className="text-sm text-[var(--text)]">{drawerItem.department?.name || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)] mb-0.5">Moved To</p>
                            <p className="text-sm font-medium text-[var(--primary)]">{(drawerItem as any).toDepartment?.name || '—'}</p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Department</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.department?.name || '—'}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Recorded</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(drawerItem.createdAt)}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
              {drawerIsNew ? (
                <div className="flex gap-2">
                  <button type="submit" form="movement-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Record Movement
                  </button>
                  <button type="button" onClick={closeDrawer}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete this movement?</p>
                  <div className="flex gap-2">
                    <button onClick={doDelete}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                      Yes, Delete
                    </button>
                    <button onClick={() => setConfirmingDelete(false)}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : drawerItem && user.role === 'admin' && (
                <div className="flex gap-2">
                  {drawerItem.status === 'pending' && (
                    <button
                      onClick={doConfirm}
                      disabled={confirmingStatus}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
                      {confirmingStatus ? 'Confirming…' : 'Confirm Movement'}
                    </button>
                  )}
                  <button onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
