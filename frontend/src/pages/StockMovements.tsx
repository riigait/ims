import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { stockMovementsApi, productsApi, locationsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { formatDate } from '@/utils/ids';

const MOVEMENT_OPTIONS: { value: MovementType; label: string; color: string }[] = [
  { value: 'stock_in',   label: 'Stock In',    color: 'bg-green-100 text-green-800' },
  { value: 'stock_out',  label: 'Stock Out',   color: 'bg-red-100 text-red-800' },
  { value: 'adjustment', label: 'Adjustment',  color: 'bg-blue-100 text-blue-800' },
  { value: 'returned',   label: 'Returned',    color: 'bg-teal-100 text-teal-800' },
  { value: 'damaged',    label: 'Damaged',     color: 'bg-orange-100 text-orange-800' },
  { value: 'transfer',   label: 'Transfer',    color: 'bg-purple-100 text-purple-800' },
];

const movementColor = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.color ?? 'bg-gray-100 text-gray-800';
const movementLabel = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.label ?? type;

const emptyForm = {
  productId: '',
  movementType: 'stock_in' as MovementType,
  quantity: 1,
  reason: '',
  locationId: '',
};

export default function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => { fetchData(); }, []);

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
      setFormData(emptyForm);
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? 'Failed to create stock movement';
      alert(msg);
    }
  };

  const getProductName = (productId: string) =>
    products.find(p => p.id === productId)?.name ?? 'Unknown';

  const getLocationName = (locationId: string | undefined) => {
    if (!locationId) return '-';
    return locations.find(l => l.id === locationId)?.name ?? 'Unknown';
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Stock Movements</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus size={20} /> New Movement
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Record Stock Movement</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="movement-product" className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
                <select id="movement-product" name="product" value={formData.productId} required
                  onChange={e => setFormData({ ...formData, productId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="">Select Product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="movement-type" className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select id="movement-type" name="type" value={formData.movementType}
                  onChange={e => setFormData({ ...formData, movementType: e.target.value as MovementType })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  {MOVEMENT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="movement-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input id="movement-quantity" name="quantity" type="number" value={formData.quantity} required min={1}
                  onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>

              <div>
                <label htmlFor="movement-location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select id="movement-location" name="location" value={formData.locationId}
                  onChange={e => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="">— No location —</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="movement-reason" className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input id="movement-reason" name="reason" type="text" value={formData.reason}
                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., Purchase order, Customer return, Damaged on receiving…" />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Record Movement
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
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
                <th className="px-6 py-3 text-left font-medium text-gray-700">Product</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Type</th>
                <th className="px-6 py-3 text-right font-medium text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Reason</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Location</th>
                <th className="px-6 py-3 text-left font-medium text-gray-700">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">No movements recorded yet.</td>
                </tr>
              ) : movements.map(movement => (
                <tr key={movement.id}>
                  <td className="px-6 py-3">{getProductName(movement.productId)}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${movementColor(movement.movementType)}`}>
                      {movementLabel(movement.movementType)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">{movement.quantity}</td>
                  <td className="px-6 py-3 text-gray-600">{movement.reason || '-'}</td>
                  <td className="px-6 py-3">{getLocationName(movement.locationId)}</td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(movement.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
