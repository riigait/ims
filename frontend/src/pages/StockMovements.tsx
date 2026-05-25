import { useState, useEffect } from 'react';
import { stockMovementsApi, productsApi, locationsApi, departmentsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { StockMovementFilter } from '@/types/filters';
import { formatDate } from '@/utils/ids';
import { filterStockMovements, sortStockMovements } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
import StockDetails from '@/components/StockDetails';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { Trash2, X } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

const MOVEMENT_OPTIONS: { value: MovementType; label: string; color: string }[] = [
  { value: 'stock_in',      label: 'Stock In',      color: 'bg-green-100 text-green-800' },
  { value: 'stock_out',     label: 'Stock Out',     color: 'bg-red-100 text-red-800' },
  { value: 'adjustment',    label: 'Adjustment',    color: 'bg-blue-100 text-blue-800' },
  { value: 'returned',      label: 'Returned',      color: 'bg-teal-100 text-teal-800' },
  { value: 'damaged',       label: 'Damaged',       color: 'bg-orange-100 text-orange-800' },
  { value: 'transfer',      label: 'Transfer',      color: 'bg-purple-100 text-purple-800' },
  { value: 'opening_stock', label: 'Opening Stock', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'deployment',    label: 'Deployment',    color: 'bg-cyan-100 text-cyan-800' },
  { value: 'repair',        label: 'Repair',        color: 'bg-yellow-100 text-yellow-800' },
  { value: 'disposal',      label: 'Disposal',      color: 'bg-gray-100 text-gray-800' },
  { value: 'borrowed',      label: 'Borrowed',      color: 'bg-violet-100 text-violet-800' },
  { value: 'lost',          label: 'Lost',          color: 'bg-rose-100 text-rose-800' },
];

// Options shown in the create form — opening_stock is system-generated, not manually selectable
const FORM_MOVEMENT_OPTIONS = MOVEMENT_OPTIONS.filter(o => o.value !== 'opening_stock');

const movementColor = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.color ?? 'bg-gray-100 text-gray-800';

const movementLabel = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.label ?? type;

const emptyForm = {
  movementType: 'stock_in' as MovementType,
  remarks: '',
  items: [
    {
      stockDetailId: '',
      productId: '',
      quantity: 0,
      fromLocationId: '',
      toLocationId: '',
      reason: '',
    }
  ],
};

export default function StockMovements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showStockDetails, setShowStockDetails] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
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
        stockMovementsApi.getAll(),
        productsApi.getAll(),
        locationsApi.getAll(),
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

    // Validate items - need either stockDetailId OR productId, plus valid quantity
    const validItems = formData.items.filter(item => (item.stockDetailId || item.productId) && item.quantity > 0);
    if (validItems.length === 0) {
      setError('Please select at least one product and enter a valid quantity');
      return;
    }

    try {
      const payload = {
        movementType: formData.movementType,
        remarks: formData.remarks || null,
        items: validItems,
      };

      if (editingId) {
        await stockMovementsApi.update(editingId, payload);
      } else {
        await stockMovementsApi.create(payload);
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
      <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">Record Stock Movement</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="movement-type" className="block text-sm font-medium text-[var(--text)] mb-1">Movement Type *</label>
            <select id="movement-type" value={formData.movementType}
              onChange={e => setFormData({ ...formData, movementType: e.target.value as MovementType })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
              {FORM_MOVEMENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {formData.movementType === 'stock_in' && 'ℹ️ Received goods or stock arriving'}
              {formData.movementType === 'stock_out' && 'ℹ️ Sales, shipments, or stock leaving'}
              {formData.movementType === 'adjustment' && 'ℹ️ Manual corrections or count differences'}
              {formData.movementType === 'returned' && 'ℹ️ Customer returns or items coming back'}
              {formData.movementType === 'damaged' && 'ℹ️ Damaged items being written off'}
              {formData.movementType === 'transfer' && 'ℹ️ Moving stock between locations'}
            </p>
          </div>
          <div>
            <label htmlFor="movement-remarks" className="block text-sm font-medium text-[var(--text)] mb-1">General Remarks</label>
            <input id="movement-remarks" type="text" value={formData.remarks}
              onChange={e => setFormData({ ...formData, remarks: e.target.value })}
              placeholder="e.g., Purchase order #123, Batch adjustment..."
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Items *</h3>
          <div className="space-y-3">
            {formData.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-[var(--surface-2)] rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Product *</label>
                  <select value={item.productId}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx] = {
                        ...item,
                        productId: e.target.value,
                        stockDetailId: '', // Leave empty - backend will create StockDetail
                      };
                      setFormData({ ...formData, items: newItems });
                    }}
                    className="w-full px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                    <option value="">Select product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {p.currentStock})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Quantity *</label>
                  <input type="number" min={1} value={item.quantity || ''}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx].quantity = parseInt(e.target.value) || 0;
                      setFormData({ ...formData, items: newItems });
                    }}
                    placeholder="0"
                    className="w-full px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">From Location</label>
                  <select value={(item.fromLocationId as string) || ''}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx].fromLocationId = e.target.value || '';
                      setFormData({ ...formData, items: newItems });
                    }}
                    className="w-full px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                    <option value="">—</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">To Location</label>
                  <select value={(item.toLocationId as string) || ''}
                    onChange={e => {
                      const newItems = [...formData.items];
                      newItems[idx].toLocationId = e.target.value || '';
                      setFormData({ ...formData, items: newItems });
                    }}
                    className="w-full px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                    <option value="">—</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setFormData({
            ...formData,
            items: [...formData.items, { stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }]
          })}
            className="mt-2 text-sm px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)]">
            + Add Item
          </button>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
            Record Movement
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

      {showStockDetails && selectedProductId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[var(--text)]">Manage Stock Details</h2>
              <button
                onClick={() => { setShowStockDetails(false); setSelectedProductId(null); }}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <StockDetails
                productId={selectedProductId}
                productName={getProductName(selectedProductId)}
              />
            </div>
          </div>
        </div>
      )}

      <DataPageLayout
        title="Stock Movements"
        error={error}
        showForm={showForm}
        onAddClick={() => { setFormData(emptyForm); setEditingId(null); setShowForm(true); }}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        formContent={formContent}
        filterContent={filterContent}>
      <div className="space-y-4">
        {filteredAndSortedMovements.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)]">
            {movements.length === 0 ? 'No movements recorded yet.' : 'No movements match your filters.'}
          </div>
        ) : (
          paginatedMovements.map(movement => (
            <div key={movement.id} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface)]">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${movementColor(movement.movementType)}`}>
                      {movementLabel(movement.movementType)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">Movement #{movement.movementNo}</span>
                  </div>
                  {movement.remarks && (
                    <p className="text-sm text-[var(--text-muted)]">{movement.remarks}</p>
                  )}
                </div>
                {user.role === 'admin' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(movement.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                      title="Delete movement"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 mb-3">
                {(movement.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="bg-[var(--surface-2)] p-3 rounded text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <span className="text-xs text-[var(--text-muted)]">Product</span>
                        <p className="text-[var(--text)] font-medium">{item.product?.name || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-muted)]">Stock ID</span>
                        <p className="text-[var(--text)]">{item.stockDetail?.stockId || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-muted)]">Quantity</span>
                        <p className="text-[var(--text)] font-medium">{item.quantity}</p>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-muted)]">Locations</span>
                        <p className="text-[var(--text)]">
                          {item.fromLocation?.name || '—'} → {item.toLocation?.name || '—'}
                        </p>
                      </div>
                    </div>
                    {item.reason && (
                      <p className="text-xs text-[var(--text-muted)] mt-2">Reason: {item.reason}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center text-xs text-[var(--text-muted)]">
                <div>
                  Department: {movement.department?.name || '—'}
                </div>
                <div>
                  {formatDate(movement.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
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
