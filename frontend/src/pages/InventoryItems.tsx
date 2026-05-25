import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Edit, ArrowLeftRight, ChevronRight } from 'lucide-react';
import { stockDetailsApi, locationsApi, productsApi } from '@/services/api';
import Pagination from '@/components/Pagination';

const STATUS_OPTIONS = ['active', 'deployed', 'borrowed', 'repair', 'returned', 'damaged', 'lost', 'disposed', 'sold'];
const CONDITION_OPTIONS = ['new', 'good', 'fair', 'poor'];

const STATUS_COLOR: Record<string, string> = {
  active:   'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  deployed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100',
  borrowed: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100',
  repair:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  returned: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100',
  damaged:  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  lost:     'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
  disposed: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100',
  sold:     'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
};

const MOVEMENT_COLOR: Record<string, string> = {
  stock_in: 'bg-green-100 text-green-800', stock_out: 'bg-red-100 text-red-800',
  adjustment: 'bg-blue-100 text-blue-800', returned: 'bg-teal-100 text-teal-800',
  damaged: 'bg-orange-100 text-orange-800', transfer: 'bg-purple-100 text-purple-800',
  opening_stock: 'bg-indigo-100 text-indigo-800', deployment: 'bg-cyan-100 text-cyan-800',
  repair: 'bg-yellow-100 text-yellow-800', disposal: 'bg-gray-100 text-gray-800',
  borrowed: 'bg-violet-100 text-violet-800', lost: 'bg-rose-100 text-rose-800',
};

const MOVEMENT_LABEL: Record<string, string> = {
  stock_in: 'Stock In', stock_out: 'Stock Out', adjustment: 'Adjustment',
  returned: 'Returned', damaged: 'Damaged', transfer: 'Transfer',
  opening_stock: 'Opening Stock', deployment: 'Deployment', repair: 'Repair',
  disposal: 'Disposal', borrowed: 'Borrowed', lost: 'Lost',
};

const emptyForm = {
  assetTag: '', barcode: '', modelNumber: '', serialNumber: '', macId: '',
  dateStock: '', condition: 'new', warrantyExpiry: '', warrantyNotes: '',
  currentStatus: 'active', currentLocationId: '', notes: '',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm text-[var(--text)] font-medium">{value || '—'}</p>
    </div>
  );
}

export default function InventoryItems() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [items, setItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer
  const [drawerItem, setDrawerItem] = useState<any | null>(null);
  const [drawerMovements, setDrawerMovements] = useState<any[]>([]);
  const [drawerMovementsLoading, setDrawerMovementsLoading] = useState(false);

  // Edit form (inline, not a drawer)
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const fetchData = async () => {
    try {
      const [itemsRes, productsRes, locationsRes] = await Promise.all([
        stockDetailsApi.getAll(),
        productsApi.getAll(),
        locationsApi.getAll(),
      ]);
      setItems(itemsRes.data);
      setAllProducts(productsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openDrawer = async (item: any) => {
    setDrawerItem(item);
    setDrawerMovements([]);
    setDrawerMovementsLoading(true);
    try {
      const res = await stockDetailsApi.getMovements(item.id);
      setDrawerMovements(res.data);
    } catch { /* ignore */ } finally {
      setDrawerMovementsLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerItem(null);
    setDrawerMovements([]);
  };

  const openEdit = (item: any) => {
    setFormData({
      assetTag: item.assetTag || '',
      barcode: item.barcode || '',
      modelNumber: item.modelNumber || '',
      serialNumber: item.serialNumber || '',
      macId: item.macId || '',
      dateStock: item.dateStock ? new Date(item.dateStock).toISOString().split('T')[0] : '',
      condition: item.condition || 'new',
      warrantyExpiry: item.warrantyExpiry ? new Date(item.warrantyExpiry).toISOString().split('T')[0] : '',
      warrantyNotes: item.warrantyNotes || '',
      currentStatus: item.currentStatus || 'active',
      currentLocationId: item.currentLocationId || '',
      notes: item.notes || '',
    });
    setEditingItem(item);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await stockDetailsApi.update(editingItem.id, {
        ...formData,
        currentLocationId: formData.currentLocationId || null,
        dateStock: formData.dateStock || null,
        warrantyExpiry: formData.warrantyExpiry || null,
        assetTag: formData.assetTag || null,
        barcode: formData.barcode || null,
      });
      await fetchData();
      // refresh drawer if open for same item
      if (drawerItem?.id === editingItem.id) {
        const res = await stockDetailsApi.getById(editingItem.id);
        setDrawerItem(res.data);
      }
      setEditingItem(null);
      setFormError('');
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to update item');
    }
  };

  const filtered = items.filter(item => {
    if (filterProduct && item.productId !== filterProduct) return false;
    if (filterStatus && item.currentStatus !== filterStatus) return false;
    if (filterLocation && item.currentLocationId !== filterLocation) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.stockId?.toLowerCase().includes(q) ||
        item.assetTag?.toLowerCase().includes(q) ||
        item.product?.name?.toLowerCase().includes(q) ||
        item.serialNumber?.toLowerCase().includes(q) ||
        item.macId?.toLowerCase().includes(q) ||
        item.modelNumber?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = items.filter(i => i.currentStatus === s).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Inventory Items</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2">
          {items.length} total ·{' '}
          <span className="text-green-600">{statusCounts.active} active</span> ·{' '}
          <span className="text-cyan-600">{statusCounts.deployed} deployed</span> ·{' '}
          <span className="text-orange-600">{statusCounts.damaged} damaged</span> ·{' '}
          <span className="text-rose-600">{statusCounts.lost} lost</span>
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Each row is one physical unit. Click any row to view details and edit.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-4">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
          placeholder="Search ID, asset tag, serial, MAC, barcode..."
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)] min-w-[260px]" />
        <select value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Products</option>
          {allProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={filterLocation} onChange={e => { setFilterLocation(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {(search || filterProduct || filterStatus || filterLocation) && (
          <button onClick={() => { setSearch(''); setFilterProduct(''); setFilterStatus(''); setFilterLocation(''); setCurrentPage(1); }}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
          <p className="text-[var(--text-muted)]">No inventory items found.</p>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="hidden md:grid md:grid-cols-7 gap-4 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
            <div>Asset ID</div>
            <div>Product</div>
            <div>Serial No.</div>
            <div>MAC / Barcode</div>
            <div>Condition</div>
            <div>Status</div>
            <div>Location</div>
          </div>
          {paginated.map(item => (
            <div
              key={item.id}
              onClick={() => openDrawer(item)}
              className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
            >
              <div className="flex-1 grid grid-cols-2 md:grid-cols-7 gap-4 text-sm min-w-0">
                <div>
                  <span className="font-mono text-xs text-[var(--primary)] font-semibold">{item.stockId || '—'}</span>
                  {item.assetTag && <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{item.assetTag}</p>}
                </div>
                <div className="truncate font-medium text-[var(--text)]">{item.product?.name || '—'}</div>
                <div className="truncate font-mono text-xs text-[var(--text-muted)]">{item.serialNumber || '—'}</div>
                <div className="truncate font-mono text-xs text-[var(--text-muted)]">{item.macId || item.barcode || '—'}</div>
                <div className="capitalize text-[var(--text-muted)] text-xs">{item.condition || '—'}</div>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[item.currentStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                    {item.currentStatus}
                  </span>
                </div>
                <div className="truncate text-[var(--text-muted)]">{item.currentLocation?.name || '—'}</div>
              </div>
              <ChevronRight size={16} className="text-[var(--text-muted)] flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Pagination currentPage={currentPage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} />
      </div>

      {/* Side Drawer */}
      {drawerItem && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-[var(--primary)] font-bold">{drawerItem.stockId}</span>
                  {drawerItem.assetTag && (
                    <span className="font-mono text-xs bg-[var(--surface-2)] px-2 py-0.5 rounded text-[var(--text-muted)]">{drawerItem.assetTag}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[drawerItem.currentStatus] ?? 'bg-gray-100 text-gray-800'}`}>
                    {drawerItem.currentStatus}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-[var(--text)] mt-1 truncate">{drawerItem.product?.name}</h2>
                <p className="text-sm text-[var(--text-muted)]">{drawerItem.product?.category?.name || drawerItem.product?.sku}</p>
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

              {editingItem?.id === drawerItem.id ? (
                /* Inline Edit Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="font-semibold text-[var(--text)]">Edit Details</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { field: 'assetTag', label: 'Asset Tag', placeholder: 'IMS-2026-000001' },
                      { field: 'barcode', label: 'Barcode', placeholder: 'Barcode value' },
                      { field: 'serialNumber', label: 'Serial Number', placeholder: 'SN123456' },
                      { field: 'macId', label: 'MAC Address', placeholder: '00:1A:2B:3C:4D:5E' },
                      { field: 'modelNumber', label: 'Model Number', placeholder: 'e.g. Archer C24' },
                      { field: 'dateStock', label: 'Date Received', type: 'date' },
                      { field: 'warrantyExpiry', label: 'Warranty Expiry', type: 'date' },
                    ].map(({ field, label, placeholder, type }) => (
                      <div key={field}>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
                        <input type={type || 'text'} value={(formData as any)[field]}
                          onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Condition</label>
                      <select value={formData.condition} onChange={e => setFormData({ ...formData, condition: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Status</label>
                      <select value={formData.currentStatus} onChange={e => setFormData({ ...formData, currentStatus: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Location</label>
                      <select value={formData.currentLocationId} onChange={e => setFormData({ ...formData, currentLocationId: e.target.value })}
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]">
                        <option value="">— No location —</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Warranty Notes</label>
                      <input type="text" value={formData.warrantyNotes}
                        onChange={e => setFormData({ ...formData, warrantyNotes: e.target.value })}
                        placeholder="Warranty details..."
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Notes</label>
                      <textarea value={formData.notes} rows={2}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Additional notes..."
                        className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                    </div>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">Save</button>
                    <button type="button" onClick={() => setEditingItem(null)} className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Identity */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Identity</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Asset Tag" value={drawerItem.assetTag} />
                      <Field label="Barcode" value={drawerItem.barcode} />
                      <Field label="Serial Number" value={drawerItem.serialNumber} />
                      <Field label="MAC Address" value={drawerItem.macId} />
                      <Field label="Model Number" value={drawerItem.modelNumber} />
                      <Field label="Product SKU" value={drawerItem.product?.sku} />
                    </div>
                  </section>

                  {/* Condition & Status */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Condition & Location</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Condition" value={drawerItem.condition ? drawerItem.condition.charAt(0).toUpperCase() + drawerItem.condition.slice(1) : null} />
                      <Field label="Location" value={drawerItem.currentLocation?.name} />
                      <Field label="Date Received" value={drawerItem.dateStock ? new Date(drawerItem.dateStock).toLocaleDateString() : null} />
                      <Field label="Date Added" value={new Date(drawerItem.createdAt).toLocaleDateString()} />
                    </div>
                  </section>

                  {/* Warranty */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Warranty</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Warranty Expiry" value={drawerItem.warrantyExpiry ? new Date(drawerItem.warrantyExpiry).toLocaleDateString() : null} />
                      <Field label="Warranty Notes" value={drawerItem.warrantyNotes} />
                    </div>
                  </section>

                  {/* Notes */}
                  {drawerItem.notes && (
                    <section>
                      <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Notes</h3>
                      <p className="text-sm text-[var(--text)]">{drawerItem.notes}</p>
                    </section>
                  )}

                  {/* Movement History */}
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Movement History</h3>
                    {drawerMovementsLoading ? (
                      <p className="text-sm text-[var(--text-muted)]">Loading…</p>
                    ) : drawerMovements.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No movements recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {drawerMovements.map(mi => (
                          <div key={mi.id} className="flex items-start gap-3 p-3 bg-[var(--surface-2)] rounded-lg">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${MOVEMENT_COLOR[mi.movement?.movementType] ?? 'bg-gray-100 text-gray-800'}`}>
                              {MOVEMENT_LABEL[mi.movement?.movementType] ?? mi.movement?.movementType}
                            </span>
                            <div className="flex-1 min-w-0 text-xs text-[var(--text-muted)]">
                              <p className="font-medium text-[var(--text)]">{mi.movement?.movementNo ?? '—'}</p>
                              {(mi.fromLocation || mi.toLocation) && (
                                <p>{mi.fromLocation?.name ?? '?'} → {mi.toLocation?.name ?? '?'}</p>
                              )}
                              {mi.reason && <p className="italic">{mi.reason}</p>}
                              <p>{new Date(mi.createdAt).toLocaleDateString()} · qty {mi.quantity}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* Drawer Actions */}
            {!editingItem && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
                {user.role !== 'superadmin' && (
                  <button
                    onClick={() => openEdit(drawerItem)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    <Edit size={14} /> Edit Details
                  </button>
                )}
                <button
                  onClick={() => { closeDrawer(); navigate('/stock-movements'); }}
                  className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                  <ArrowLeftRight size={14} /> Move Item
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
