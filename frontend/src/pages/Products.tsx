import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, MapPin } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi, deleteRequestsApi } from '@/services/api';
import { Product, Category, Location } from '@/types/inventory';
import { validateProductName, validateSKU, validateStock } from '@/utils/validation';
import { generateSKU } from '@/utils/ids';

const emptyForm = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  locationId: '',
  unit: 'pcs',
  currentStock: 0,
  lowStockThreshold: 10,
};

export default function Products() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes, locationsRes] = await Promise.all([
        productsApi.getAll(),
        categoriesApi.getAll(),
        locationsApi.getAll(),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
      setLocations(locationsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateProductName(formData.name)) { alert('Invalid product name'); return; }
    if (!validateSKU(formData.sku)) { alert('Invalid SKU'); return; }
    if (!validateStock(formData.currentStock)) { alert('Invalid stock quantity'); return; }

    try {
      const payload = {
        ...formData,
        locationId: formData.locationId || null,
      };
      if (editingId) {
        await productsApi.update(editingId, payload);
      } else {
        await productsApi.create(payload);
      }
      await fetchData();
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      categoryId: product.categoryId,
      locationId: product.locationId || '',
      unit: product.unit,
      currentStock: product.currentStock,
      lowStockThreshold: product.lowStockThreshold,
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
      alert('Failed to delete product');
    }
  };

  const handleRequestDelete = async (id: string, name: string) => {
    const reason = prompt('Reason for deletion (optional):');
    if (reason === null) return;
    try {
      await deleteRequestsApi.create({
        entityType: 'product',
        entityId: id,
        entityName: name,
        reason: reason || '',
      });
      setError('');
      alert('Delete request submitted. Awaiting admin approval.');
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || product.categoryId === categoryFilter;
    const matchesLocation = !locationFilter || product.locationId === locationFilter;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const locationsMap = new Map(locations.map(l => [l.id, l]));
  const categoriesMap = new Map(categories.map(c => [c.id, c]));

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} /> Add Product
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Product' : 'New Product'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* SKU */}
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

              {/* Name */}
              <div>
                <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                <input id="product-name" name="name" type="text" value={formData.name} required
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>

              {/* Category */}
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

              {/* Location */}
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                  Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select id="location" name="location" value={formData.locationId}
                  onChange={e => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="">— No location —</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit */}
              <div>
                <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <input id="unit" name="unit" type="text" value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>

              {/* Current Stock — editable only when creating; use Stock Movements to change it */}
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

              {/* Low Stock Threshold */}
              <div>
                <label htmlFor="low-stock-threshold" className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                <input id="low-stock-threshold" name="low-stock-threshold" type="number" value={formData.lowStockThreshold} min={0}
                  onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>

            {/* Description */}
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
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input id="search-products" name="search" type="text" placeholder="Search by name or SKU…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 min-w-48 px-4 py-2 border border-gray-300 rounded-lg"
            aria-label="Search products by name or SKU" />
          <select id="filter-category" name="category-filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
            aria-label="Filter by category">
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select id="filter-location" name="location-filter" value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
            aria-label="Filter by location">
            <option value="">All Locations</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No products found.
                  </td>
                </tr>
              ) : filteredProducts.map((product) => {
                const category = categoriesMap.get(product.categoryId);
                const location = product.locationId ? locationsMap.get(product.locationId) : null;
                const isLowStock = product.currentStock > 0 && product.currentStock <= product.lowStockThreshold;
                const isOutOfStock = product.currentStock === 0;
                return (
                  <tr key={product.id} className={isOutOfStock ? 'bg-red-50' : isLowStock ? 'bg-yellow-50' : ''}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{product.sku}</td>
                    <td className="px-4 py-2 font-medium">{product.name}</td>
                    <td className="px-4 py-2 text-gray-600">{category?.name ?? '—'}</td>
                    <td className="px-4 py-2">
                      {location ? (
                        <button
                          onClick={() => navigate(`/floor-plans?locationId=${product.locationId}`)}
                          className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 hover:text-blue-900 transition"
                          title="View on floor plan">
                          <MapPin size={10} /> {location.name}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
