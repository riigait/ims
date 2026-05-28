import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, Database, Search, ShieldAlert, Skull, X, XCircle } from 'lucide-react';
import { departmentsApi, settingsApi } from '@/services/api';

type DeleteState = 'idle' | 'armed' | 'countdown' | 'deleting' | 'done' | 'error';
type SortDir = 'asc' | 'desc' | null;

export default function SuperadminSettings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // All data delete
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [message, setMessage] = useState('');

  // Department delete
  const [deptDeleteState, setDeptDeleteState] = useState<DeleteState>('idle');
  const [deptConfirmPhrase, setDeptConfirmPhrase] = useState('');
  const [deptCountdown, setDeptCountdown] = useState(5);
  const [deptMessage, setDeptMessage] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');

  // Department list controls
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  useEffect(() => {
    departmentsApi.getAll().then(res => setDepartments(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (deleteState !== 'countdown') return;
    if (countdown <= 0) { runDelete(); return; }
    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [deleteState, countdown]);

  useEffect(() => {
    if (deptDeleteState !== 'countdown') return;
    if (deptCountdown <= 0) { runDeptDelete(); return; }
    const timer = window.setTimeout(() => setDeptCountdown(deptCountdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [deptDeleteState, deptCountdown]);

  const filteredDepts = useMemo(() => {
    let list = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
    if (sortDir === 'asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortDir === 'desc') list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    return list;
  }, [departments, search, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredDepts.length / pageSize));
  const pagedDepts = filteredDepts.slice((page - 1) * pageSize, page * pageSize);

  const cycleSortDir = () => {
    setSortDir(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null);
    setPage(1);
  };

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handlePageSize = (size: number) => { setPageSize(size); setPage(1); };

  const clearControls = () => {
    setSearch('');
    setSortDir(null);
    setPageSize(20);
    setPage(1);
    setSelectedDeptId('');
  };

  const beginCountdown = () => {
    if (confirmPhrase !== 'DELETE IMS DATA') {
      setMessage('Type DELETE IMS DATA exactly before the countdown can begin.');
      setDeleteState('error');
      return;
    }
    setMessage('');
    setCountdown(5);
    setDeleteState('countdown');
  };

  const beginDeptCountdown = () => {
    if (!selectedDeptId) {
      setDeptMessage('Select a department first.');
      setDeptDeleteState('error');
      return;
    }
    if (deptConfirmPhrase !== 'DELETE DEPT DATA') {
      setDeptMessage('Type DELETE DEPT DATA exactly before the countdown can begin.');
      setDeptDeleteState('error');
      return;
    }
    setDeptMessage('');
    setDeptCountdown(5);
    setDeptDeleteState('countdown');
  };

  const runDelete = async () => {
    try {
      setDeleteState('deleting');
      const response = await settingsApi.deleteOperationalData(confirmPhrase);
      setMessage(response.data.message || 'Operational data deleted.');
      setDeleteState('done');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Delete failed. No confirmation was received.');
      setDeleteState('error');
    }
  };

  const runDeptDelete = async () => {
    try {
      setDeptDeleteState('deleting');
      const response = await settingsApi.deleteDepartmentData(selectedDeptId, deptConfirmPhrase);
      setDeptMessage(response.data.message || 'Department data deleted.');
      setDeptDeleteState('done');
    } catch (error: any) {
      setDeptMessage(error.response?.data?.error || 'Delete failed.');
      setDeptDeleteState('error');
    }
  };

  if (user.role !== 'superadmin') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-red-700">
        Superadmin access required.
      </div>
    );
  }

  const suspenseActive = deleteState === 'countdown' || deleteState === 'deleting';
  const deptSuspenseActive = deptDeleteState === 'countdown' || deptDeleteState === 'deleting';
  const selectedDept = departments.find(d => d.id === selectedDeptId);

  const SortIcon = sortDir === 'asc' ? ChevronUp : sortDir === 'desc' ? ChevronDown : ChevronsUpDown;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-[var(--text)]">Settings</h1>
        <p className="text-[var(--text-muted)] mt-1">Superadmin controls for appearance, session, and dangerous database actions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <ShieldAlert size={20} />
            <h2 className="font-semibold">Superadmin Only</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">This page is hidden from admins and staff.</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <Database size={20} />
            <h2 className="font-semibold">Preserved Tables</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">Users, departments, admin assignments, and staff assignments remain.</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <AlertTriangle size={20} />
            <h2 className="font-semibold">Deleted Tables</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">Products, categories, locations, stock, movements, floorplans, requests, invites, and logs.</p>
        </div>
      </div>

      {/* All Data Delete */}
      <section className="relative overflow-hidden rounded-lg border border-red-500/40 bg-red-950 text-red-50 shadow-2xl">
        <div className={`absolute inset-0 bg-red-700/20 transition-opacity duration-700 ${suspenseActive ? 'opacity-100 animate-pulse' : 'opacity-30'}`} />
        <div className="relative p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="mt-1 rounded-full bg-red-500/20 p-3 text-red-200">
              <Skull size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-wide">Danger Zone — All Data</h2>
              <p className="mt-2 max-w-3xl text-sm text-red-100">
                This is the point of no return. It will erase operational IMS data from the database. The app will keep only users, departments, and department assignments.
              </p>
            </div>
          </div>

          {deleteState === 'idle' && (
            <button
              type="button"
              onClick={() => setDeleteState('armed')}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-red-500"
            >
              <AlertTriangle size={18} /> Open Destructive Control
            </button>
          )}

          {deleteState === 'armed' && (
            <div className="space-y-4 rounded-lg border border-red-300/30 bg-black/25 p-5">
              <div>
                <p className="text-sm font-semibold text-red-100">Final warning</p>
                <p className="mt-1 text-sm text-red-200">Type <span className="font-mono font-bold text-white">DELETE IMS DATA</span> to unlock the 5 second countdown.</p>
              </div>
              <input
                value={confirmPhrase}
                onChange={e => setConfirmPhrase(e.target.value)}
                className="w-full rounded-lg border border-red-300/40 bg-black/40 px-4 py-3 font-mono text-red-50 outline-none focus:border-red-200"
                placeholder="DELETE IMS DATA"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setDeleteState('idle'); setConfirmPhrase(''); setMessage(''); }}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-red-50 hover:bg-white/20"
                >
                  Step Away
                </button>
                <button
                  type="button"
                  onClick={beginCountdown}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                >
                  Delete It Now
                </button>
              </div>
            </div>
          )}

          {deleteState === 'countdown' && (
            <div className="rounded-lg border border-red-300/30 bg-black/40 p-8 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-red-200">Deletion begins in</p>
              <div className="my-4 text-8xl font-black tabular-nums text-white drop-shadow-lg">{countdown}</div>
              <p className="text-sm text-red-100">Close or navigate away now if this is a mistake.</p>
            </div>
          )}

          {deleteState === 'deleting' && (
            <div className="rounded-lg border border-red-300/30 bg-black/40 p-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-red-200 border-t-transparent animate-spin" />
              <p className="font-semibold text-white">Deleting operational data...</p>
              <p className="mt-1 text-sm text-red-200">Users and departments are being preserved.</p>
            </div>
          )}

          {(deleteState === 'done' || deleteState === 'error') && (
            <div className={`rounded-lg border p-4 ${deleteState === 'done' ? 'border-green-300/40 bg-green-500/10 text-green-100' : 'border-red-300/40 bg-black/30 text-red-100'}`}>
              <div className="flex items-center gap-2">
                {deleteState === 'error' && <XCircle size={18} />}
                <p className="font-semibold">{message}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Department Data Delete */}
      <section className="relative overflow-hidden rounded-lg border border-orange-500/40 bg-orange-950 text-orange-50 shadow-2xl">
        <div className={`absolute inset-0 bg-orange-700/20 transition-opacity duration-700 ${deptSuspenseActive ? 'opacity-100 animate-pulse' : 'opacity-30'}`} />
        <div className="relative p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="mt-1 rounded-full bg-orange-500/20 p-3 text-orange-200">
              <Skull size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-wide">Danger Zone — Department Data</h2>
              <p className="mt-2 max-w-3xl text-sm text-orange-100">
                Deletes all operational data for a single department only. Products, categories, locations, stock movements, floor plans, and logs for that department will be erased.
              </p>
            </div>
          </div>

          {deptDeleteState === 'idle' && (
            <button
              type="button"
              onClick={() => setDeptDeleteState('armed')}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-orange-500"
            >
              <AlertTriangle size={18} /> Delete Department Data
            </button>
          )}

          {deptDeleteState === 'armed' && (
            <div className="space-y-4 rounded-lg border border-orange-300/30 bg-black/25 p-5">

              {/* Search + Sort + Page size + Clear */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-300" />
                  <input
                    value={search}
                    onChange={e => handleSearch(e.target.value)}
                    placeholder="Search departments..."
                    className="w-full rounded-lg border border-orange-300/40 bg-black/40 pl-8 pr-3 py-2 text-sm text-orange-50 outline-none focus:border-orange-200 placeholder:text-orange-300/50"
                  />
                  {search && (
                    <button type="button" onClick={() => handleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-300 hover:text-white">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={cycleSortDir}
                  className="flex items-center gap-1.5 rounded-lg border border-orange-300/40 bg-black/40 px-3 py-2 text-sm text-orange-100 hover:bg-white/10"
                >
                  <SortIcon size={14} />
                  {sortDir === 'asc' ? 'A → Z' : sortDir === 'desc' ? 'Z → A' : 'Sort'}
                </button>
                <div className="flex items-center gap-1 rounded-lg border border-orange-300/40 bg-black/40 px-1 py-1">
                  {[20, 50, 100].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handlePageSize(n)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${pageSize === n ? 'bg-orange-600 text-white' : 'text-orange-200 hover:bg-white/10'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={clearControls}
                  className="flex items-center gap-1.5 rounded-lg border border-orange-300/40 bg-black/40 px-3 py-2 text-sm text-orange-200 hover:bg-white/10"
                >
                  <X size={14} /> Clear
                </button>
              </div>

              {/* Department list */}
              <div className="rounded-lg border border-orange-300/20 overflow-hidden">
                {pagedDepts.length === 0 ? (
                  <p className="p-4 text-sm text-orange-300 text-center">No departments found.</p>
                ) : (
                  <div className="divide-y divide-orange-300/10 max-h-64 overflow-y-auto">
                    {pagedDepts.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDeptId(d.id === selectedDeptId ? '' : d.id)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          d.id === selectedDeptId
                            ? 'bg-orange-600/60 text-white font-semibold'
                            : 'text-orange-100 hover:bg-white/5'
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-orange-300">
                  <span>{filteredDepts.length} department{filteredDepts.length !== 1 ? 's' : ''}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <span className="px-1">Page {page} / {totalPages}</span>
                    <button
                      type="button"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}

              {/* Selected indicator */}
              {selectedDeptId && (
                <p className="text-sm text-orange-100">
                  Selected: <span className="font-bold text-white">{selectedDept?.name}</span>
                </p>
              )}

              {/* Confirm phrase */}
              <div>
                <p className="text-sm text-orange-200">Type <span className="font-mono font-bold text-white">DELETE DEPT DATA</span> to unlock the 5 second countdown.</p>
              </div>
              <input
                value={deptConfirmPhrase}
                onChange={e => setDeptConfirmPhrase(e.target.value)}
                className="w-full rounded-lg border border-orange-300/40 bg-black/40 px-4 py-3 font-mono text-orange-50 outline-none focus:border-orange-200"
                placeholder="DELETE DEPT DATA"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setDeptDeleteState('idle'); setDeptConfirmPhrase(''); setDeptMessage(''); clearControls(); }}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-orange-50 hover:bg-white/20"
                >
                  Step Away
                </button>
                <button
                  type="button"
                  onClick={beginDeptCountdown}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
                >
                  Delete Department Now
                </button>
              </div>
            </div>
          )}

          {deptDeleteState === 'countdown' && (
            <div className="rounded-lg border border-orange-300/30 bg-black/40 p-8 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-orange-200">Deleting {selectedDept?.name} in</p>
              <div className="my-4 text-8xl font-black tabular-nums text-white drop-shadow-lg">{deptCountdown}</div>
              <p className="text-sm text-orange-100">Close or navigate away now if this is a mistake.</p>
            </div>
          )}

          {deptDeleteState === 'deleting' && (
            <div className="rounded-lg border border-orange-300/30 bg-black/40 p-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-orange-200 border-t-transparent animate-spin" />
              <p className="font-semibold text-white">Deleting {selectedDept?.name} data...</p>
              <p className="mt-1 text-sm text-orange-200">Other departments are not affected.</p>
            </div>
          )}

          {(deptDeleteState === 'done' || deptDeleteState === 'error') && (
            <div className={`rounded-lg border p-4 ${deptDeleteState === 'done' ? 'border-green-300/40 bg-green-500/10 text-green-100' : 'border-orange-300/40 bg-black/30 text-orange-100'}`}>
              <div className="flex items-center gap-2">
                {deptDeleteState === 'error' && <XCircle size={18} />}
                <p className="font-semibold">{deptMessage}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
