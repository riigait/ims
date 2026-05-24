import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi, deleteRequestsApi, departmentsApi } from '@/services/api';
import ConfirmDialog from '@/components/ConfirmDialog';
import Pagination from '@/components/Pagination';
import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort } from '@/types/filters';
import { validateProductName, validateSKU, validateStock } from '@/utils/validation';
import { generateSKU, formatDate } from '@/utils/ids';
import { filterAndSortProducts, clearProductFilters } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  locationId: '',
  unit: 'pcs',
  currentStock: 0,
  lowStockThreshold: 10,
  supplier: '',
  unitPrice: 0,
  status: 'active',
  expiryDate: '',
  leadTimeDays: 0,
  notes: '',
};

export default function Products() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProductFilter>({
    search: '', categoryId: undefined, locationId: undefined, stockStatus: undefined, departmentId: undefined, unit: undefined, dateRange: 'all',
  });
  const [sort, setSort] = useState<ProductSort>({ field: 'date', order: 'desc' });
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [wasInAllDepartmentsMode, setWasInAllDepartmentsMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProductName(formData.name)) { setError('Invalid product name'); return; }
    if (!validateSKU(formData.sku)) { setError('Invalid SKU'); return; }
    if (!formData.categoryId) { setError('Please select a category'); return; }
    if (!validateStock(formData.currentStock)) { setError('Invalid stock quantity'); return; }
    try {
      const payload = { ...formData, locationId: formData.locationId || null };
      if (editingId) {
        await productsApi.update(editingId, payload);
      } else {
        await productsApi.create(payload);
      }
      await fetchData();
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setError('');
      if (wasInAllDepartmentsMode) {
        localStorage.setItem('currentDepartmentId', ALL_DEPARTMENTS_ID);
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Failed to save product:', error);
      const errorMsg = error?.response?.data?.error || 'Failed to save product';
      setError(errorMsg);
    }
  };

  const handleEdit = (product: Product) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    const isInAllDepartmentsMode = currentDeptId === ALL_DEPARTMENTS_ID;
    if (isInAllDepartmentsMode && product.departmentId) {
      setWasInAllDepartmentsMode(true);
      localStorage.setItem('currentDepartmentId', product.departmentId);
      window.location.reload();
      return;
    }
    const expiryDateValue = product.expiryDate
      ? new Date(product.expiryDate).toISOString().split('T')[0]
      : '';

    setFormData({
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
      expiryDate: expiryDateValue,
      leadTimeDays: product.leadTimeDays ? parseInt(product.leadTimeDays.toString()) : 0,
      notes: product.notes || '',
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await productsApi.delete(deleteConfirm);
      await fetchData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete product:', error);
      setError('Failed to delete product');
      setDeleteConfirm(null);
    }
  };

  const handleRequestDelete = async (id: string, name: string) => {
    const reason = prompt('Reason for deletion (optional):');
    if (reason === null) return;
    try {
      await deleteRequestsApi.create({ entityType: 'product', entityId: id, entityName: name, reason: reason || '' });
      setError('');
    } catch (err) {
      setError('Failed to submit delete request');
      console.error(err);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const toggleRowExpansion = (productId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedRows(newExpanded);
  };

  const getLastMovementDate = (productId: string) => {
    const movement = products
      .flatMap((p: any) => p.movements || [])
      .filter((m: any) => m.productId === productId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .at(0);
    return movement ? formatDate(movement.createdAt) : 'Never';
  };

  const clearAllFilters = () => {
    setFilters(clearProductFilters());
    setSort({ field: 'date', order: 'desc' });
    setCurrentPage(1);
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/products/export/csv');
      const csv = await response.text();
      downloadCsv(products, 'products.csv');
    } catch (error) {
      console.error('Export failed:', error);
      setError('Failed to export products');
    }
  };

  const handleImportCSV = async (csvContent: string) => {
    try {
      const response = await fetch('/api/products/import/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvContent }),
      });
      const result = await response.json();
      if (response.ok) {
        setError(`✓ ${result.message}`);
        await fetchData();
      } else {
        setError(result.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import failed:', error);
      setError('Failed to import products');
    }
  };

  const filteredProducts = filterAndSortProducts(products, filters, sort);
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const uniqueUnits = Array.from(new Set(products.map(p => p.unit))).sort();
  const categoriesMap = new Map(categories.map(c => [c.id, c]));

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const formContent = (
    <>
      <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">{editingId ? 'Edit Product' : 'New Product'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-[var(--text)] mb-1">SKU</label>
            <div className="flex gap-2">
              <input id="sku" name="sku" type="text" value={formData.sku}
                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
              {!editingId && (
                <button type="button" onClick={() => setFormData({ ...formData, sku: generateSKU() })}
                  className="px-4 py-2 bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]">
                  Generate
                </button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="product-name" className="block text-sm font-medium text-[var(--text)] mb-1">Product Name *</label>
            <input id="product-name" name="name" type="text" value={formData.name} required
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-[var(--text)] mb-1">Category *</label>
            <select id="category" name="category" value={formData.categoryId} required
              onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-[var(--text)] mb-1">
              Location <span className="text-[var(--text-muted)] font-normal">(optional)</span>
            </label>
            <select id="location" name="location" value={formData.locationId}
              onChange={e => setFormData({ ...formData, locationId: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              <option value="">— No location —</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-[var(--text)] mb-1">Unit</label>
            <select id="unit" name="unit" value={formData.unit}
              onChange={e => setFormData({ ...formData, unit: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
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
          {editingId ? (
            <div>
              <div className="block text-sm font-medium text-[var(--text)] mb-1">Current Stock</div>
              <div className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)] text-sm">
                {formData.currentStock} {formData.unit}
                <span className="ml-2 text-xs text-[var(--text-muted)]">(use Stock Movements to change)</span>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="opening-stock" className="block text-sm font-medium text-[var(--text)] mb-1">Opening Stock *</label>
              <input id="opening-stock" name="opening-stock" type="number" value={formData.currentStock} required min={0}
                onChange={e => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
          )}
          <div>
            <label htmlFor="low-stock-threshold" className="block text-sm font-medium text-[var(--text)] mb-1">Low Stock Threshold</label>
            <input id="low-stock-threshold" name="low-stock-threshold" type="number" value={formData.lowStockThreshold} min={0}
              onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
          </div>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-[var(--text)] mb-1">Description</label>
          <textarea id="description" name="description" value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" rows={3} />
        </div>

        <div className="border-t border-[var(--border)] pt-4 mt-4">
          <h3 className="text-sm font-semibold text-[var(--text)] mb-4">Additional Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="supplier" className="block text-sm font-medium text-[var(--text)] mb-1">Supplier/Vendor</label>
              <input id="supplier" name="supplier" type="text" value={formData.supplier || ''}
                onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="e.g., Tech Supply Co"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
            <div>
              <label htmlFor="unit-price" className="block text-sm font-medium text-[var(--text)] mb-1">Unit Price ($)</label>
              <input id="unit-price" name="unit-price" type="number" value={formData.unitPrice === 0 ? '' : formData.unitPrice} step="0.01" min="0"
                onChange={e => setFormData({ ...formData, unitPrice: e.target.value ? parseFloat(e.target.value) : 0 })}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-[var(--text)] mb-1">Status</label>
              <select id="status" name="status" value={formData.status || 'active'}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                <option value="active">Active</option>
                <option value="discontinued">Discontinued</option>
                <option value="obsolete">Obsolete</option>
                <option value="on-backorder">On Backorder</option>
              </select>
            </div>
            <div>
              <label htmlFor="lead-time" className="block text-sm font-medium text-[var(--text)] mb-1">Lead Time (days)</label>
              <input id="lead-time" name="lead-time" type="number" value={formData.leadTimeDays || ''} min="0"
                onChange={e => setFormData({ ...formData, leadTimeDays: e.target.value ? parseInt(e.target.value) : 0 })}
                placeholder="Days until stock arrives"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
            <div>
              <label htmlFor="expiry-date" className="block text-sm font-medium text-[var(--text)] mb-1">Expiry Date (optional)</label>
              <input id="expiry-date" name="expiry-date" type="date" value={formData.expiryDate || ''}
                onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-[var(--text)] mb-1">Notes</label>
              <input id="notes" name="notes" type="text" value={formData.notes || ''}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g., Requires refrigeration, Handle with care"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
            Save
          </button>
          <button type="button" onClick={handleCancel}
            className="px-4 py-2 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)]">
            Cancel
          </button>
        </div>
      </form>
    </>
  );

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input id="search-products" name="search" type="text" placeholder="Search by name or SKU…" value={filters.search}
          onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Search products by name or SKU" />
        <select id="sort-by" name="sort-by" value={`${sort.field}:${sort.order}`} onChange={e => {
          const [field, order] = e.target.value.split(':');
          setSort({ field: field as ProductSort['field'], order: order as ProductSort['order'] });
          setCurrentPage(1);
        }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]" aria-label="Sort by">
          <option value="name:asc">Sort: Name</option>
          <option value="sku:asc">Sort: SKU</option>
          <option value="stock:desc">Sort: Stock (High to Low)</option>
          <option value="low-stock:asc">Sort: Stock (Low to High)</option>
          <option value="date:desc">Sort: Recently Added</option>
        </select>
        <button onClick={clearAllFilters}
          className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">
          Clear
        </button>
        <CSVControls
          onExport={handleExportCSV}
          onImport={handleImportCSV}
          exportLabel="Export"
          importLabel="Import"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        <select id="filter-category" name="filter-category" value={filters.categoryId || ''} onChange={e => { setFilters({ ...filters, categoryId: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by category">
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select id="filter-stock-status" name="filter-stock-status" value={filters.stockStatus || ''} onChange={e => { setFilters({ ...filters, stockStatus: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by stock status">
          <option value="">All Stock Status</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="in-stock">In Stock</option>
        </select>
        <select id="filter-unit" name="filter-unit" value={filters.unit || ''} onChange={e => { setFilters({ ...filters, unit: e.target.value || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by unit">
          <option value="">All Units</option>
          {uniqueUnits.map(unit => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
        <select id="filter-date-range" name="filter-date-range" value={filters.dateRange} onChange={e => { setFilters({ ...filters, dateRange: e.target.value as any }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by date range">
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
        {user.role === 'superadmin' && (
          <select id="filter-department" name="filter-department" value={filters.departmentId || ''} onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by department">
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );

  return (
    <>
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Product"
          message="Are you sure you want to delete this product?"
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <DataPageLayout
        title="Products"
        error={error}
        showForm={showForm}
        onAddClick={() => setShowForm(true)}
        showAddButton={user.role !== 'superadmin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        formContent={formContent}
        filterContent={filterContent}>
      <div className="space-y-0">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-[var(--surface)] rounded-lg">
            <p className="text-[var(--text-muted)]">No products found.</p>
          </div>
        ) : (
          <div className="space-y-0 border border-[var(--border)] rounded-lg overflow-hidden">
            {paginatedProducts.map((product) => {
              const category = product.category ?? categoriesMap.get(product.categoryId);
              const isLowStock = product.currentStock > 0 && product.currentStock <= product.lowStockThreshold;
              const isOutOfStock = product.currentStock === 0;
              const isExpanded = expandedRows.has(product.id);
              const totalValue = (product.unitPrice || 0) * product.currentStock;
              const lastMovementDate = getLastMovementDate(product.id);

              return (
                <div key={product.id}>
                  {/* Main Row */}
                  <div
                    onClick={() => toggleRowExpansion(product.id)}
                    className="flex items-center gap-4 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleRowExpansion(product.id); }}
                      className="text-[var(--text-muted)] hover:text-[var(--text)] flex-shrink-0">
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-7 gap-4 text-sm min-w-0">
                      <div className="truncate">
                        <span className="font-mono text-xs text-[var(--text-muted)]">{product.sku}</span>
                      </div>
                      <div className="truncate">
                        <span className="font-medium text-[var(--text)]">{product.name}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-[var(--text-muted)]">{category?.name ?? '—'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[var(--text)]">${(product.unitPrice || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[var(--text)]">${totalValue.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          product.status === 'active' ? 'bg-green-100 text-green-800' :
                          product.status === 'discontinued' ? 'bg-orange-100 text-orange-800' :
                          product.status === 'obsolete' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {product.status || 'active'}
                        </span>
                      </div>
                      <div className="text-right">
                        <button
                          onClick={() => navigate('/stock-movements')}
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            isOutOfStock ? 'bg-red-100 text-red-800' :
                            isLowStock   ? 'bg-yellow-100 text-yellow-800' :
                                           'bg-green-100 text-green-800'
                          }`}>
                          {product.currentStock} {product.unit}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-8 py-4 bg-[var(--surface-2)] border-b border-[var(--border)] grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[var(--text-muted)] text-xs mb-1">Supplier</p>
                        <p className="text-[var(--text)]">{product.supplier || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)] text-xs mb-1">Lead Time</p>
                        <p className="text-[var(--text)]">{product.leadTimeDays ? `${product.leadTimeDays} days` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)] text-xs mb-1">Expiry Date</p>
                        <p className="text-[var(--text)]">{product.expiryDate ? formatDate(product.expiryDate) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[var(--text-muted)] text-xs mb-1">Last Movement</p>
                        <p className="text-[var(--text)]">{lastMovementDate}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-[var(--text-muted)] text-xs mb-1">Notes</p>
                        <p className="text-[var(--text)]">{product.notes || '—'}</p>
                      </div>
                      <div className="md:col-span-2 flex gap-2">
                        {user.role !== 'superadmin' && (
                          <>
                            <button onClick={() => handleEdit(product)} className="px-3 py-1 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primary-hover)]">
                              Edit
                            </button>
                            {user.role === 'admin' ? (
                              <button onClick={() => handleDelete(product.id)} className="px-3 py-1 bg-red-100 text-red-600 text-xs rounded hover:bg-red-200">
                                Delete
                              </button>
                            ) : (
                              <button onClick={() => handleRequestDelete(product.id, product.name)} className="px-3 py-1 bg-orange-100 text-orange-600 text-xs rounded hover:bg-orange-200">
                                Request Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
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
    </>
  );
}
