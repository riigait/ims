import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2 } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi, deleteRequestsApi, departmentsApi } from '@/services/api';
import { Product, Category, Location } from '@/types/inventory';
import { ProductFilter, ProductSort } from '@/types/filters';
import { validateProductName, validateSKU, validateStock } from '@/utils/validation';
import { generateSKU } from '@/utils/ids';
import { filterAndSortProducts, clearProductFilters } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';

const emptyForm = {
  sku: '', name: '', description: '', categoryId: '', locationId: '', unit: 'pcs', currentStock: 0, lowStockThreshold: 10,
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
        localStorage.setItem('currentDepartmentId', 'all-departments');
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
    const isInAllDepartmentsMode = currentDeptId === 'all-departments';
    if (isInAllDepartmentsMode && product.departmentId) {
      setWasInAllDepartmentsMode(true);
      localStorage.setItem('currentDepartmentId', product.departmentId);
      window.location.reload();
      return;
    }
    setFormData({
      sku: product.sku, name: product.name, description: product.description || '', categoryId: product.categoryId,
      locationId: product.locationId || '', unit: product.unit, currentStock: product.currentStock, lowStockThreshold: product.lowStockThreshold,
    });
    setEditingId(product.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await productsApi.delete(id);
      await fetchData();
    } catch (error) {
      console.error('Failed to delete product:', error);
      setError('Failed to delete product');
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

  const clearAllFilters = () => {
    setFilters(clearProductFilters());
    setSort({ field: 'date', order: 'desc' });
  };

  const filteredProducts = filterAndSortProducts(products, filters, sort);
  const uniqueUnits = Array.from(new Set(products.map(p => p.unit))).sort();
  const categoriesMap = new Map(categories.map(c => [c.id, c]));

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const formContent = (
    <>
      <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit Product' : 'New Product'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <div className="flex gap-2">
              <input id="sku" name="sku" type="text" value={formData.sku}
                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" />
              {!editingId && (
                <button type="button" onClick={() => setFormData({ ...formData, sku: generateSKU() })}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                  Generate
                </button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
            <input id="product-name" name="name" type="text" value={formData.name} required
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select id="category" name="category" value={formData.categoryId} required
              onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select id="location" name="location" value={formData.locationId}
              onChange={e => setFormData({ ...formData, locationId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">— No location —</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select id="unit" name="unit" value={formData.unit}
              onChange={e => setFormData({ ...formData, unit: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg">
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
              <label htmlFor="current-stock" className="block text-sm font-medium text-gray-700 mb-1">Current Stock</label>
              <div id="current-stock" className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm">
                {formData.currentStock} {formData.unit}
                <span className="ml-2 text-xs text-gray-400">(use Stock Movements to change)</span>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="opening-stock" className="block text-sm font-medium text-gray-700 mb-1">Opening Stock *</label>
              <input id="opening-stock" name="opening-stock" type="number" value={formData.currentStock} required min={0}
                onChange={e => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
            </div>
          )}
          <div>
            <label htmlFor="low-stock-threshold" className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
            <input id="low-stock-threshold" name="low-stock-threshold" type="number" value={formData.lowStockThreshold} min={0}
              onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="description" name="description" value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg" rows={3} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save
          </button>
          <button type="button" onClick={handleCancel}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
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
          onChange={e => setFilters({ ...filters, search: e.target.value })}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm" aria-label="Search products by name or SKU" />
        <select id="sort-by" name="sort-by" value={`${sort.field}-${sort.order}`} onChange={e => {
          const [field, order] = e.target.value.split('-');
          setSort({ field: field as ProductSort['field'], order: order as ProductSort['order'] });
        }}
          className="px-3 py-2 border border-gray-300 rounded text-sm font-medium bg-blue-50" aria-label="Sort by">
          <option value="name-asc">Sort: Name</option>
          <option value="sku-asc">Sort: SKU</option>
          <option value="stock-desc">Sort: Stock (High to Low)</option>
          <option value="low-stock-asc">Sort: Stock (Low to High)</option>
          <option value="date-desc">Sort: Recently Added</option>
        </select>
        <button onClick={clearAllFilters}
          className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium">
          Clear
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select id="filter-category" name="filter-category" value={filters.categoryId || ''} onChange={e => setFilters({ ...filters, categoryId: e.target.value || undefined })}
          className="px-3 py-2 border border-gray-300 rounded text-sm" aria-label="Filter by category">
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select id="filter-stock-status" name="filter-stock-status" value={filters.stockStatus || ''} onChange={e => setFilters({ ...filters, stockStatus: e.target.value as any || undefined })}
          className="px-3 py-2 border border-gray-300 rounded text-sm" aria-label="Filter by stock status">
          <option value="">All Stock Status</option>
          <option value="out-of-stock">Out of Stock</option>
          <option value="low-stock">Low Stock</option>
          <option value="in-stock">In Stock</option>
        </select>
        <select id="filter-unit" name="filter-unit" value={filters.unit || ''} onChange={e => setFilters({ ...filters, unit: e.target.value || undefined })}
          className="px-3 py-2 border border-gray-300 rounded text-sm" aria-label="Filter by unit">
          <option value="">All Units</option>
          {uniqueUnits.map(unit => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
        <select id="filter-date-range" name="filter-date-range" value={filters.dateRange} onChange={e => setFilters({ ...filters, dateRange: e.target.value as any })}
          className="px-3 py-2 border border-gray-300 rounded text-sm" aria-label="Filter by date range">
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="90days">Last 90 Days</option>
        </select>
        {user.role === 'superadmin' && (
          <select id="filter-department" name="filter-department" value={filters.departmentId || ''} onChange={e => setFilters({ ...filters, departmentId: e.target.value || undefined })}
            className="px-3 py-2 border border-gray-300 rounded text-sm" aria-label="Filter by department">
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
    <DataPageLayout
      title="Products"
      error={error}
      showForm={showForm}
      onAddClick={() => setShowForm(true)}
      showAddButton={user.role !== 'superadmin' && localStorage.getItem('currentDepartmentId') !== 'all-departments'}
      formContent={formContent}
      filterContent={filterContent}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">SKU</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Category</th>
              {user.role === 'superadmin' && <th className="px-4 py-2 text-left">Department</th>}
              <th className="px-4 py-2 text-right">Stock</th>
              {user.role !== 'superadmin' && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No products found.
                </td>
              </tr>
            ) : filteredProducts.map((product) => {
              const category = product.category ?? categoriesMap.get(product.categoryId);
              const isLowStock = product.currentStock > 0 && product.currentStock <= product.lowStockThreshold;
              const isOutOfStock = product.currentStock === 0;
              return (
                <tr key={product.id} className={isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">{product.sku}</td>
                  <td className="px-4 py-2 font-medium">{product.name}</td>
                  <td className="px-4 py-2 text-gray-600">{category?.name ?? '—'}</td>
                  {user.role === 'superadmin' && (
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {product.department?.name ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate('/stock-movements')}
                      title="View stock movements"
                      className={`px-2 py-1 rounded text-xs font-semibold cursor-pointer hover:opacity-75 transition-opacity ${
                        isOutOfStock ? 'bg-red-100 text-red-800' :
                        isLowStock   ? 'bg-yellow-100 text-yellow-800' :
                                       'bg-green-100 text-green-800'
                      }`}>
                      {product.currentStock} {product.unit}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {user.role !== 'superadmin' && (
                      <>
                        <button onClick={() => handleEdit(product)} className="text-blue-600 hover:text-blue-800">
                          <Edit size={18} />
                        </button>
                        {user.role === 'admin' ? (
                          <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-800">
                            <Trash2 size={18} />
                          </button>
                        ) : (
                          <button onClick={() => handleRequestDelete(product.id, product.name)} className="text-orange-600 hover:text-orange-800" title="Request deletion">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DataPageLayout>
  );
}
