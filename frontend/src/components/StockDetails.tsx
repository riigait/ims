import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, X } from 'lucide-react';
import { stockDetailsApi, locationsApi } from '@/services/api';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatDate } from '@/utils/ids';

interface Location {
  id: string;
  name: string;
}

interface StockDetail {
  id: string;
  productId: string;
  modelNumber?: string;
  serialNumber?: string;
  macId?: string;
  dateStock?: string;
  status: string;
  locationId?: string;
  location?: Location;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface StockDetailsProps {
  productId: string;
  productName: string;
}

export default function StockDetails({ productId, productName }: StockDetailsProps) {
  const [stockDetails, setStockDetails] = useState<StockDetail[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    modelNumber: '',
    serialNumber: '',
    macId: '',
    dateStock: '',
    status: 'active',
    locationId: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const emptyForm = {
    modelNumber: '',
    serialNumber: '',
    macId: '',
    dateStock: '',
    status: 'active',
    locationId: '',
    notes: '',
  };

  useEffect(() => {
    fetchData();
  }, [productId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [detailsRes, locationsRes] = await Promise.all([
        stockDetailsApi.getByProductId(productId),
        locationsApi.getAll(),
      ]);
      setStockDetails(detailsRes.data);
      setLocations(locationsRes.data);
    } catch {
      setError('Failed to load stock details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await stockDetailsApi.update(editingId, formData);
      } else {
        await stockDetailsApi.create({ ...formData, productId });
      }
      await fetchData();
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to save stock detail');
    }
  };

  const handleEdit = (detail: StockDetail) => {
    setFormData({
      modelNumber: detail.modelNumber || '',
      serialNumber: detail.serialNumber || '',
      macId: detail.macId || '',
      dateStock: detail.dateStock ? detail.dateStock.split('T')[0] : '',
      status: detail.status,
      locationId: detail.locationId || '',
      notes: detail.notes || '',
    });
    setEditingId(detail.id);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await stockDetailsApi.delete(deleteConfirm);
      await fetchData();
      setDeleteConfirm(null);
      setError('');
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to delete stock detail');
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setError('');
  };

  if (loading) return <div className="text-center py-8 text-[var(--text-muted)]">Loading stock details...</div>;

  return (
    <div className="space-y-6">
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Stock Detail"
          message="Delete this stock item? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">Stock Details</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">{productName}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]"
        >
          <Plus size={20} /> Add Stock Item
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--surface)] p-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-[var(--text)]">
              {editingId ? 'Edit Stock Item' : 'Add Stock Item'}
            </h3>
            <button onClick={handleCloseForm} className="text-[var(--text-muted)] hover:text-[var(--text)]">
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Model Number</label>
                <input
                  type="text"
                  value={formData.modelNumber}
                  onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                  placeholder="e.g., Dell XPS 15-9500"
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Serial Number</label>
                <input
                  type="text"
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="e.g., SERIAL123456"
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">MAC ID</label>
                <input
                  type="text"
                  value={formData.macId}
                  onChange={(e) => setFormData({ ...formData, macId: e.target.value })}
                  placeholder="e.g., 00:1A:2B:3C:4D:5E"
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Date Received</label>
                <input
                  type="date"
                  value={formData.dateStock}
                  onChange={(e) => setFormData({ ...formData, dateStock: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                >
                  <option value="active">Active</option>
                  <option value="damaged">Damaged</option>
                  <option value="sold">Sold</option>
                  <option value="lost">Lost</option>
                  <option value="returned">Returned</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1">Location</label>
                <select
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional information about this stock item..."
                rows={3}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]"
              >
                {editingId ? 'Update' : 'Add'} Stock Item
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="px-4 py-2 bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {stockDetails.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] rounded-lg">
          <p className="text-[var(--text-muted)] mb-4">No stock items added yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]"
          >
            Add First Stock Item
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface)] rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-4 py-2 text-left text-[var(--text)]">Serial / Model</th>
                <th className="px-4 py-2 text-left text-[var(--text)]">MAC ID</th>
                <th className="px-4 py-2 text-left text-[var(--text)]">Status</th>
                <th className="px-4 py-2 text-left text-[var(--text)]">Location</th>
                <th className="px-4 py-2 text-left text-[var(--text)]">Date Received</th>
                <th className="px-4 py-2 text-right text-[var(--text)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {stockDetails.map((detail) => (
                <tr key={detail.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-2 text-[var(--text)]">
                    <div className="font-medium">{detail.serialNumber || 'N/A'}</div>
                    <div className="text-xs text-[var(--text-muted)]">{detail.modelNumber}</div>
                  </td>
                  <td className="px-4 py-2 text-[var(--text)] font-mono text-xs">{detail.macId || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        detail.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : detail.status === 'damaged'
                          ? 'bg-red-100 text-red-800'
                          : detail.status === 'sold'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {detail.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--text)]">{detail.location?.name || '—'}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)] text-sm">
                    {detail.dateStock ? formatDate(detail.dateStock) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      onClick={() => handleEdit(detail)}
                      className="text-[var(--primary)] hover:text-[var(--primary-hover)]"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(detail.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
