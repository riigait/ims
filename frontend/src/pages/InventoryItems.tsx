import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Edit, ArrowLeftRight, ChevronRight, ChevronDown } from 'lucide-react';
import { stockDetailsApi, locationsApi, productsApi, categoriesApi, departmentsApi } from '@/services/api';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import Pagination from '@/components/Pagination';

const STATUS_OPTIONS = ['active', 'available', 'deployed', 'borrowed', 'reserved', 'returned', 'under-repair', 'lost', 'disposed', 'sold', 'archived'];
const STATUS_LABELS: Record<string, string> = {
  active: 'Active', available: 'Available', deployed: 'Deployed', borrowed: 'Borrowed',
  reserved: 'Reserved', returned: 'Returned', 'under-repair': 'Under Repair',
  lost: 'Lost', disposed: 'Disposed', sold: 'Sold', archived: 'Archived',
};
const CONDITION_OPTIONS = ['new', 'good', 'fair', 'poor', 'damaged', 'defective', 'for-repair', 'refurbished', 'unknown'];
const CONDITION_LABELS: Record<string, string> = {
  new: 'New', good: 'Good', fair: 'Fair', poor: 'Poor', damaged: 'Damaged',
  defective: 'Defective', 'for-repair': 'For Repair', refurbished: 'Refurbished', unknown: 'Unknown',
};

const STATUS_COLOR: Record<string, string> = {
  active:      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  available:   'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
  deployed:    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
  borrowed:    'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100',
  reserved:    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
  returned:    'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
  'under-repair': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  lost:        'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
  disposed:    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100',
  sold:        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  archived:    'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300',
};

const MOVEMENT_COLOR: Record<string, string> = {
  stock_in: 'bg-green-100 text-green-800', stock_out: 'bg-red-100 text-red-800',
  adjustment: 'bg-blue-100 text-blue-800', returned: 'bg-teal-100 text-teal-800',
  damaged: 'bg-orange-100 text-orange-800', transfer: 'bg-purple-100 text-purple-800',
  opening_stock: 'bg-indigo-100 text-indigo-800', deployment: 'bg-cyan-100 text-cyan-800',
  repair: 'bg-yellow-100 text-yellow-800', disposal: 'bg-gray-100 text-gray-800',
  borrowed: 'bg-violet-100 text-violet-800', lost: 'bg-rose-100 text-rose-800',
};

const MOVEMENT_LABEL: Record<string, string> = {
  stock_in: 'Stock In', stock_out: 'Stock Out', adjustment: 'Adjustment',
  returned: 'Returned', damaged: 'Damaged', transfer: 'Transfer',
  opening_stock: 'Opening Stock', deployment: 'Deployment', repair: 'Repair',
  disposal: 'Disposal', borrowed: 'Borrowed', lost: 'Lost',
};

const emptyForm = {
  assetTag: '', barcode: '', brand: '', itemType: '', modelNumber: '',
  serialNumber: '', macId: '', dateStock: '', condition: 'new',
  warrantyExpiry: '', warrantyNotes: '', currentStatus: 'active',
  currentLocationId: '', custodian: '', lastCheckedDate: '', checkedBy: '', notes: '',
};

function FilterDropdown({
  label, value, onChange,
  options, // { id: string; name: string }[]
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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm text-[var(--text)] font-medium">{value || '—'}</p>
    </div>
  );
}

export default function InventoryItems() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const routeState = (routeLocation.state as any) || {};
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Drawer
  const [drawerItem, setDrawerItem] = useState<any | null>(null);
  const [drawerMovements, setDrawerMovements] = useState<any[]>([]);
  const [drawerMovementsLoading, setDrawerMovementsLoading] = useState(false);
  const [mvSearch, setMvSearch] = useState('');
  const [mvPageSize, setMvPageSize] = useState(20);
  const [mvPage, setMvPage] = useState(1);

  // Edit form (inline, not a drawer)
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  // Filters — main
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState(routeState.filterStatus ?? '');
  const [filterCondition, setFilterCondition] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterWarranty, setFilterWarranty] = useState(routeState.filterWarranty ?? '');
  // Filters — advanced
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterAssignment, setFilterAssignment] = useState('');
  const [filterStockLevel, setFilterStockLevel] = useState('');
  const [filterDateRange, setFilterDateRange] = useState('');
  const [filterIdentifier, setFilterIdentifier] = useState('');
  const [filterCustodian, setFilterCustodian] = useState('');
  const [filterItemType, setFilterItemType] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterAuditStatus, setFilterAuditStatus] = useState('');
  const [filterDateAdded, setFilterDateAdded] = useState('');
  const [filterMovementType, setFilterMovementType] = useState('');
  const [filterCostStatus, setFilterCostStatus] = useState('');
  const [filterDataQuality, setFilterDataQuality] = useState(routeState.filterDataQuality ?? '');
  const [sortBy, setSortBy] = useState('recently-added');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = async () => {
    try {
      const [itemsRes, productsRes, locationsRes, categoriesRes, deptsRes] = await Promise.all([
        stockDetailsApi.getAll(),
        productsApi.getAll(),
        locationsApi.getAll(),
        categoriesApi.getAll(),
        (user.role === 'superadmin' || (user.role === 'admin' && localStorage.getItem('currentDepartmentId') === ALL_DEPARTMENTS_ID)) ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
      ]);
      setItems(itemsRes.data);
      setAllProducts(productsRes.data);
      setLocations(locationsRes.data);
      setAllCategories(categoriesRes.data);
      setAllDepartments(deptsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openDrawer = async (item: any) => {
    setDrawerItem(item);
    setEditingItem(null);
    setDrawerMovements([]);
    setMvSearch(''); setMvPage(1); setMvPageSize(20);
    setDrawerMovementsLoading(true);
    try {
      const res = await stockDetailsApi.getMovements(item.id);
      setDrawerMovements(res.data);
    } catch { /* ignore */ } finally {
      setDrawerMovementsLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerItem(null);
    setEditingItem(null);
    setDrawerMovements([]);
    setMvSearch(''); setMvPage(1); setMvPageSize(20);
  };

  const openEdit = (item: any) => {
    setFormData({
      assetTag: item.assetTag || '',
      barcode: item.barcode || '',
      brand: item.brand || '',
      itemType: item.itemType || '',
      modelNumber: item.modelNumber || '',
      serialNumber: item.serialNumber || '',
      macId: item.macId || '',
      dateStock: item.dateStock ? new Date(item.dateStock).toISOString().split('T')[0] : '',
      condition: item.condition || 'new',
      warrantyExpiry: item.warrantyExpiry ? new Date(item.warrantyExpiry).toISOString().split('T')[0] : '',
      warrantyNotes: item.warrantyNotes || '',
      currentStatus: item.currentStatus || 'active',
      currentLocationId: item.currentLocationId || '',
      custodian: item.custodian || '',
      lastCheckedDate: item.lastCheckedDate ? new Date(item.lastCheckedDate).toISOString().split('T')[0] : '',
      checkedBy: item.checkedBy || '',
      notes: item.notes || '',
    });
    setEditingItem(item);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await stockDetailsApi.update(editingItem.id, {
        ...formData,
        currentLocationId: formData.currentLocationId || null,
        dateStock: formData.dateStock || null,
        warrantyExpiry: formData.warrantyExpiry || null,
        lastCheckedDate: formData.lastCheckedDate || null,
        assetTag: formData.assetTag || null,
        barcode: formData.barcode || null,
      });
      await fetchData();
      // refresh drawer if open for same item
      if (drawerItem?.id === editingItem.id) {
        const res = await stockDetailsApi.getById(editingItem.id);
        setDrawerItem(res.data);
      }
      setEditingItem(null);
      setFormError('');
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to update item');
    }
  };

  const filtered = items.filter(item => {
    if (filterCategory && item.product?.categoryId !== filterCategory) return false;
    if (filterProduct && item.productId !== filterProduct) return false;
    if (filterStatus && item.currentStatus !== filterStatus) return false;
    if (filterCondition && item.condition !== filterCondition) return false;
    if (filterLocation && item.currentLocationId !== filterLocation) return false;
    if (filterDepartment && item.product?.departmentId !== filterDepartment) return false;

    if (filterStockLevel) {
      const inStock = ['active', 'available'].includes(item.currentStatus);
      const outStock = ['disposed', 'sold', 'lost'].includes(item.currentStatus);
      if (filterStockLevel === 'in-stock' && !inStock) return false;
      if (filterStockLevel === 'out-of-stock' && !outStock) return false;
      if (filterStockLevel === 'low-stock' && (inStock || outStock)) return false;
      if (filterStockLevel === 'overstock' && item.currentStatus !== 'available') return false;
      if (filterStockLevel === 'negative-stock' && (item.quantity ?? 1) >= 0) return false;
    }

    if (filterWarranty) {
      const now = Date.now();
      const soon = now + 90 * 24 * 60 * 60 * 1000;
      const exp = item.warrantyExpiry ? new Date(item.warrantyExpiry).getTime() : null;
      if (filterWarranty === 'under-warranty' && !(exp && exp > now)) return false;
      if (filterWarranty === 'expiring-soon' && !(exp && exp > now && exp <= soon)) return false;
      if (filterWarranty === 'expired' && !(exp && exp <= now)) return false;
      if (filterWarranty === 'no-date' && exp !== null) return false;
    }

    if (filterAssignment) {
      if (filterAssignment === 'unassigned' && item.custodian) return false;
      if (filterAssignment === 'assigned-person' && !item.custodian) return false;
      if (filterAssignment === 'assigned-location' && !item.currentLocationId) return false;
      if (filterAssignment === 'borrowed' && item.currentStatus !== 'borrowed') return false;
      if (filterAssignment === 'returned' && item.currentStatus !== 'returned') return false;
    }

    if (filterDateRange) {
      const received = item.dateStock ? new Date(item.dateStock).getTime() : null;
      const now = Date.now();
      if (filterDateRange === 'today' && !(received && now - received < 86400000)) return false;
      if (filterDateRange === 'this-week' && !(received && now - received < 7 * 86400000)) return false;
      if (filterDateRange === 'this-month' && !(received && now - received < 30 * 86400000)) return false;
      if (filterDateRange === 'last-3-months' && !(received && now - received < 90 * 86400000)) return false;
      if (filterDateRange === 'this-year' && !(received && now - received < 365 * 86400000)) return false;
      if (filterDateRange === 'older-1-year' && !(received && now - received >= 365 * 86400000)) return false;
      if (filterDateRange === 'no-date' && received !== null) return false;
    }

    if (filterIdentifier) {
      if (filterIdentifier === 'has-asset-tag' && !item.assetTag) return false;
      if (filterIdentifier === 'no-asset-tag' && item.assetTag) return false;
      if (filterIdentifier === 'has-barcode' && !item.barcode) return false;
      if (filterIdentifier === 'no-barcode' && item.barcode) return false;
      if (filterIdentifier === 'has-serial' && !item.serialNumber) return false;
      if (filterIdentifier === 'no-serial' && item.serialNumber) return false;
      if (filterIdentifier === 'has-mac' && !item.macId) return false;
      if (filterIdentifier === 'no-mac' && item.macId) return false;
    }

    if (filterCustodian) {
      if (filterCustodian === 'unassigned' && item.custodian) return false;
      if (filterCustodian === 'assigned' && !item.custodian) return false;
      if (filterCustodian === 'assigned-person' && !item.custodian) return false;
      if (filterCustodian === 'assigned-department' && !item.departmentId) return false;
      if (filterCustodian === 'assigned-location' && !item.currentLocationId) return false;
    }

    if (filterItemType && (item.itemType || '').toLowerCase() !== filterItemType) return false;

    if (filterBrand) {
      if (filterBrand === 'no-brand' && item.brand) return false;
      else if (filterBrand !== 'no-brand' && (item.brand || '').toLowerCase() !== filterBrand) return false;
    }

    if (filterSupplier) {
      if (filterSupplier === 'with-supplier' && !item.supplier) return false;
      if (filterSupplier === 'no-supplier' && item.supplier) return false;
    }

    if (filterAuditStatus) {
      const now = Date.now();
      const checked = item.lastCheckedDate ? new Date(item.lastCheckedDate).getTime() : null;
      if (filterAuditStatus === 'checked-today' && !(checked && now - checked < 86400000)) return false;
      if (filterAuditStatus === 'checked-week' && !(checked && now - checked < 7 * 86400000)) return false;
      if (filterAuditStatus === 'checked-month' && !(checked && now - checked < 30 * 86400000)) return false;
      if (filterAuditStatus === 'not-checked-month' && checked && now - checked < 30 * 86400000) return false;
      if (filterAuditStatus === 'not-checked-3months' && checked && now - checked < 90 * 86400000) return false;
      if (filterAuditStatus === 'never-checked' && checked !== null) return false;
      if (filterAuditStatus === 'missing-checked-by' && item.checkedBy) return false;
    }

    if (filterDateAdded) {
      const now = Date.now();
      const added = item.createdAt ? new Date(item.createdAt).getTime() : null;
      if (filterDateAdded === 'today' && !(added && now - added < 86400000)) return false;
      if (filterDateAdded === 'this-week' && !(added && now - added < 7 * 86400000)) return false;
      if (filterDateAdded === 'this-month' && !(added && now - added < 30 * 86400000)) return false;
      if (filterDateAdded === 'last-3-months' && !(added && now - added < 90 * 86400000)) return false;
      if (filterDateAdded === 'this-year' && !(added && now - added < 365 * 86400000)) return false;
      if (filterDateAdded === 'older-1-year' && !(added && now - added >= 365 * 86400000)) return false;
    }

    if (filterMovementType) {
      if (filterMovementType === 'no-movement' && item.movements?.length > 0) return false;
      if (filterMovementType !== 'no-movement') {
        const hasType = item.movements?.some((m: any) => m.type === filterMovementType);
        if (!hasType) return false;
      }
    }

    if (filterCostStatus) {
      const cost = parseFloat(item.unitCost ?? item.cost ?? 0);
      if (filterCostStatus === 'with-cost' && !(cost > 0)) return false;
      if (filterCostStatus === 'missing-cost' && item.unitCost != null) return false;
      if (filterCostStatus === 'zero-cost' && cost !== 0) return false;
      if (filterCostStatus === 'high-value' && cost < 10000) return false;
      if (filterCostStatus === 'low-value' && cost >= 10000) return false;
    }

    if (filterDataQuality) {
      const mac = item.macId || '';
      const isTestData = ['test', 'n/a', 'none', 'unknown', '-', '—'].includes((item.assetTag || '').toLowerCase()) ||
        ['test', 'n/a', 'none'].includes((item.brand || '').toLowerCase());
      const isInvalidMac = mac && mac === '00:00:00:00:00:00';
      if (filterDataQuality === 'complete' && (!item.assetTag || !item.serialNumber || !item.currentLocationId)) return false;
      if (filterDataQuality === 'incomplete' && item.assetTag && item.serialNumber && item.currentLocationId) return false;
      if (filterDataQuality === 'no-asset-tag' && item.assetTag) return false;
      if (filterDataQuality === 'no-barcode' && item.barcode) return false;
      if (filterDataQuality === 'no-serial' && item.serialNumber) return false;
      if (filterDataQuality === 'no-mac' && item.macId) return false;
      if (filterDataQuality === 'invalid-mac' && !isInvalidMac) return false;
      if (filterDataQuality === 'no-supplier' && item.supplier) return false;
      if (filterDataQuality === 'no-cost' && (item.unitCost != null && parseFloat(item.unitCost) > 0)) return false;
      if (filterDataQuality === 'no-location' && item.currentLocationId) return false;
      if (filterDataQuality === 'test-data' && !isTestData) return false;
    }

    if (search) {
      const q = search.toLowerCase();
      return (
        item.stockId?.toLowerCase().includes(q) ||
        item.assetTag?.toLowerCase().includes(q) ||
        item.product?.name?.toLowerCase().includes(q) ||
        item.serialNumber?.toLowerCase().includes(q) ||
        item.macId?.toLowerCase().includes(q) ||
        item.modelNumber?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return (a.product?.name || '').localeCompare(b.product?.name || '');
    if (sortBy === 'asset-tag') return (a.assetTag || '').localeCompare(b.assetTag || '');
    if (sortBy === 'status') return (a.currentStatus || '').localeCompare(b.currentStatus || '');
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = items.filter(i => i.currentStatus === s).length;
    return acc;
  }, {} as Record<string, number>);

  const showDept = localStorage.getItem('currentDepartmentId') === ALL_DEPARTMENTS_ID;

  if (loading) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Inventory Items</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {items.length} total ·{' '}
          <span className="text-green-600">{statusCounts.active} active</span> ·{' '}
          <span className="text-cyan-600">{statusCounts.deployed} deployed</span> ·{' '}
          <span className="text-yellow-600">{statusCounts['under-repair']} under repair</span> ·{' '}
          <span className="text-rose-600">{statusCounts.lost} lost</span>
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Each row is one physical unit. Click any row to view details and edit.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Row 1: Search + Sort + Clear */}
        <div className="flex gap-2">
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search ID, asset tag, serial, MAC, barcode..."
            className="flex-1 px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" />
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
            <option value="recently-added">Sort: Recently Added</option>
            <option value="name">Sort: Product Name</option>
            <option value="asset-tag">Sort: Asset Tag</option>
            <option value="status">Sort: Status</option>
          </select>
          <button type="button" onClick={() => {
            setSearch(''); setFilterCategory(''); setFilterProduct(''); setFilterStatus('');
            setFilterCondition(''); setFilterLocation(''); setFilterWarranty('');
            setFilterDepartment(''); setFilterAssignment(''); setFilterStockLevel('');
            setFilterDateRange(''); setFilterIdentifier('');
            setFilterCustodian(''); setFilterItemType(''); setFilterBrand(''); setFilterSupplier('');
            setFilterAuditStatus(''); setFilterDateAdded(''); setFilterMovementType('');
            setFilterCostStatus(''); setFilterDataQuality('');
            setSortBy('recently-added'); setCurrentPage(1);
          }} className="px-3 py-2 text-xs border border-[var(--border)] rounded hover:bg-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] font-medium whitespace-nowrap">
            Clear
          </button>
        </div>

        {/* Main filters — 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Categories</option>
            {allCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <FilterDropdown
            label="All Products"
            value={filterProduct}
            onChange={v => { setFilterProduct(v); setCurrentPage(1); }}
            options={allProducts.map(p => ({ id: p.id, name: p.name }))}
          />
          <FilterDropdown
            label="All Locations"
            value={filterLocation}
            onChange={v => { setFilterLocation(v); setCurrentPage(1); }}
            options={locations.map(l => ({ id: l.id, name: l.name }))}
          />
        </div>

        {/* Advanced filters toggle */}
        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          className="text-xs text-[var(--primary)] hover:underline text-left font-medium w-fit">
          {showAdvanced ? '▲ Hide Advanced Filters' : '▼ Advanced Filters'}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]">
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={filterCondition} onChange={e => { setFilterCondition(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Conditions</option>
              {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
            </select>
            <select value={filterWarranty} onChange={e => { setFilterWarranty(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Warranty</option>
              <option value="under-warranty">Under Warranty</option>
              <option value="expiring-soon">Expiring Soon (90 days)</option>
              <option value="expired">Expired Warranty</option>
              <option value="no-date">No Warranty Date</option>
            </select>
            <select value={filterAssignment} onChange={e => { setFilterAssignment(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Assignment</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned-person">Assigned to Person</option>
              <option value="assigned-location">Assigned to Location</option>
              <option value="borrowed">Borrowed</option>
              <option value="returned">Returned</option>
            </select>
            <select value={filterStockLevel} onChange={e => { setFilterStockLevel(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Stock Levels</option>
              <option value="in-stock">In Stock</option>
              <option value="low-stock">Low Stock</option>
              <option value="out-of-stock">Out of Stock</option>
              <option value="overstock">Overstock</option>
              <option value="negative-stock">Negative Stock</option>
            </select>
            <select value={filterDateRange} onChange={e => { setFilterDateRange(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Date Received</option>
              <option value="today">Received Today</option>
              <option value="this-week">Received This Week</option>
              <option value="this-month">Received This Month</option>
              <option value="last-3-months">Last 3 Months</option>
              <option value="this-year">This Year</option>
              <option value="older-1-year">Older Than 1 Year</option>
              <option value="no-date">No Date Received</option>
            </select>
            <select value={filterIdentifier} onChange={e => { setFilterIdentifier(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Identifiers</option>
              <option value="has-asset-tag">Has Asset Tag</option>
              <option value="no-asset-tag">Missing Asset Tag</option>
              <option value="has-barcode">Has Barcode</option>
              <option value="no-barcode">Missing Barcode</option>
              <option value="has-serial">Has Serial Number</option>
              <option value="no-serial">Missing Serial Number</option>
              <option value="has-mac">Has MAC Address</option>
              <option value="no-mac">Missing MAC Address</option>
            </select>
            <select value={filterCustodian} onChange={e => { setFilterCustodian(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Custodians</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="assigned-person">Assigned to Person</option>
              <option value="assigned-department">Assigned to Department</option>
              <option value="assigned-location">Assigned to Location</option>
            </select>
            <select value={filterItemType} onChange={e => { setFilterItemType(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Item Types</option>
              <option value="equipment">Equipment</option>
              <option value="consumable">Consumable</option>
              <option value="tool">Tool</option>
              <option value="furniture">Furniture</option>
              <option value="network device">Network Device</option>
              <option value="computer device">Computer Device</option>
              <option value="accessory">Accessory</option>
              <option value="spare part">Spare Part</option>
              <option value="others">Others</option>
            </select>
            <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Brands</option>
              <option value="tp-link">TP-Link</option>
              <option value="ubiquiti">Ubiquiti</option>
              <option value="mikrotik">MikroTik</option>
              <option value="vsol">VSOL</option>
              <option value="dell">Dell</option>
              <option value="hp">HP</option>
              <option value="lenovo">Lenovo</option>
              <option value="samsung">Samsung</option>
              <option value="generic">Generic</option>
              <option value="no-brand">No Brand</option>
              <option value="others">Others</option>
            </select>
            <select value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Suppliers</option>
              <option value="with-supplier">With Supplier</option>
              <option value="no-supplier">No Supplier</option>
            </select>
            <select value={filterAuditStatus} onChange={e => { setFilterAuditStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Audit Status</option>
              <option value="checked-today">Checked Today</option>
              <option value="checked-week">Checked This Week</option>
              <option value="checked-month">Checked This Month</option>
              <option value="not-checked-month">Not Checked This Month</option>
              <option value="not-checked-3months">Not Checked Last 3 Months</option>
              <option value="never-checked">Never Checked</option>
              <option value="missing-checked-by">Missing Checked By</option>
            </select>
            <select value={filterDateAdded} onChange={e => { setFilterDateAdded(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Date Added</option>
              <option value="today">Added Today</option>
              <option value="this-week">Added This Week</option>
              <option value="this-month">Added This Month</option>
              <option value="last-3-months">Added Last 3 Months</option>
              <option value="this-year">Added This Year</option>
              <option value="older-1-year">Older Than 1 Year</option>
            </select>
            <select value={filterMovementType} onChange={e => { setFilterMovementType(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Movement Types</option>
              <option value="opening_stock">Opening Stock</option>
              <option value="stock_in">Received</option>
              <option value="deployment">Deployed</option>
              <option value="transfer">Transferred</option>
              <option value="borrowed">Borrowed</option>
              <option value="returned">Returned</option>
              <option value="repair">Repair</option>
              <option value="disposal">Disposed</option>
              <option value="stock_out">Sold</option>
              <option value="adjustment">Adjustment</option>
              <option value="no-movement">No Movement History</option>
            </select>
            <select value={filterCostStatus} onChange={e => { setFilterCostStatus(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Cost Status</option>
              <option value="with-cost">With Cost</option>
              <option value="missing-cost">Missing Cost</option>
              <option value="zero-cost">Zero Cost</option>
              <option value="high-value">High Value (≥ ₱10,000)</option>
              <option value="low-value">Low Value (&lt; ₱10,000)</option>
            </select>
            <select value={filterDataQuality} onChange={e => { setFilterDataQuality(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Data Quality</option>
              <option value="complete">Complete Records</option>
              <option value="incomplete">Incomplete Records</option>
              <option value="no-asset-tag">Missing Asset Tag</option>
              <option value="no-barcode">Missing Barcode</option>
              <option value="no-serial">Missing Serial Number</option>
              <option value="no-mac">Missing MAC Address</option>
              <option value="invalid-mac">Invalid MAC Address</option>
              <option value="no-supplier">Missing Supplier</option>
              <option value="no-cost">Missing Cost</option>
              <option value="no-location">Missing Location</option>
              <option value="test-data">Test / Placeholder Data</option>
            </select>
            {showDept && (
              <select value={filterDepartment} onChange={e => { setFilterDepartment(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
                <option value="">All Departments</option>
                {allDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
          <p className="text-[var(--text-muted)]">No inventory items found.</p>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className={`hidden md:grid gap-4 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)] ${showDept ? 'md:grid-cols-8' : 'md:grid-cols-7'}`}>
            <div>Asset ID</div>
            <div>Product</div>
            <div>Serial No.</div>
            <div>MAC / Barcode</div>
            <div>Condition</div>
            <div>Status</div>
            <div>Location</div>
            {showDept && <div>Department</div>}
          </div>
          {paginated.map(item => (
            <div
              key={item.id}
              onClick={() => openDrawer(item)}
              className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
            >
              <div className={`flex-1 grid grid-cols-2 gap-4 text-sm min-w-0 ${showDept ? 'md:grid-cols-8' : 'md:grid-cols-7'}`}>
                <div>
                  <span className="font-mono text-xs text-[var(--primary)] font-semibold">{item.stockId || '—'}</span>
                  {item.assetTag && <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{item.assetTag}</p>}
                </div>
                <div className="truncate font-medium text-[var(--text)]">{item.product?.name || '—'}</div>
                <div className="truncate font-mono text-xs text-[var(--text-muted)]">{item.serialNumber || '—'}</div>
                <div className="truncate font-mono text-xs text-[var(--text-muted)]">{item.macId || item.barcode || '—'}</div>
                <div className="capitalize text-[var(--text-muted)] text-xs">{item.condition || '—'}</div>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[item.currentStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                    {STATUS_LABELS[item.currentStatus] ?? item.currentStatus}
                  </span>
                </div>
                <div className="truncate text-[var(--text-muted)]">{item.currentLocation?.name || '—'}</div>
                {showDept && <div className="truncate text-[var(--text-muted)]">{item.department?.name || item.product?.department?.name || '—'}</div>}
              </div>
              <ChevronRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
      </div>

      {/* Side Drawer */}
      {drawerItem && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-[var(--primary)] font-bold">{drawerItem.stockId}</span>
                  {drawerItem.assetTag && (
                    <span className="font-mono text-xs bg-[var(--surface-2)] px-2 py-0.5 rounded text-[var(--text-muted)]">{drawerItem.assetTag}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[drawerItem.currentStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                    {drawerItem.currentStatus}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)] mt-1 truncate">{drawerItem.product?.name}</h2>
                <p className="text-sm text-[var(--text-muted)]">{drawerItem.product?.category?.name || drawerItem.product?.sku}</p>
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

              {editingItem ? (
                /* Inline Edit Form */
                <form id="inventory-form" onSubmit={handleSubmit} className="space-y-5">
                  {/* Identification */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Identification</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { field: 'assetTag', label: 'Asset Tag', placeholder: 'IMS-2026-000001' },
                        { field: 'barcode', label: 'Barcode', placeholder: 'Barcode value' },
                        { field: 'brand', label: 'Brand', placeholder: 'e.g. Cisco' },
                        { field: 'itemType', label: 'Item Type', placeholder: 'e.g. Hardware' },
                        { field: 'modelNumber', label: 'Model Number', placeholder: 'e.g. Archer C24' },
                        { field: 'serialNumber', label: 'Serial Number', placeholder: 'SN123456' },
                        { field: 'macId', label: 'MAC Address', placeholder: '00:1A:2B:3C:4D:5E' },
                      ].map(({ field, label, placeholder }) => (
                        <div key={field}>
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
                          <input type="text" value={(formData as any)[field]}
                            onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                            placeholder={placeholder}
                            className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Condition & Status */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Condition & Status</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Condition</label>
                        <select value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                          {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Status</label>
                        <select value={formData.currentStatus} onChange={e => setFormData({ ...formData, currentStatus: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {/* Location & Custodian */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Location & Assignment</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Location</label>
                        <select value={formData.currentLocationId} onChange={e => setFormData({ ...formData, currentLocationId: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                          <option value="">— No location —</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Assigned To / Custodian</label>
                        <input type="text" value={formData.custodian}
                          onChange={e => setFormData({ ...formData, custodian: e.target.value })}
                          placeholder="Name of responsible person"
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    </div>
                  </div>
                  {/* Dates */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Dates & Checks</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Date Received</label>
                        <input type="date" value={formData.dateStock}
                          onChange={e => setFormData({ ...formData, dateStock: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Last Checked Date</label>
                        <input type="date" value={formData.lastCheckedDate}
                          onChange={e => setFormData({ ...formData, lastCheckedDate: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Checked By</label>
                        <input type="text" value={formData.checkedBy}
                          onChange={e => setFormData({ ...formData, checkedBy: e.target.value })}
                          placeholder="Name of person who checked"
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    </div>
                  </div>
                  {/* Warranty */}
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Warranty</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Warranty Expiry</label>
                        <input type="date" value={formData.warrantyExpiry}
                          onChange={e => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Warranty Notes</label>
                        <input type="text" value={formData.warrantyNotes}
                          onChange={e => setFormData({ ...formData, warrantyNotes: e.target.value })}
                          placeholder="Warranty details..."
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    </div>
                  </div>
                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notes</label>
                    <textarea value={formData.notes} rows={2}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Additional notes..."
                      className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                </form>
              ) : (
                <>
                  {/* Item Info */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Item Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Item Name" value={drawerItem.product?.name} />
                      <Field label="Category" value={drawerItem.product?.category?.name} />
                      <Field label="Item Type" value={drawerItem.itemType} />
                      <Field label="Brand" value={drawerItem.brand} />
                      <Field label="Model Number" value={drawerItem.modelNumber} />
                      <Field label="Asset Tag" value={drawerItem.assetTag} />
                      <Field label="Barcode" value={drawerItem.barcode} />
                    </div>
                  </section>

                  {/* Stock */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Stock</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Quantity" value="1" />
                      <Field label="Unit" value={drawerItem.product?.unit} />
                      <Field label="Condition" value={drawerItem.condition ? drawerItem.condition.charAt(0).toUpperCase() + drawerItem.condition.slice(1) : null} />
                      <Field label="Status" value={drawerItem.currentStatus} />
                    </div>
                  </section>

                  {/* Tracking IDs */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Tracking IDs</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Serial Number" value={drawerItem.serialNumber} />
                      <Field label="MAC Address" value={drawerItem.macId} />
                    </div>
                  </section>

                  {/* Location */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Location & Assignment</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Location" value={drawerItem.currentLocation?.name} />
                      <Field label="Department" value={drawerItem.product?.department?.name} />
                      <Field label="Assigned To / Custodian" value={drawerItem.custodian} />
                    </div>
                  </section>

                  {/* Procurement */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Procurement</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Supplier / Vendor" value={drawerItem.product?.supplier} />
                      <Field label="Date Received" value={drawerItem.dateStock ? new Date(drawerItem.dateStock).toLocaleDateString() : null} />
                      <Field label="Unit Cost" value={drawerItem.product?.unitPrice ? `₱${Number(drawerItem.product.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
                      <Field label="Total Cost" value={drawerItem.product?.unitPrice ? `₱${Number(drawerItem.product.unitPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null} />
                    </div>
                  </section>

                  {/* Warranty */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Warranty</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Warranty Expiry" value={drawerItem.warrantyExpiry ? new Date(drawerItem.warrantyExpiry).toLocaleDateString() : null} />
                      <Field label="Warranty Notes" value={drawerItem.warrantyNotes} />
                    </div>
                  </section>

                  {/* Audit */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Audit</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Last Checked Date" value={drawerItem.lastCheckedDate ? new Date(drawerItem.lastCheckedDate).toLocaleDateString() : null} />
                      <Field label="Checked By" value={drawerItem.checkedBy} />
                      <Field label="Date Added" value={new Date(drawerItem.createdAt).toLocaleDateString()} />
                    </div>
                  </section>

                  {/* Notes */}
                  {drawerItem.notes && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notes</h3>
                      <p className="text-sm text-[var(--text)]">{drawerItem.notes}</p>
                    </section>
                  )}

                  {/* Movement History */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Movement History</h3>
                    {drawerMovementsLoading ? (
                      <p className="text-sm text-[var(--text-muted)]">Loading…</p>
                    ) : (() => {
                      const q = mvSearch.toLowerCase();
                      const filtered = drawerMovements.filter(mi =>
                        !q ||
                        mi.movement?.movementNo?.toLowerCase().includes(q) ||
                        (MOVEMENT_LABEL[mi.movement?.movementType] ?? mi.movement?.movementType ?? '').toLowerCase().includes(q) ||
                        mi.fromLocation?.name?.toLowerCase().includes(q) ||
                        mi.toLocation?.name?.toLowerCase().includes(q) ||
                        mi.reason?.toLowerCase().includes(q)
                      );
                      const totalPages = Math.max(1, Math.ceil(filtered.length / mvPageSize));
                      const paged = filtered.slice((mvPage - 1) * mvPageSize, mvPage * mvPageSize);
                      return (
                        <>
                          <div className="flex gap-2 mb-3">
                            <input type="text" value={mvSearch} placeholder="Search movements…"
                              onChange={e => { setMvSearch(e.target.value); setMvPage(1); }}
                              className="flex-1 px-2 py-1.5 text-xs border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]" />
                            <select value={mvPageSize} onChange={e => { setMvPageSize(Number(e.target.value)); setMvPage(1); }}
                              className="px-2 py-1.5 text-xs border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                            </select>
                            <button type="button" onClick={() => { setMvSearch(''); setMvPage(1); setMvPageSize(20); }}
                              className="px-2 py-1.5 text-xs border border-[var(--border)] rounded bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--border)]">
                              Clear
                            </button>
                          </div>
                          {filtered.length === 0 ? (
                            <p className="text-sm text-[var(--text-muted)]">No movements recorded.</p>
                          ) : (
                            <div className="space-y-2">
                              {paged.map(mi => (
                                <div key={mi.id} className="flex items-start gap-3 p-3 bg-[var(--surface-2)] rounded-lg">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${MOVEMENT_COLOR[mi.movement?.movementType] ?? 'bg-gray-100 text-gray-800'}`}>
                                    {MOVEMENT_LABEL[mi.movement?.movementType] ?? mi.movement?.movementType}
                                  </span>
                                  <div className="flex-1 min-w-0 text-xs text-[var(--text-muted)]">
                                    <p className="font-medium text-[var(--text)]">{mi.movement?.movementNo ?? '—'}</p>
                                    {(mi.fromLocation || mi.toLocation) && (
                                      <p>{mi.fromLocation?.name ?? '?'} → {mi.toLocation?.name ?? '?'}</p>
                                    )}
                                    {mi.reason && <p className="italic">{mi.reason}</p>}
                                    <p>{new Date(mi.createdAt).toLocaleDateString()} · qty {mi.quantity}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-3 text-xs text-[var(--text-muted)]">
                              <span>{filtered.length} total · page {mvPage}/{totalPages}</span>
                              <div className="flex gap-1">
                                <button type="button" disabled={mvPage === 1} onClick={() => setMvPage(p => p - 1)}
                                  className="px-2 py-1 border border-[var(--border)] rounded disabled:opacity-40 hover:bg-[var(--surface-2)]">‹</button>
                                <button type="button" disabled={mvPage === totalPages} onClick={() => setMvPage(p => p + 1)}
                                  className="px-2 py-1 border border-[var(--border)] rounded disabled:opacity-40 hover:bg-[var(--surface-2)]">›</button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </section>
                </>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
              {editingItem ? (
                <>
                  <button type="submit" form="inventory-form"
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
                  {user.role !== 'superadmin' && (
                    <button
                      onClick={() => openEdit(drawerItem)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      <Edit size={14} /> Edit Details
                    </button>
                  )}
                  <button
                    onClick={() => { closeDrawer(); navigate('/stock-movements'); }}
                    className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    <ArrowLeftRight size={14} /> Move Item
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
