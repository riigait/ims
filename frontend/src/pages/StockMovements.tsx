import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { stockMovementsApi, productsApi, locationsApi, departmentsApi, stockDetailsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { StockMovementFilter } from '@/types/filters';
import { formatDate } from '@/utils/ids';
import { filterStockMovements, sortStockMovements } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import StockDetails from '@/components/StockDetails';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

interface Department {
  id: string;
  name: string;
}

const MOVEMENT_OPTIONS: { value: MovementType; label: string; color: string }[] = [
  { value: 'stock_in',      label: 'Stock In',      color: 'bg-green-100 text-green-800' },
  { value: 'stock_out',     label: 'Stock Out',     color: 'bg-red-100 text-red-800' },
  { value: 'adjustment',    label: 'Adjustment',    color: 'bg-blue-100 text-blue-800' },
  { value: 'returned',      label: 'Returned',      color: 'bg-teal-100 text-teal-800' },
  { value: 'damaged',       label: 'Damaged',       color: 'bg-orange-100 text-orange-800' },
  { value: 'transfer',            label: 'Transfer',            color: 'bg-purple-100 text-purple-800' },
  { value: 'moved_to_department', label: 'Moved to Department',  color: 'bg-sky-100 text-sky-800' },
  { value: 'opening_stock', label: 'Opening Stock', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'deployment',    label: 'Deployment',    color: 'bg-cyan-100 text-cyan-800' },
  { value: 'repair',        label: 'Repair',        color: 'bg-yellow-100 text-yellow-800' },
  { value: 'disposal',      label: 'Disposal',      color: 'bg-gray-100 text-gray-800' },
  { value: 'borrowed',      label: 'Borrowed',      color: 'bg-violet-100 text-violet-800' },
  { value: 'lost',          label: 'Lost',          color: 'bg-rose-100 text-rose-800' },
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

const DEDUCTING_MOVEMENT_TYPES = ['stock_out', 'transfer', 'damaged', 'disposal', 'borrowed', 'lost', 'returned'];
const RETURNING_STATUSES = ['borrowed'];

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

const emptyForm = {
  movementType: 'stock_in' as MovementType,
  remarks: '',
  toDepartmentId: '',
  items: [{ stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }],
};

export default function StockMovements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStockDetails, setShowStockDetails] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filters, setFilters] = useState<StockMovementFilter & { departmentId?: string }>({
    search: '', movementType: undefined, dateRange: 'all', departmentId: undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
    try {
      await stockMovementsApi.create({
        movementType: formData.movementType,
        remarks: formData.remarks || null,
        toDepartmentId: formData.toDepartmentId || undefined,
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

  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name ?? 'Unknown';

  const filteredAndSortedMovements = sortStockMovements(
    filterStockMovements(movements, filters, getProductName)
      .filter(m => !filters.departmentId || m.departmentId === filters.departmentId),
    sortBy, getProductName
  );
  const paginatedMovements = filteredAndSortedMovements.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setFilters({ search: '', movementType: undefined, dateRange: 'all', departmentId: undefined });
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const filterContent = (
    <>
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
                          setFormData({ ...formData, movementType: newType, items: formData.items.map(it => ({ ...it, stockDetailId: '', productId: '', fromLocationId: '' })) });
                          setItemStockDetails({});
                          if (newType === 'returned') {
                            try {
                              const res = await stockDetailsApi.getByStatus('borrowed');
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
                        {formData.movementType === 'deployment' && 'Mark item as deployed or in use — no quantity change'}
                        {formData.movementType === 'repair' && 'Mark item as under repair — no quantity change'}
                        {formData.movementType === 'disposal' && 'Remove quantity — mark item as disposed or retired'}
                        {formData.movementType === 'borrowed' && 'Remove quantity — mark item as temporarily borrowed or issued'}
                        {formData.movementType === 'lost' && 'Remove quantity — mark item as lost or missing'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">General Remarks</label>
                      <input type="text" value={formData.remarks}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="e.g., Purchase order #123, Batch adjustment..."
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    {formData.movementType === 'moved_to_department' && (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Move To Department *</label>
                        <select value={formData.toDepartmentId}
                          onChange={e => setFormData({ ...formData, toDepartmentId: e.target.value })}
                          className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                          <option value="">— Select destination department —</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
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
                                products={formData.movementType === 'returned' && borrowedProductIds.size > 0
                                  ? products.filter(p => borrowedProductIds.has(p.id))
                                  : products}
                                value={item.productId}
                                excludeIds={(() => {
                                  if (!DEDUCTING_MOVEMENT_TYPES.includes(formData.movementType) || formData.movementType === 'returned') return [];
                                  const alloc: Record<string, number> = {};
                                  formData.items.forEach((it, i) => {
                                    if (i < idx && it.productId) alloc[it.productId] = (alloc[it.productId] || 0) + (it.stockDetailId ? 1 : (it.quantity || 0));
                                  });
                                  return products.filter(p => (alloc[p.id] || 0) >= p.currentStock).map(p => p.id);
                                })()}
                                allocatedCounts={(() => {
                                  if (!DEDUCTING_MOVEMENT_TYPES.includes(formData.movementType) || formData.movementType === 'returned') return {};
                                  const alloc: Record<string, number> = {};
                                  formData.items.forEach((it, i) => {
                                    if (i < idx && it.productId) alloc[it.productId] = (alloc[it.productId] || 0) + (it.stockDetailId ? 1 : (it.quantity || 0));
                                  });
                                  return alloc;
                                })()}
                                onChange={async productId => {
                                  const newItems = [...formData.items];
                                  const selectedProduct = products.find(p => p.id === productId);
                                  newItems[idx] = { ...item, productId, stockDetailId: '', fromLocationId: selectedProduct?.locationId || '' };
                                  setFormData({ ...formData, items: newItems });
                                  if (DEDUCTING_MOVEMENT_TYPES.includes(formData.movementType) && productId) {
                                    try {
                                      const res = await stockDetailsApi.getByProductId(productId);
                                      const filtered = formData.movementType === 'returned'
                                        ? (res.data as StockDetailItem[]).filter(s => RETURNING_STATUSES.includes(s.currentStatus))
                                        : (res.data as StockDetailItem[]).filter(s => s.currentStatus === 'active');
                                      setItemStockDetails(prev => ({ ...prev, [idx]: filtered }));
                                    } catch { setItemStockDetails(prev => ({ ...prev, [idx]: [] })); }
                                  } else {
                                    setItemStockDetails(prev => { const next = { ...prev }; delete next[idx]; return next; });
                                  }
                                }}
                              />
                            </div>
                            {DEDUCTING_MOVEMENT_TYPES.includes(formData.movementType) && item.productId && (
                              <div>
                                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                                  Inventory Item <span className="text-[var(--text-muted)] font-normal normal-case">(which specific unit?)</span>
                                </label>
                                {itemStockDetails[idx] === undefined ? (
                                  <p className="text-xs text-[var(--text-muted)] italic px-1">Loading items…</p>
                                ) : itemStockDetails[idx].length === 0 ? (
                                  <p className="text-xs text-orange-500 px-1">
                                    {formData.movementType === 'returned'
                                      ? 'No borrowed inventory items found for this product.'
                                      : 'No active inventory items found for this product.'}
                                  </p>
                                ) : (
                                  <StockDetailSearchDropdown
                                    stockDetails={itemStockDetails[idx]}
                                    value={item.stockDetailId}
                                    excludeIds={formData.items.filter((_, i) => i < idx).map(it => it.stockDetailId).filter(Boolean)}
                                    onChange={(stockDetailId, locationId) => {
                                      const newItems = [...formData.items];
                                      newItems[idx] = { ...newItems[idx], stockDetailId, quantity: 1, fromLocationId: locationId || newItems[idx].fromLocationId };
                                      setFormData({ ...formData, items: newItems });
                                    }}
                                  />
                                )}
                              </div>
                            )}
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Quantity *</label>
                              {item.stockDetailId ? (
                                <div className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text-muted)] select-none">
                                  1 <span className="text-xs">(fixed — 1 specific unit)</span>
                                </div>
                              ) : formData.movementType === 'adjustment' ? (
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newItems = [...formData.items];
                                      const abs = Math.abs(newItems[idx].quantity || 0);
                                      const isNeg = newItems[idx].quantity < 0;
                                      newItems[idx] = { ...newItems[idx], quantity: isNeg ? abs : -abs };
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
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">From Location</label>
                              <LocationSearchDropdown
                                locations={locations}
                                value={(item.fromLocationId as string) || ''}
                                onChange={locationId => {
                                  const newItems = [...formData.items];
                                  newItems[idx] = { ...newItems[idx], fromLocationId: locationId };
                                  setFormData({ ...formData, items: newItems });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">To Location</label>
                              <LocationSearchDropdown
                                locations={locations}
                                value={(item.toLocationId as string) || ''}
                                onChange={locationId => {
                                  const newItems = [...formData.items];
                                  newItems[idx] = { ...newItems[idx], toLocationId: locationId };
                                  setFormData({ ...formData, items: newItems });
                                }}
                              />
                            </div>
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
