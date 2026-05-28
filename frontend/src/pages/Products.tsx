import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Edit, Trash2, Plus, ChevronRight } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi, deleteRequestsApi, departmentsApi } from '@/services/api';
import Pagination from '@/components/Pagination';
import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort } from '@/types/filters';
import { validateProductName, validateStock } from '@/utils/validation';
import { formatDate, formatPhp } from '@/utils/ids';
import { filterAndSortProducts, clearProductFilters, UNASSIGNED_LOCATION } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

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
  sku: '', name: '', description: '', categoryId: '', locationId: '', unit: 'pcs',
  currentStock: 0, lowStockThreshold: 10, supplier: '', unitPrice: 0,
  status: 'active', expiryDate: '', leadTimeDays: 0, notes: '',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  discontinued: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  obsolete: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  'on-backorder': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, '0');

  return [
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    date.getFullYear(),
  ].join('/') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export default function Products() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const routeState = (routeLocation.state as any) || {};
  const [filters, setFilters] = useState<ProductFilter>({
    search: routeState.search ?? '', categoryId: undefined, locationId: routeState.locationId ?? undefined, stockStatus: routeState.stockStatus ?? undefined, departmentId: undefined, unit: undefined, dateRange: 'all',
  });
  const [sort, setSort] = useState<ProductSort>({ field: 'date', order: 'desc' });
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [drawerMovements, setDrawerMovements] = useState<any[]>([]);
  const [drawerMovementsLoading, setDrawerMovementsLoading] = useState(false);
  const [mvSearch, setMvSearch] = useState('');
  const [mvPageSize, setMvPageSize] = useState(20);
  const [mvPage, setMvPage] = useState(1);
  const currentDepartmentId = localStorage.getItem('currentDepartmentId');
  const showDepartmentFilter = user.role === 'superadmin' || (user.role === 'admin' && currentDepartmentId === ALL_DEPARTMENTS_ID);

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, locationsRes, deptRes] = await Promise.all([
        productsApi.getAll(), categoriesApi.getAll(), locationsApi.getAll(),
        showDepartmentFilter ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setLocations(locationsRes.data);
      setDepartments(deptRes.data);
    } catch {
      console.error('Failed to fetch products');
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

  const buildFormData = (product: Product) => ({
    sku: product.sku,
    name: product.name,
    description: product.description || '',
    categoryId: product.categoryId,
    locationId: product.locationId || '',
    unit: product.unit,
    currentStock: product.currentStock,
    lowStockThreshold: product.lowStockThreshold,
    supplier: product.supplier || '',
    unitPrice: product.unitPrice ? parseFloat(product.unitPrice.toString()) : 0,
    status: product.status || 'active',
    expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString().split('T')[0] : '',
    leadTimeDays: product.leadTimeDays ? parseInt(product.leadTimeDays.toString()) : 0,
    notes: product.notes || '',
  });

  const openNewDrawer = () => {
    setSelectedItem(null);
    setEditingItem(null);
    setFormData(emptyForm);
    setFormError('');
    setIsCreating(true);
    setConfirmingDelete(false);
    setIsDrawerOpen(true);
  };

  const openViewDrawer = async (product: Product) => {
    setSelectedItem(product);
    setEditingItem(null);
    setIsCreating(false);
    setFormError('');
    setConfirmingDelete(false);
    setDrawerMovements([]);
    setMvSearch(''); setMvPage(1); setMvPageSize(20);
    setIsDrawerOpen(true);
    setDrawerMovementsLoading(true);
    try {
      const res = await productsApi.getMovements(product.id);
      setDrawerMovements(res.data);
    } catch { /* ignore */ } finally {
      setDrawerMovementsLoading(false);
    }
  };

  const openEdit = (product: Product) => {
    setSelectedItem(product);
    setEditingItem(product);
    setIsCreating(false);
    setFormData(buildFormData(product));
    setFormError('');
    setIsDrawerOpen(true);
  };

  const cancelEdit = () => {
    if (isCreating) { closeDrawer(); return; }
    setEditingItem(null);
    setFormError('');
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedItem(null);
    setEditingItem(null);
    setIsCreating(false);
    setConfirmingDelete(false);
    setFormData(emptyForm);
    setFormError('');
    setDrawerMovements([]);
    setMvSearch(''); setMvPage(1); setMvPageSize(20);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProductName(formData.name)) { setFormError('Invalid product name'); return; }
    if (!formData.categoryId) { setFormError('Please select a category'); return; }
    if (!validateStock(formData.currentStock)) { setFormError('Invalid stock quantity'); return; }
    try {
      const payload = { ...formData, locationId: formData.locationId || null };
      if (editingItem) {
        const res = await productsApi.update(editingItem.id, payload);
        setSelectedItem(res.data ?? { ...editingItem, ...payload } as Product);
        setEditingItem(null);
        await fetchData();
      } else {
        await productsApi.create(payload);
        await fetchData();
        closeDrawer();
      }
      setFormError('');
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    setConfirmingDelete(true);
  };

  const doDelete = async () => {
    if (!selectedItem) return;
    try {
      await productsApi.delete(selectedItem.id);
      await fetchData();
      closeDrawer();
    } catch {
      setError('Failed to delete product');
      setConfirmingDelete(false);
    }
  };

  const handleRequestDelete = async (id: string, name: string) => {
    const reason = prompt('Reason for deletion (optional):');
    if (reason === null) return;
    try {
      await deleteRequestsApi.create({ entityType: 'product', entityId: id, entityName: name, reason: reason || '' });
    } catch {
      setError('Failed to submit delete request');
    }
  };

  const clearAllFilters = () => {
    setFilters(clearProductFilters());
    setSort({ field: 'date', order: 'desc' });
    setCurrentPage(1);
  };

  const negativeStockCount = products.filter(p => p.currentStock < 0).length;
  const outOfStockCount = products.filter(p => p.currentStock === 0).length;
  const lowStockCount = products.filter(p => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;

  const filteredProducts = filterAndSortProducts(products, filters, sort);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const uniqueUnits = Array.from(new Set(products.map(p => p.unit))).sort();
  const uniqueImportBatches = Array.from(new Set(products.map(p => (p as any).csvImportId).filter(Boolean))).sort();
  const categoriesMap = new Map(categories.map(c => [c.id, c]));
  const departmentsMap = new Map(departments.map(d => [d.id, d]));

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const filterContent = (
    <>
      {/* Row 1: Search + Sort + Clear */}
      <div className="flex gap-2">
        <input type="text" placeholder="Search by name or SKU…" value={filters.search}
          onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
        <select value={`${sort.field}:${sort.order}`} onChange={e => {
          const [field, order] = e.target.value.split(':');
          setSort({ field: field as ProductSort['field'], order: order as ProductSort['order'] });
          setCurrentPage(1);
        }} className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
          <option value="name:asc">Sort: Name</option>
          <option value="sku:asc">Sort: SKU</option>
          <option value="stock:desc">Sort: Stock (High)</option>
          <option value="low-stock:asc">Sort: Stock (Low)</option>
          <option value="date:desc">Sort: Recently Added</option>
        </select>
        <button onClick={clearAllFilters} className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">Clear</button>
      </div>

      {/* Row 2: Main filters — 3 columns */}
      <div className="grid grid-cols-3 gap-2">
        <select value={filters.categoryId || ''} onChange={e => { setFilters({ ...filters, categoryId: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <select value={filters.locationId || ''} onChange={e => { setFilters({ ...filters, locationId: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Locations</option>
          <option value={UNASSIGNED_LOCATION}>Unassigned</option>
          {locations
            .filter(loc => loc.name.trim().toLowerCase() !== 'unassigned')
            .map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <select value={filters.stockStatus || ''} onChange={e => { setFilters({ ...filters, stockStatus: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Stock Status</option>
          <option value="in-stock">In Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="overstock">Overstock</option>
          <option value="negative-stock">Negative Stock</option>
          <option value="no-stock-data">No Stock Data</option>
        </select>
      </div>

      {/* Advanced filters toggle */}
      <button type="button" onClick={() => setShowAdvanced(v => !v)}
        className="text-xs text-[var(--primary)] hover:underline text-left font-medium w-fit">
        {showAdvanced ? '▲ Hide Advanced Filters' : '▼ Advanced Filters'}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]">
          <select value={filters.unit || ''} onChange={e => { setFilters({ ...filters, unit: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Units</option>
            {uniqueUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          <select value={filters.productStatus || ''} onChange={e => { setFilters({ ...filters, productStatus: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Product Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
            <option value="discontinued">Discontinued</option>
            <option value="draft">Draft</option>
          </select>
          <select value={filters.priceStatus || ''} onChange={e => { setFilters({ ...filters, priceStatus: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Price Status</option>
            <option value="with-price">With Unit Price</option>
            <option value="zero-price">Zero Unit Price</option>
            <option value="missing-price">Missing Unit Price</option>
            <option value="high-price">High Unit Price (≥ ₱10,000)</option>
            <option value="low-price">Low Unit Price (&lt; ₱10,000)</option>
          </select>
          <select value={filters.valueStatus || ''} onChange={e => { setFilters({ ...filters, valueStatus: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Value Status</option>
            <option value="with-value">With Total Value</option>
            <option value="zero-value">Zero Total Value</option>
            <option value="high-value">High Value (≥ ₱50,000)</option>
            <option value="low-value">Low Value (&lt; ₱50,000)</option>
            <option value="missing">Missing Value</option>
          </select>
          <select value={filters.source || ''} onChange={e => { setFilters({ ...filters, source: e.target.value || undefined, csvImportId: undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="csv_import">Imported from CSV</option>
            <option value="unknown">Unknown</option>
          </select>
          {uniqueImportBatches.length > 0 && (
            <select value={filters.csvImportId || ''} onChange={e => { setFilters({ ...filters, csvImportId: e.target.value || undefined, source: e.target.value ? 'csv_import' : filters.source }); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Import Batches</option>
              {uniqueImportBatches.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          )}
          <select value={filters.dateAdded || ''} onChange={e => { setFilters({ ...filters, dateAdded: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Date Added</option>
            <option value="today">Added Today</option>
            <option value="yesterday">Added Yesterday</option>
            <option value="last-week">Added Last Week</option>
            <option value="last-month">Added Last Month</option>
            <option value="this-year">Added This Year</option>
            <option value="older-1-year">Older Than 1 Year</option>
          </select>
          <select value={filters.lastMovement || ''} onChange={e => { setFilters({ ...filters, lastMovement: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Last Movement</option>
            <option value="moved-today">Moved Today</option>
            <option value="moved-week">Moved This Week</option>
            <option value="moved-month">Moved This Month</option>
            <option value="moved-3months">Moved Last 3 Months</option>
            <option value="no-movement">No Movement History</option>
          </select>
          <select value={filters.dataQuality || ''} onChange={e => { setFilters({ ...filters, dataQuality: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Data Quality</option>
            <option value="complete">Complete Records</option>
            <option value="incomplete">Incomplete Records</option>
            <option value="missing-sku">Missing SKU</option>
            <option value="missing-category">Missing Category</option>
            <option value="missing-location">Missing Location</option>
            <option value="missing-unit">Missing Unit</option>
            <option value="missing-price">Missing Unit Price</option>
            <option value="zero-price">Zero Unit Price</option>
            <option value="missing-threshold">Missing Low Stock Threshold</option>
            <option value="test-data">Placeholder / Test Data</option>
          </select>
          {showDepartmentFilter && (
            <select value={filters.departmentId || ''} onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
              <option value="">All Departments</option>
              {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Header with stats */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Products</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {filteredProducts.length !== products.length
              ? <><span className="text-[var(--primary)] font-medium">{filteredProducts.length} filtered</span> of {products.length} products</>
              : <>{products.length} products</>
            } · <span className="text-yellow-600">{lowStockCount} low stock</span> · <span className="text-red-600">{outOfStockCount} out of stock</span>
            {negativeStockCount > 0 && <> · <span className="text-purple-600">{negativeStockCount} negative</span></>}
          </p>
        </div>
        {user.role !== 'superadmin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID && (
          <button
            onClick={openNewDrawer}
            className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)] transition-colors">
            <Plus size={20} /> Add Product
          </button>
        )}
      </div>

      <DataPageLayout
        title="Products"
        error={error}
        showForm={false}
        formContent={null}
        onAddClick={openNewDrawer}
        showAddButton={false}
        filterContent={filterContent}>
        <div className="space-y-0">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg">
              <p className="text-[var(--text-muted)]">No products found.</p>
            </div>
          ) : (
            <div className="space-y-0 border border-[var(--border)] rounded-lg overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-10 gap-4 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
                <div>SKU</div>
                <div>Name</div>
                <div>Category</div>
                <div>Location</div>
                <div>Department</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Total Value</div>
                <div>Status</div>
                <div className="text-right">Stock</div>
                <div>Date Added</div>
              </div>
              {paginatedProducts.map(product => {
                const category = product.category ?? categoriesMap.get(product.categoryId);
                const department = product.department ?? departmentsMap.get(product.departmentId);
                const isNegative = product.currentStock < 0;
                const isOut = product.currentStock === 0;
                const isLow = product.currentStock > 0 && product.currentStock <= product.lowStockThreshold;
                const totalValue = (product.unitPrice || 0) * product.currentStock;
                return (
                  <div
                    key={product.id}
                    onClick={() => openViewDrawer(product)}
                    className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-10 gap-4 text-sm min-w-0">
                      <div className="truncate">
                        <span className="font-mono text-xs text-[var(--text-muted)]">{product.sku}</span>
                      </div>
                      <div className="truncate font-medium text-[var(--text)]">{product.name}</div>
                      <div className="truncate text-[var(--text-muted)]">{category?.name ?? '—'}</div>
                      <div className="truncate text-[var(--text-muted)]">{product.location?.name ?? <span className="text-red-400 text-xs">Unassigned</span>}</div>
                      <div className="truncate text-[var(--text-muted)]">{department?.name ?? '—'}</div>
                      <div className="text-right text-[var(--text)]">{formatPhp(product.unitPrice)}</div>
                      <div className="text-right text-[var(--text)]">{formatPhp(totalValue)}</div>
                      <div>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[product.status || 'active'] ?? STATUS_COLOR.active}`}>
                          {product.status || 'active'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          isNegative ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100' :
                          isOut      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                          isLow      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                                       'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                        }`}>
                          {product.currentStock} {product.unit}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {product.createdAt ? formatDateTime(product.createdAt) : '—'}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {filteredProducts.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </DataPageLayout>

      {/* Right-Side Drawer */}
      {isDrawerOpen && (selectedItem || isCreating) && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedItem && (
                    <span className="font-mono text-xs text-[var(--primary)] font-bold">{selectedItem.sku}</span>
                  )}
                  {selectedItem && !editingItem && !isCreating && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[selectedItem.status || 'active'] ?? STATUS_COLOR.active}`}>
                      {selectedItem.status || 'active'}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)] mt-0.5 truncate">
                  {isCreating ? 'New Product' : editingItem ? 'Edit Product' : selectedItem?.name}
                </h2>
                {selectedItem && !editingItem && !isCreating && (
                  <p className="text-sm text-[var(--text-muted)]">{categoriesMap.get(selectedItem.categoryId)?.name ?? '—'}</p>
                )}
              </div>
              <button type="button" onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(editingItem || isCreating) ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {editingItem && (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">SKU</label>
                        <input type="text" value={formData.sku} readOnly
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)] font-mono cursor-default" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Product Name *</label>
                      <input type="text" value={formData.name} required
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" autoFocus />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Category *</label>
                      <select value={formData.categoryId} required
                        onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        <option value="">Select Category</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Location</label>
                      <select value={formData.locationId}
                        onChange={e => setFormData({ ...formData, locationId: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        <option value="">— No location —</option>
                        {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Unit</label>
                      <select value={formData.unit}
                        onChange={e => setFormData({ ...formData, unit: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        <optgroup label="Pieces/Count">
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="dozen">Dozen</option>
                          <option value="box">Box</option>
                          <option value="pack">Pack</option>
                        </optgroup>
                        <optgroup label="Weight">
                          <option value="mg">Milligram (mg)</option>
                          <option value="g">Gram (g)</option>
                          <option value="kg">Kilogram (kg)</option>
                          <option value="oz">Ounce (oz)</option>
                          <option value="lb">Pound (lb)</option>
                          <option value="ton">Ton</option>
                        </optgroup>
                        <optgroup label="Volume/Liquid">
                          <option value="ml">Milliliter (ml)</option>
                          <option value="liter">Liter (L)</option>
                          <option value="gallon">Gallon</option>
                          <option value="cup">Cup</option>
                        </optgroup>
                        <optgroup label="Length/Distance">
                          <option value="mm">Millimeter (mm)</option>
                          <option value="cm">Centimeter (cm)</option>
                          <option value="m">Meter (m)</option>
                          <option value="km">Kilometer (km)</option>
                          <option value="inch">Inch</option>
                          <option value="ft">Foot (ft)</option>
                          <option value="yard">Yard</option>
                        </optgroup>
                        <optgroup label="Area">
                          <option value="cm2">Square Centimeter (cm²)</option>
                          <option value="m2">Square Meter (m²)</option>
                        </optgroup>
                        <optgroup label="Other">
                          <option value="roll">Roll</option>
                          <option value="sheet">Sheet</option>
                          <option value="can">Can</option>
                          <option value="bottle">Bottle</option>
                          <option value="bag">Bag</option>
                          <option value="carton">Carton</option>
                        </optgroup>
                      </select>
                    </div>
                    {selectedItem ? (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Current Stock</label>
                        <div className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)]">
                          {formData.currentStock} {formData.unit}
                          <span className="ml-2 text-xs">(use Stock Movements to change)</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Opening Stock *</label>
                        <input type="number" value={formData.currentStock} required min={0}
                          onChange={e => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Low Stock Threshold</label>
                      <input type="number" value={formData.lowStockThreshold} min={0}
                        onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Description</label>
                    <textarea value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                  </div>
                  <div className="border-t border-[var(--border)] pt-4">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Additional Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Supplier</label>
                        <input type="text" value={formData.supplier || ''} placeholder="e.g., Tech Supply Co"
                          onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Unit Price ($)</label>
                        <input type="number" value={formData.unitPrice === 0 ? '' : formData.unitPrice} step="0.01" min="0" placeholder="0.00"
                          onChange={e => setFormData({ ...formData, unitPrice: e.target.value ? parseFloat(e.target.value) : 0 })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Status</label>
                        <select value={formData.status || 'active'}
                          onChange={e => setFormData({ ...formData, status: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                          <option value="active">Active</option>
                          <option value="discontinued">Discontinued</option>
                          <option value="obsolete">Obsolete</option>
                          <option value="on-backorder">On Backorder</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Lead Time (days)</label>
                        <input type="number" value={formData.leadTimeDays || ''} min="0" placeholder="Days until arrival"
                          onChange={e => setFormData({ ...formData, leadTimeDays: e.target.value ? parseInt(e.target.value) : 0 })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Expiry Date</label>
                        <input type="date" value={formData.expiryDate || ''}
                          onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Notes</label>
                        <input type="text" value={formData.notes || ''} placeholder="e.g., Handle with care"
                          onChange={e => setFormData({ ...formData, notes: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    </div>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                  <div className="flex gap-2">
                    <button type="submit"
                      className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      Save
                    </button>
                    <button type="button" onClick={cancelEdit}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : selectedItem && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Overview</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Current Stock', value: `${selectedItem.currentStock} ${selectedItem.unit}` },
                        { label: 'Low Stock Threshold', value: `${selectedItem.lowStockThreshold} ${selectedItem.unit}` },
                        { label: 'Unit Price', value: formatPhp(selectedItem.unitPrice) },
                        { label: 'Total Value', value: formatPhp((selectedItem.unitPrice || 0) * selectedItem.currentStock) },
                        { label: 'Category', value: categoriesMap.get(selectedItem.categoryId)?.name ?? '—' },
                        { label: 'Location', value: (selectedItem as any).location?.name ?? (locations.find(l => l.id === selectedItem.locationId)?.name) ?? '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
                          <p className="text-sm font-medium text-[var(--text)]">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  {(selectedItem.supplier || selectedItem.leadTimeDays || selectedItem.expiryDate) && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Supplier & Logistics</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Supplier</p>
                          <p className="text-sm text-[var(--text)]">{selectedItem.supplier || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Lead Time</p>
                          <p className="text-sm text-[var(--text)]">{selectedItem.leadTimeDays ? `${selectedItem.leadTimeDays} days` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Expiry Date</p>
                          <p className="text-sm text-[var(--text)]">{selectedItem.expiryDate ? formatDate(selectedItem.expiryDate) : '—'}</p>
                        </div>
                      </div>
                    </section>
                  )}
                  {(selectedItem.description || selectedItem.notes) && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Notes</h3>
                      {selectedItem.description && <p className="text-sm text-[var(--text)] mb-2">{selectedItem.description}</p>}
                      {selectedItem.notes && <p className="text-sm text-[var(--text-muted)] italic">{selectedItem.notes}</p>}
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
                        mi.reason?.toLowerCase().includes(q) ||
                        mi.stockDetail?.assetTag?.toLowerCase().includes(q)
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
                                    {mi.stockDetail?.assetTag && <p className="font-mono">{mi.stockDetail.assetTag}</p>}
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
                </div>
              )}
            </div>

            {/* Footer — view mode only */}
            {!editingItem && !isCreating && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
                {confirmingDelete ? (
                  <div className="w-full">
                    <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{selectedItem?.name}"?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={doDelete}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                        Yes, Delete
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)}
                        className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : selectedItem && (
                  <div className="flex gap-2">
                    {user.role !== 'superadmin' && (
                      <button type="button" onClick={() => openEdit(selectedItem)}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                        <Edit size={14} /> Edit Details
                      </button>
                    )}
                    {user.role === 'admin' ? (
                      <button type="button" onClick={handleDelete}
                        className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={14} /> Delete
                      </button>
                    ) : user.role === 'staff' ? (
                      <button type="button" onClick={() => handleRequestDelete(selectedItem.id, selectedItem.name)}
                        className="flex items-center gap-2 px-4 py-2 border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50">
                        <Trash2 size={14} /> Request Delete
                      </button>
                    ) : null}
                    <button type="button" onClick={() => { closeDrawer(); navigate('/stock-movements'); }}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      View Movements
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
