import { useState, useEffect } from 'react';
import { stockMovementsApi, productsApi, locationsApi, departmentsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { StockMovementFilter } from '@/types/filters';
import { formatDate } from '@/utils/ids';
import { filterStockMovements, sortStockMovements } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { Edit, Trash2 } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

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
  quantity: 0,
  reason: '',
  locationId: '',
};

export default function StockMovements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<StockMovementFilter & { departmentId?: string }>({
    search: '', movementType: undefined, dateRange: 'all', departmentId: undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = async () => {
    try {
      const [movementsRes, productsRes, locationsRes, deptRes] = await Promise.all([
        stockMovementsApi.getAll(), productsApi.getAll(), locationsApi.getAll(),
        user.role === 'superadmin' ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
      ]);
      setMovements(movementsRes.data);
      setProducts(productsRes.data);
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
    if (!formData.productId || formData.quantity <= 0) {
      setError('Please select a product and enter a valid quantity');
      return;
    }
    try {
      if (editingId) {
        await stockMovementsApi.update(editingId, formData);
      } else {
        await stockMovementsApi.create(formData);
      }
      await fetchData();
      setShowForm(false);
      setFormData(emptyForm);
      setEditingId(null);
      setError('');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? (editingId ? 'Failed to update stock movement' : 'Failed to create stock movement');
      setError(msg);
    }
  };

  const handleEdit = (movement: StockMovement) => {
    setFormData({
      productId: movement.productId,
      movementType: movement.movementType,
      quantity: movement.quantity,
      reason: movement.reason || '',
      locationId: movement.locationId || '',
    });
    setEditingId(movement.id);
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await stockMovementsApi.delete(deleteConfirm);
      await fetchData();
      setDeleteConfirm(null);
      setError('');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? 'Failed to delete stock movement';
      setError(msg);
      setDeleteConfirm(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormData(emptyForm);
    setEditingId(null);
  };

  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name ?? 'Unknown';
  const getLocationName = (locationId: string | undefined) => {
    if (!locationId) return '-';
    return locations.find(l => l.id === locationId)?.name ?? 'Unknown';
  };

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

  const formContent = (
    <>
      <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">{editingId ? 'Edit Stock Movement' : 'Record Stock Movement'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="movement-product" className="block text-sm font-medium text-[var(--text)] mb-1">Product *</label>
            <select id="movement-product" name="product" value={formData.productId} required
              onChange={e => setFormData({ ...formData, productId: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              <option value="">Select Product</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="movement-type" className="block text-sm font-medium text-[var(--text)] mb-1">Type *</label>
            <select id="movement-type" name="type" value={formData.movementType}
              onChange={e => setFormData({ ...formData, movementType: e.target.value as MovementType })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              {MOVEMENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {formData.movementType === 'stock_in' && 'ℹ️ Use for received goods, purchases, or stock arriving from suppliers.'}
              {formData.movementType === 'stock_out' && 'ℹ️ Use for sales, shipments, or stock leaving the warehouse.'}
              {formData.movementType === 'adjustment' && 'ℹ️ Use for manual corrections when physical count differs from system. Enter the adjustment amount (positive or negative).'}
              {formData.movementType === 'returned' && 'ℹ️ Use for customer returns or items coming back to inventory.'}
              {formData.movementType === 'damaged' && 'ℹ️ Use for damaged items being written off from inventory.'}
              {formData.movementType === 'transfer' && 'ℹ️ Use for moving stock between locations within your facility.'}
            </p>
          </div>
          <div>
            <label htmlFor="movement-quantity" className="block text-sm font-medium text-[var(--text)] mb-1">Quantity * (must be greater than 0)</label>
            <input id="movement-quantity" name="quantity" type="number" value={formData.quantity === 0 ? '' : formData.quantity} required min={1}
              onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              placeholder="Enter quantity..."
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
            <p className="text-xs text-[var(--text-muted)] mt-1">You must enter a quantity to record the movement</p>
          </div>
          <div>
            <label htmlFor="movement-location" className="block text-sm font-medium text-[var(--text)] mb-1">Location</label>
            <select id="movement-location" name="location" value={formData.locationId}
              onChange={e => setFormData({ ...formData, locationId: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              <option value="">— No location —</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="movement-reason" className="block text-sm font-medium text-[var(--text)] mb-1">Reason</label>
          <input id="movement-reason" name="reason" type="text" value={formData.reason}
            onChange={e => setFormData({ ...formData, reason: e.target.value })}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            placeholder="e.g., Purchase order, Customer return, Damaged on receiving…" />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
            {editingId ? 'Update Movement' : 'Record Movement'}
          </button>
          <button type="button" onClick={handleCloseForm}
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
        <input id="search-movements" name="search" type="text" placeholder="Search by product name…"
          value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Search stock movements" />
        <select id="sort-by" name="sort-by" value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]" aria-label="Sort by">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="product-name">Sort: Product Name</option>
          <option value="quantity-high">Sort: Quantity (High to Low)</option>
          <option value="quantity-low">Sort: Quantity (Low to High)</option>
        </select>
        <button onClick={clearAllFilters} className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">
          Clear
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select id="filter-movement-type" name="filter-movement-type" value={filters.movementType || ''}
          onChange={e => { setFilters({ ...filters, movementType: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]" aria-label="Filter by movement type">
          <option value="">All Movement Types</option>
          {MOVEMENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {user.role === 'superadmin' && (
          <select id="filter-department" name="filter-department" value={filters.departmentId || ''}
            onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
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
          title="Delete Stock Movement"
          message="Are you sure you want to delete this stock movement? This will adjust the product stock accordingly."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <DataPageLayout
        title="Stock Movements"
        error={error}
        showForm={showForm}
        onAddClick={() => { setFormData(emptyForm); setEditingId(null); setShowForm(true); }}
        onCloseForm={handleCloseForm}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        formContent={formContent}
        filterContent={filterContent}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Product</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Type</th>
              <th className="px-4 py-2 text-right text-[var(--text)] font-semibold">Quantity</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Reason</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Location</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Department</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Date</th>
              {user.role === 'admin' && <th className="px-4 py-2 text-center text-[var(--text)] font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filteredAndSortedMovements.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'superadmin' ? 8 : user.role === 'admin' ? 7 : 6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  {movements.length === 0 ? 'No movements recorded yet.' : 'No movements match your filters.'}
                </td>
              </tr>
            ) : paginatedMovements.map(movement => (
              <tr key={movement.id} className="hover:bg-[var(--surface-2)] transition-colors">
                <td className="px-4 py-2 text-[var(--text)]">{getProductName(movement.productId)}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${movementColor(movement.movementType)}`}>
                    {movementLabel(movement.movementType)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-[var(--text)]">{movement.quantity}</td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{movement.reason || '-'}</td>
                <td className="px-4 py-2 text-[var(--text)]">{getLocationName(movement.locationId)}</td>
                <td className="px-4 py-2 text-[var(--text)]">
                  {movement.department?.name ?? '—'}
                </td>
                <td className="px-4 py-2 text-[var(--text-muted)]">{formatDate(movement.createdAt)}</td>
                {user.role === 'admin' && (
                  <td className="px-4 py-2 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleEdit(movement)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                        title="Edit movement"
                        aria-label="Edit movement"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(movement.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete movement"
                        aria-label="Delete movement"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
    </>
  );
}
