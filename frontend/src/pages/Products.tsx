import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Edit, Trash2, Plus, ChevronRight } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi, deleteRequestsApi, departmentsApi } from '@/services/api';
import Pagination from '@/components/Pagination';
import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort } from '@/types/filters';
import { validateProductName, validateSKU, validateStock } from '@/utils/validation';
import { generateSKU, formatDate } from '@/utils/ids';
import { filterAndSortProducts, clearProductFilters } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

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
    search: routeState.search ?? '', categoryId: undefined, locationId: routeState.locationId ?? undefined, stockStatus: undefined, departmentId: undefined, unit: undefined, dateRange: 'all',
  });
  const [sort, setSort] = useState<ProductSort>({ field: 'date', order: 'desc' });
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<Product | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, locationsRes, deptRes] = await Promise.all([
        productsApi.getAll(), categoriesApi.getAll(), locationsApi.getAll(),
        user.role === 'superadmin' ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
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

  // Restore pending edit/delete from sessionStorage (after dept-switch reload)
  useEffect(() => {
    if (loading) return;
    const pendingEditId = sessionStorage.getItem('pendingEditProductId');
    if (pendingEditId) {
      sessionStorage.removeItem('pendingEditProductId');
      const product = products.find(p => p.id === pendingEditId);
      if (product) openEditDrawer(product);
      return;
    }
    const pendingDeleteId = sessionStorage.getItem('pendingDeleteProductId');
    if (pendingDeleteId) {
      sessionStorage.removeItem('pendingDeleteProductId');
      const product = products.find(p => p.id === pendingDeleteId);
      if (product) { openViewDrawer(product); setConfirmingDelete(true); }
    }
  }, [loading]);

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
    setDrawerItem(null);
    setFormData(emptyForm);
    setFormError('');
    setDrawerEditing(true);
    setDrawerOpen(true);
  };

  const openViewDrawer = (product: Product) => {
    setDrawerItem(product);
    setFormError('');
    setDrawerEditing(false);
    setDrawerOpen(true);
  };

  const openEditDrawer = (product: Product) => {
    setDrawerItem(product);
    setFormData(buildFormData(product));
    setFormError('');
    setDrawerEditing(true);
    setDrawerOpen(true);
  };

  const startEdit = (product: Product) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    if (currentDeptId === ALL_DEPARTMENTS_ID && product.departmentId) {
      sessionStorage.setItem('pendingEditProductId', product.id);
      sessionStorage.setItem('returnToDeptAfterEdit', ALL_DEPARTMENTS_ID);
      localStorage.setItem('currentDepartmentId', product.departmentId);
      window.location.reload();
      return;
    }
    setFormData(buildFormData(product));
    setFormError('');
    setDrawerEditing(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setFormData(emptyForm);
    setFormError('');
    const returnToDept = sessionStorage.getItem('returnToDeptAfterEdit');
    if (returnToDept) {
      sessionStorage.removeItem('returnToDeptAfterEdit');
      localStorage.setItem('currentDepartmentId', returnToDept);
      window.location.reload();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProductName(formData.name)) { setFormError('Invalid product name'); return; }
    if (!validateSKU(formData.sku)) { setFormError('Invalid SKU'); return; }
    if (!formData.categoryId) { setFormError('Please select a category'); return; }
    if (!validateStock(formData.currentStock)) { setFormError('Invalid stock quantity'); return; }
    try {
      const payload = { ...formData, locationId: formData.locationId || null };
      if (drawerItem) {
        await productsApi.update(drawerItem.id, payload);
        await fetchData();
        const updated = products.find(p => p.id === drawerItem.id);
        if (updated) setDrawerItem({ ...updated, ...payload });
        setDrawerEditing(false);
      } else {
        await productsApi.create(payload);
        await fetchData();
        closeDrawer();
      }
      setFormError('');
      const returnToDept = sessionStorage.getItem('returnToDeptAfterEdit');
      if (returnToDept) {
        sessionStorage.removeItem('returnToDeptAfterEdit');
        localStorage.setItem('currentDepartmentId', returnToDept);
        window.location.reload();
      }
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to save product');
    }
  };

  const handleDelete = () => {
    if (!drawerItem) return;
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    if (currentDeptId === ALL_DEPARTMENTS_ID && drawerItem.departmentId) {
      sessionStorage.setItem('pendingDeleteProductId', drawerItem.id);
      localStorage.setItem('currentDepartmentId', drawerItem.departmentId);
      window.location.reload();
      return;
    }
    setConfirmingDelete(true);
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await productsApi.delete(drawerItem.id);
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
  const categoriesMap = new Map(categories.map(c => [c.id, c]));

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const filterContent = (
    <>
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
      <div className="flex gap-2 flex-wrap">
        <select value={filters.categoryId || ''} onChange={e => { setFilters({ ...filters, categoryId: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <select value={filters.stockStatus || ''} onChange={e => { setFilters({ ...filters, stockStatus: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Stock Status</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="in-stock">In Stock</option>
        </select>
        <select value={filters.unit || ''} onChange={e => { setFilters({ ...filters, unit: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Units</option>
          {uniqueUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <select value={filters.dateRange} onChange={e => { setFilters({ ...filters, dateRange: e.target.value as any }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
        {user.role === 'superadmin' && (
          <select value={filters.departmentId || ''} onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
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
      {/* Header with stats */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Products</h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {products.length} products · <span className="text-yellow-600">{lowStockCount} low stock</span> · <span className="text-red-600">{outOfStockCount} out of stock</span>
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
              <div className="hidden md:grid md:grid-cols-8 gap-4 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
                <div>SKU</div>
                <div>Name</div>
                <div>Category</div>
                <div>Location</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Total Value</div>
                <div>Status</div>
                <div className="text-right">Stock</div>
              </div>
              {paginatedProducts.map(product => {
                const category = product.category ?? categoriesMap.get(product.categoryId);
                const isNegative = product.currentStock < 0;
                const isOut = product.currentStock === 0;
                const isLow = product.currentStock > 0 && product.currentStock <= product.lowStockThreshold;
                const totalValue = (product.unitPrice || 0) * product.currentStock;
                return (
                  <div
                    key={product.id}
                    onClick={() => openViewDrawer(product)}
                    className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-8 gap-4 text-sm min-w-0">
                      <div className="truncate">
                        <span className="font-mono text-xs text-[var(--text-muted)]">{product.sku}</span>
                      </div>
                      <div className="truncate font-medium text-[var(--text)]">{product.name}</div>
                      <div className="truncate text-[var(--text-muted)]">{category?.name ?? '—'}</div>
                      <div className="truncate text-[var(--text-muted)]">{product.location?.name ?? <span className="text-red-400 text-xs">Unassigned</span>}</div>
                      <div className="text-right text-[var(--text)]">${(product.unitPrice || 0).toFixed(2)}</div>
                      <div className="text-right text-[var(--text)]">${totalValue.toFixed(2)}</div>
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
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {drawerItem && (
                    <span className="font-mono text-xs text-[var(--primary)] font-bold">{drawerItem.sku}</span>
                  )}
                  {drawerItem && !drawerEditing && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[drawerItem.status || 'active'] ?? STATUS_COLOR.active}`}>
                      {drawerItem.status || 'active'}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)] mt-0.5 truncate">
                  {!drawerItem ? 'New Product' : drawerEditing ? 'Edit Product' : drawerItem.name}
                </h2>
                {drawerItem && !drawerEditing && (
                  <p className="text-sm text-[var(--text-muted)]">{categoriesMap.get(drawerItem.categoryId)?.name ?? '—'}</p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerEditing ? (
                <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">SKU</label>
                      <div className="flex gap-2">
                        <input type="text" value={formData.sku}
                          onChange={e => setFormData({ ...formData, sku: e.target.value })}
                          className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                        {!drawerItem && (
                          <button type="button" onClick={() => setFormData({ ...formData, sku: generateSKU() })}
                            className="px-3 py-1.5 text-sm bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]">
                            Gen
                          </button>
                        )}
                      </div>
                    </div>
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
                    {drawerItem ? (
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
                </form>
              ) : drawerItem && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Overview</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Current Stock', value: `${drawerItem.currentStock} ${drawerItem.unit}` },
                        { label: 'Low Stock Threshold', value: `${drawerItem.lowStockThreshold} ${drawerItem.unit}` },
                        { label: 'Unit Price', value: `$${(drawerItem.unitPrice || 0).toFixed(2)}` },
                        { label: 'Total Value', value: `$${((drawerItem.unitPrice || 0) * drawerItem.currentStock).toFixed(2)}` },
                        { label: 'Category', value: categoriesMap.get(drawerItem.categoryId)?.name ?? '—' },
                        { label: 'Location', value: (drawerItem as any).location?.name ?? (locations.find(l => l.id === drawerItem.locationId)?.name) ?? '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
                          <p className="text-sm font-medium text-[var(--text)]">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  {(drawerItem.supplier || drawerItem.leadTimeDays || drawerItem.expiryDate) && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Supplier & Logistics</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Supplier</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.supplier || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Lead Time</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.leadTimeDays ? `${drawerItem.leadTimeDays} days` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Expiry Date</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.expiryDate ? formatDate(drawerItem.expiryDate) : '—'}</p>
                        </div>
                      </div>
                    </section>
                  )}
                  {(drawerItem.description || drawerItem.notes) && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Notes</h3>
                      {drawerItem.description && <p className="text-sm text-[var(--text)] mb-2">{drawerItem.description}</p>}
                      {drawerItem.notes && <p className="text-sm text-[var(--text-muted)] italic">{drawerItem.notes}</p>}
                    </section>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
              {drawerEditing ? (
                <div className="flex gap-2">
                  <button type="submit" form="product-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Save
                  </button>
                  <button type="button" onClick={() => drawerItem ? setDrawerEditing(false) : closeDrawer()}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{drawerItem?.name}"?</p>
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
              ) : drawerItem && (
                <div className="flex gap-2">
                  {user.role !== 'superadmin' && (
                    <button onClick={() => startEdit(drawerItem)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      <Edit size={14} /> Edit
                    </button>
                  )}
                  {user.role === 'admin' ? (
                    <button onClick={handleDelete}
                      className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 size={14} /> Delete
                    </button>
                  ) : user.role === 'staff' ? (
                    <button onClick={() => handleRequestDelete(drawerItem.id, drawerItem.name)}
                      className="flex items-center gap-2 px-4 py-2 border border-orange-300 text-orange-600 text-sm rounded-lg hover:bg-orange-50">
                      <Trash2 size={14} /> Request Delete
                    </button>
                  ) : null}
                  <button onClick={() => { closeDrawer(); navigate('/stock-movements'); }}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    View Movements
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
