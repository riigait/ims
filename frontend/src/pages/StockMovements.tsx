import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { stockMovementsApi, productsApi, locationsApi, departmentsApi } from '@/services/api';
import { StockMovement, MovementType, Product, Location } from '@/types/inventory';
import { StockMovementFilter } from '@/types/filters';
import { formatDate } from '@/utils/ids';
import { filterStockMovements, sortStockMovements } from '@/utils/filterHelpers';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import StockDetails from '@/components/StockDetails';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

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

const FORM_MOVEMENT_OPTIONS = MOVEMENT_OPTIONS.filter(o => o.value !== 'opening_stock');

const movementColor = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.color ?? 'bg-gray-100 text-gray-800';

const movementLabel = (type: MovementType) =>
  MOVEMENT_OPTIONS.find(o => o.value === type)?.label ?? type;

const emptyForm = {
  movementType: 'stock_in' as MovementType,
  remarks: '',
  items: [{ stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }],
};

export default function StockMovements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStockDetails, setShowStockDetails] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filters, setFilters] = useState<StockMovementFilter & { departmentId?: string }>({
    search: '', movementType: undefined, dateRange: 'all', departmentId: undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<StockMovement | null>(null);
  const [drawerIsNew, setDrawerIsNew] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

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
    } catch {
      console.error('Failed to fetch data');
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

  const openNewDrawer = () => {
    setDrawerItem(null);
    setDrawerIsNew(true);
    setFormData(emptyForm);
    setFormError('');
    setDrawerOpen(true);
  };

  const openViewDrawer = (movement: StockMovement) => {
    setDrawerItem(movement);
    setDrawerIsNew(false);
    setFormError('');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setDrawerIsNew(false);
    setConfirmingDelete(false);
    setFormData(emptyForm);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = formData.items.filter(item => (item.stockDetailId || item.productId) && item.quantity > 0);
    if (validItems.length === 0) {
      setFormError('Please select at least one product and enter a valid quantity');
      return;
    }
    try {
      await stockMovementsApi.create({
        movementType: formData.movementType,
        remarks: formData.remarks || null,
        items: validItems,
      });
      await fetchData();
      closeDrawer();
      setError('');
    } catch (err: any) {
      setFormError(err?.response?.data?.error ?? 'Failed to create stock movement');
    }
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await stockMovementsApi.delete(drawerItem.id);
      await fetchData();
      closeDrawer();
      setError('');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to delete stock movement');
      setConfirmingDelete(false);
    }
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

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input type="text" placeholder="Search by product name…"
          value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
        <select value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="product-name">Sort: Product Name</option>
          <option value="quantity-high">Sort: Quantity (High)</option>
          <option value="quantity-low">Sort: Quantity (Low)</option>
        </select>
        <button onClick={clearAllFilters} className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">Clear</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={filters.movementType || ''}
          onChange={e => { setFilters({ ...filters, movementType: e.target.value as any || undefined }); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Movement Types</option>
          {MOVEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {user.role === 'superadmin' && (
          <select value={filters.departmentId || ''}
            onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
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
      {showStockDetails && selectedProductId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[var(--text)]">Manage Stock Details</h2>
              <button onClick={() => { setShowStockDetails(false); setSelectedProductId(null); }} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <StockDetails productId={selectedProductId} productName={getProductName(selectedProductId)} />
            </div>
          </div>
        </div>
      )}

      <DataPageLayout
        title="Stock Movements"
        error={error}
        showForm={false}
        formContent={null}
        onAddClick={openNewDrawer}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        filterContent={filterContent}>
        <div className="space-y-3">
          {filteredAndSortedMovements.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)]">
              {movements.length === 0 ? 'No movements recorded yet.' : 'No movements match your filters.'}
            </div>
          ) : paginatedMovements.map(movement => (
            <div
              key={movement.id}
              onClick={() => openViewDrawer(movement)}
              className="border border-[var(--border)] rounded-lg p-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${movementColor(movement.movementType)}`}>
                    {movementLabel(movement.movementType)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">#{movement.movementNo}</span>
                  {movement.remarks && (
                    <span className="text-sm text-[var(--text-muted)] truncate max-w-xs">{movement.remarks}</span>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)] flex-shrink-0 ml-2">{formatDate(movement.createdAt)}</span>
              </div>
              <div className="space-y-1">
                {(movement.items || []).slice(0, 3).map((item: any, idx: number) => (
                  <div key={idx} className="text-xs text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text)]">{item.product?.name || 'Unknown'}</span>
                    <span className="mx-1">·</span>
                    <span>qty {item.quantity}</span>
                    {(item.fromLocation || item.toLocation) && (
                      <span className="mx-1">· {item.fromLocation?.name ?? '?'} → {item.toLocation?.name ?? '?'}</span>
                    )}
                  </div>
                ))}
                {(movement.items || []).length > 3 && (
                  <p className="text-xs text-[var(--text-muted)]">+{(movement.items || []).length - 3} more items</p>
                )}
              </div>
              {movement.department?.name && (
                <p className="text-xs text-[var(--text-muted)] mt-2">{movement.department.name}</p>
              )}
            </div>
          ))}
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

      {/* Right-Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  {drawerIsNew ? (
                    <h2 className="text-lg font-semibold text-[var(--text)]">Record Stock Movement</h2>
                  ) : drawerItem && (
                    <>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${movementColor(drawerItem.movementType)}`}>
                        {movementLabel(drawerItem.movementType)}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">#{drawerItem.movementNo}</span>
                    </>
                  )}
                </div>
                {drawerItem && !drawerIsNew && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(drawerItem.createdAt)}</p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerIsNew ? (
                <form id="movement-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Movement Type *</label>
                      <select value={formData.movementType}
                        onChange={e => setFormData({ ...formData, movementType: e.target.value as MovementType })}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                        {FORM_MOVEMENT_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {formData.movementType === 'stock_in' && 'Received goods or stock arriving'}
                        {formData.movementType === 'stock_out' && 'Sales, shipments, or stock leaving'}
                        {formData.movementType === 'adjustment' && 'Manual corrections or count differences'}
                        {formData.movementType === 'returned' && 'Customer returns or items coming back'}
                        {formData.movementType === 'damaged' && 'Damaged items being written off'}
                        {formData.movementType === 'transfer' && 'Moving stock between locations'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">General Remarks</label>
                      <input type="text" value={formData.remarks}
                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                        placeholder="e.g., Purchase order #123, Batch adjustment..."
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </div>

                  <div className="border-t border-[var(--border)] pt-4">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Items *</h3>
                    <div className="space-y-3">
                      {formData.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-[var(--surface-2)] rounded-lg space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Product *</label>
                              <select value={item.productId}
                                onChange={e => {
                                  const newItems = [...formData.items];
                                  newItems[idx] = { ...item, productId: e.target.value, stockDetailId: '' };
                                  setFormData({ ...formData, items: newItems });
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                                <option value="">Select product</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name} ({p.currentStock})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Quantity *</label>
                              <input type="number" min={1} value={item.quantity || ''}
                                onChange={e => {
                                  const newItems = [...formData.items];
                                  newItems[idx].quantity = parseInt(e.target.value) || 0;
                                  setFormData({ ...formData, items: newItems });
                                }}
                                placeholder="0"
                                className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">From Location</label>
                              <select value={(item.fromLocationId as string) || ''}
                                onChange={e => {
                                  const newItems = [...formData.items];
                                  newItems[idx].fromLocationId = e.target.value || '';
                                  setFormData({ ...formData, items: newItems });
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                                <option value="">—</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">To Location</label>
                              <select value={(item.toLocationId as string) || ''}
                                onChange={e => {
                                  const newItems = [...formData.items];
                                  newItems[idx].toLocationId = e.target.value || '';
                                  setFormData({ ...formData, items: newItems });
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--text)]">
                                <option value="">—</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </select>
                            </div>
                          </div>
                          {formData.items.length > 1 && (
                            <button type="button"
                              onClick={() => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) })}
                              className="text-xs text-red-500 hover:text-red-700">
                              Remove item
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button"
                      onClick={() => setFormData({
                        ...formData,
                        items: [...formData.items, { stockDetailId: '', productId: '', quantity: 0, fromLocationId: '', toLocationId: '', reason: '' }],
                      })}
                      className="mt-2 text-sm px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)]">
                      + Add Item
                    </button>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                </form>
              ) : drawerItem && (
                <div className="space-y-6">
                  {drawerItem.remarks && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Remarks</h3>
                      <p className="text-sm text-[var(--text)]">{drawerItem.remarks}</p>
                    </section>
                  )}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Items</h3>
                    <div className="space-y-2">
                      {(drawerItem.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="p-3 bg-[var(--surface-2)] rounded-lg text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Product</p>
                              <p className="font-medium text-[var(--text)]">{item.product?.name || 'Unknown'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Stock ID</p>
                              <p className="text-[var(--text)] font-mono text-xs">{item.stockDetail?.stockId || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Quantity</p>
                              <p className="font-medium text-[var(--text)]">{item.quantity}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Locations</p>
                              <p className="text-[var(--text)]">{item.fromLocation?.name || '—'} → {item.toLocation?.name || '—'}</p>
                            </div>
                          </div>
                          {item.reason && (
                            <p className="text-xs text-[var(--text-muted)] mt-2 italic">{item.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Details</h3>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Department</p>
                        <p className="text-sm text-[var(--text)]">{drawerItem.department?.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Recorded</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(drawerItem.createdAt)}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
              {drawerIsNew ? (
                <div className="flex gap-2">
                  <button type="submit" form="movement-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Record Movement
                  </button>
                  <button type="button" onClick={closeDrawer}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete this movement?</p>
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
              ) : drawerItem && user.role === 'admin' && (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} /> Delete
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
