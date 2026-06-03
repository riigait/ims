import { useState, useEffect } from 'react';
import { useNavigate, useLocation as useRouteLocation } from 'react-router-dom';
import { Plus, Trash2, Copy, ChevronLeft, Save, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { productsApi, categoriesApi, locationsApi } from '@/services/api';
import { Category, Location } from '@/types/inventory';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

const UNITS = ['pcs', 'units', 'sets', 'boxes', 'rolls', 'meters', 'liters', 'kg'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

interface BulkRow {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  locationId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  supplier: string;
  notes: string;
}

interface RowResult {
  success: boolean;
  error?: string;
}

interface Defaults {
  categoryId: string;
  locationId: string;
  unit: string;
  supplier: string;
}

function makeRow(defaults: Partial<Defaults> = {}): BulkRow {
  return {
    id: uid(),
    name: '',
    sku: '',
    categoryId: defaults.categoryId || '',
    locationId: defaults.locationId || '',
    quantity: '0',
    unit: defaults.unit || 'pcs',
    unitPrice: '0',
    supplier: defaults.supplier || '',
    notes: '',
  };
}

export default function BulkAddProducts() {
  const navigate = useNavigate();
  const routeLocation = useRouteLocation();
  const routeState = (routeLocation.state as any) || {};
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentDeptId = localStorage.getItem('currentDepartmentId');

  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [defaults, setDefaults] = useState<Defaults>({ categoryId: '', locationId: routeState.locationId || '', unit: 'pcs', supplier: '' });
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, () => makeRow()));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [rowResults, setRowResults] = useState<Record<string, RowResult>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    categoriesApi.getAll().then(r => setCategories(r.data)).catch(() => {});
    locationsApi.getAll().then(r => setLocations(r.data)).catch(() => {});
  }, []);

  if (user.role === 'superadmin' || currentDeptId === ALL_DEPARTMENTS_ID) {
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        Select a specific department to add products.
      </div>
    );
  }

  function addRow() {
    setRows(prev => [...prev, makeRow(defaults)]);
  }

  function duplicateRow(rowId: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      const copy = { ...prev[idx], id: uid() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function removeRow(rowId: string) {
    setRows(prev => {
      const next = prev.filter(r => r.id !== rowId);
      return next.length === 0 ? [makeRow(defaults)] : next;
    });
    setRowErrors(prev => { const e = { ...prev }; delete e[rowId]; return e; });
    setRowResults(prev => { const e = { ...prev }; delete e[rowId]; return e; });
  }

  function updateRow(rowId: string, field: keyof BulkRow, value: string) {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
    if (rowErrors[rowId]) setRowErrors(prev => { const e = { ...prev }; delete e[rowId]; return e; });
    if (rowResults[rowId]) setRowResults(prev => { const e = { ...prev }; delete e[rowId]; return e; });
  }

  function clearEmptyRows() {
    const filled = rows.filter(r => r.name.trim());
    setRows(filled.length > 0 ? filled : [makeRow(defaults)]);
  }

  function validateLocal(): boolean {
    const errors: Record<string, string> = {};
    const names = new Map<string, string>();
    rows.forEach(row => {
      if (!row.name.trim()) return;
      const key = row.name.trim().toLowerCase();
      if (names.has(key)) {
        errors[row.id] = 'Duplicate name in this batch';
        const firstId = names.get(key)!;
        if (!errors[firstId]) errors[firstId] = 'Duplicate name in this batch';
      } else {
        names.set(key, row.id);
      }
      const qty = parseInt(row.quantity);
      if (isNaN(qty) || qty < 0) errors[row.id] = (errors[row.id] ? errors[row.id] + '; ' : '') + 'Quantity must be ≥ 0';
      const price = parseFloat(row.unitPrice);
      if (isNaN(price) || price < 0) errors[row.id] = (errors[row.id] ? errors[row.id] + '; ' : '') + 'Price must be ≥ 0';
    });
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSave() {
    const filledRows = rows.filter(r => r.name.trim());
    if (filledRows.length === 0) return;
    if (!validateLocal()) return;

    setSaving(true);
    setRowResults({});

    try {
      const payload = filledRows.map(r => ({
        name: r.name.trim(),
        sku: r.sku.trim() || undefined,
        categoryId: r.categoryId || defaults.categoryId || undefined,
        locationId: r.locationId || defaults.locationId || undefined,
        quantity: parseInt(r.quantity) || 0,
        unit: r.unit || defaults.unit || 'pcs',
        unitPrice: parseFloat(r.unitPrice) || 0,
        supplier: (r.supplier || defaults.supplier || '').trim() || undefined,
        notes: r.notes.trim() || undefined,
      }));

      const res = await productsApi.bulkCreate(payload);
      const results: Array<{ index: number; success: boolean; name?: string; error?: string }> = res.data.results;

      const newRowResults: Record<string, RowResult> = {};
      const successIds = new Set<string>();

      results.forEach(result => {
        const row = filledRows[result.index];
        if (!row) return;
        newRowResults[row.id] = { success: result.success, error: result.error };
        if (result.success) successIds.add(row.id);
      });

      setRowResults(newRowResults);
      setSavedCount(prev => prev + successIds.size);

      // Remove successfully saved rows after a short delay
      if (successIds.size > 0) {
        setTimeout(() => {
          setRows(prev => {
            const remaining = prev.filter(r => !successIds.has(r.id));
            return remaining.length > 0 ? remaining : [makeRow(defaults)];
          });
          setRowResults(prev => {
            const e = { ...prev };
            successIds.forEach(id => delete e[id]);
            return e;
          });
        }, 1200);
      }
    } catch {
      // network/server error shown in console
    } finally {
      setSaving(false);
    }
  }

  const filledCount = rows.filter(r => r.name.trim()).length;
  const hasErrors = Object.keys(rowErrors).length > 0;
  const failedCount = Object.values(rowResults).filter(r => !r.success).length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/products')}
            className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            <ChevronLeft size={16} /> Products
          </button>
          <span className="text-[var(--border)]">/</span>
          <h1 className="text-base font-semibold text-[var(--text)]">Bulk Add Products</h1>
          {savedCount > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {savedCount} saved this session
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearEmptyRows}
            className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors text-[var(--text-muted)]">
            Clear Empty Rows
          </button>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)] transition-colors">
            <Plus size={13} /> Add Row
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-40 transition-colors">
            <Save size={14} />
            {saving ? 'Saving…' : `Save ${filledCount > 0 ? filledCount + ' ' : ''}Product${filledCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {failedCount > 0 && (
        <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-sm flex items-center gap-2 shrink-0">
          <XCircle size={15} className="text-red-500" />
          <span className="text-red-700">{failedCount} row{failedCount !== 1 ? 's' : ''} failed — fix the highlighted rows and save again.</span>
        </div>
      )}

      {/* Defaults bar */}
      <div className="px-6 py-3 bg-[var(--surface-2)] border-b border-[var(--border)] shrink-0">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Defaults</span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--text-muted)]">Category</label>
            <select
              value={defaults.categoryId}
              onChange={e => setDefaults(d => ({ ...d, categoryId: e.target.value }))}
              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]">
              <option value="">— none —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--text-muted)]">Location</label>
            <select
              value={defaults.locationId}
              onChange={e => setDefaults(d => ({ ...d, locationId: e.target.value }))}
              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]">
              <option value="">— none —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--text-muted)]">Unit</label>
            <select
              value={defaults.unit}
              onChange={e => setDefaults(d => ({ ...d, unit: e.target.value }))}
              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--text-muted)]">Supplier</label>
            <input
              type="text"
              value={defaults.supplier}
              onChange={e => setDefaults(d => ({ ...d, supplier: e.target.value }))}
              placeholder="default supplier"
              className="text-xs border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)] w-36"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="min-w-[1080px]">
          {/* Header row */}
          <div className="grid gap-1.5 px-2 py-1.5 bg-[var(--surface-2)] rounded-t-lg border border-b-0 border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider"
            style={{ gridTemplateColumns: '28px 1fr 110px 130px 130px 64px 74px 84px 110px 1fr 58px' }}>
            <div>#</div>
            <div>Product Name *</div>
            <div>SKU</div>
            <div>Category</div>
            <div>Location</div>
            <div>Qty</div>
            <div>Unit</div>
            <div>Price</div>
            <div>Supplier</div>
            <div>Notes</div>
            <div></div>
          </div>

          {/* Rows */}
          <div className="border border-[var(--border)] rounded-b-lg divide-y divide-[var(--border)]">
            {rows.map((row, idx) => {
              const err = rowErrors[row.id];
              const result = rowResults[row.id];
              const isError = err || (result && !result.success);
              const isSuccess = result?.success;
              return (
                <div
                  key={row.id}
                  className={`grid gap-1.5 px-2 py-1.5 items-start text-xs transition-colors
                    ${isError ? 'bg-red-50 dark:bg-red-950/20' : isSuccess ? 'bg-green-50 dark:bg-green-950/20' : 'bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`}
                  style={{ gridTemplateColumns: '28px 1fr 110px 130px 130px 64px 74px 84px 110px 1fr 58px' }}>

                  <div className="text-[10px] text-[var(--text-muted)] font-mono pt-1.5">{idx + 1}</div>

                  <div>
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => updateRow(row.id, 'name', e.target.value)}
                      placeholder="Product name"
                      className={`w-full px-2 py-1 rounded border bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs
                        ${isError ? 'border-red-400' : 'border-[var(--border)]'}`}
                    />
                    {(err || (result && !result.success)) && (
                      <p className="mt-0.5 text-[10px] text-red-500 flex items-center gap-0.5">
                        <AlertCircle size={9} /> {err || result?.error}
                      </p>
                    )}
                    {isSuccess && (
                      <p className="mt-0.5 text-[10px] text-green-600 flex items-center gap-0.5">
                        <CheckCircle size={9} /> Saved
                      </p>
                    )}
                  </div>

                  <input
                    type="text"
                    value={row.sku}
                    onChange={e => updateRow(row.id, 'sku', e.target.value)}
                    placeholder="auto"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
                  />
                  <select
                    value={row.categoryId}
                    onChange={e => updateRow(row.id, 'categoryId', e.target.value)}
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none text-xs">
                    <option value="">—</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select
                    value={row.locationId}
                    onChange={e => updateRow(row.id, 'locationId', e.target.value)}
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none text-xs">
                    <option value="">—</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={e => updateRow(row.id, 'quantity', e.target.value)}
                    min="0"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
                  />
                  <select
                    value={row.unit}
                    onChange={e => updateRow(row.id, 'unit', e.target.value)}
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none text-xs">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <input
                    type="number"
                    value={row.unitPrice}
                    onChange={e => updateRow(row.id, 'unitPrice', e.target.value)}
                    min="0"
                    step="0.01"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
                  />
                  <input
                    type="text"
                    value={row.supplier}
                    onChange={e => updateRow(row.id, 'supplier', e.target.value)}
                    placeholder="supplier"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
                  />
                  <input
                    type="text"
                    value={row.notes}
                    onChange={e => updateRow(row.id, 'notes', e.target.value)}
                    placeholder="notes"
                    className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary)] text-xs"
                  />
                  <div className="flex gap-0.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => duplicateRow(row.id)}
                      title="Duplicate row"
                      className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] rounded transition-colors">
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      title="Remove row"
                      className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add row button */}
          <button
            type="button"
            onClick={addRow}
            className="mt-2 w-full py-2 text-xs text-[var(--text-muted)] hover:text-[var(--primary)] border border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-lg transition-colors flex items-center justify-center gap-1.5">
            <Plus size={13} /> Add Row
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-6 py-2 border-t border-[var(--border)] bg-[var(--surface-2)] shrink-0 flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          {rows.length} row{rows.length !== 1 ? 's' : ''} · {filledCount} filled
          {hasErrors && <span className="ml-2 text-red-500">· {Object.keys(rowErrors).length} validation error{Object.keys(rowErrors).length !== 1 ? 's' : ''}</span>}
        </span>
        <span>Leave SKU blank to auto-generate · Opening stock movement created for qty &gt; 0</span>
      </div>
    </div>
  );
}
