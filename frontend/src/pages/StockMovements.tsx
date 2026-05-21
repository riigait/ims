import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { stockMovementsApi, productsApi, locationsApi } from '@/services/api';
import { StockMovement, Product, Location } from '@/types/inventory';
import { formatDate } from '@/utils/ids';

export default function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    productId: '',
    movementType: 'stock_in' as const,
    quantity: 1,
    reason: '',
    locationId: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [movementsRes, productsRes, locationsRes] = await Promise.all([
        stockMovementsApi.getAll(),
        productsApi.getAll(),
        locationsApi.getAll(),
      ]);
      setMovements(movementsRes.data);
      setProducts(productsRes.data);
      setLocations(locationsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.productId || formData.quantity <= 0) {
      alert('Please select a product and enter a valid quantity');
      return;
    }

    try {
      await stockMovementsApi.create(formData);
      await fetchData();
      setShowForm(false);
      setFormData({
        productId: '',
        movementType: 'stock_in',
        quantity: 1,
        reason: '',
        locationId: '',
      });
    } catch (error) {
      console.error('Failed to create movement:', error);
      alert('Failed to create stock movement');
    }
  };

  const getProductName = (productId: string) => {
    return products.find((p) => p.id === productId)?.name || 'Unknown';
  };

  const getLocationName = (locationId: string | undefined) => {
    if (!locationId) return '-';
    return locations.find((l) => l.id === locationId)?.name || 'Unknown';
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Stock Movements</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          New Movement
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Record Stock Movement</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product *
                </label>
                <select
                  value={formData.productId}
                  onChange={(e) =>
                    setFormData({ ...formData, productId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} (SKU: {product.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type *
                </label>
                <select
                  value={formData.movementType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      movementType: e.target.value as 'stock_in' | 'stock_out',
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="stock_in">Stock In</option>
                  <option value="stock_out">Stock Out</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      quantity: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  value={formData.locationId}
                  onChange={(e) =>
                    setFormData({ ...formData, locationId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select Location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason
              </label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., Purchase, Sale, Damage, Inventory Adjustment"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Record Movement
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-700">
                  Product
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">
                  Type
                </th>
                <th className="px-6 py-3 text-right font-medium text-gray-700">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">
                  Reason
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">
                  Location
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-6 py-3">{getProductName(movement.productId)}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        movement.movementType === 'stock_in'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {movement.movementType === 'stock_in' ? 'In' : 'Out'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">{movement.quantity}</td>
                  <td className="px-6 py-3 text-gray-600">{movement.reason}</td>
                  <td className="px-6 py-3">{getLocationName(movement.locationId)}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {formatDate(movement.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
