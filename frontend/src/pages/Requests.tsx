import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { importRequestsApi } from '@/services/api';

const STATUS_COLOR: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

const TYPE_LABEL: Record<string, string> = {
  csv_import:  'CSV Import',
  product_add: 'Manual Add',
};

export default function Requests() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isSuperadmin = user.role === 'superadmin';

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await importRequestsApi.getAll();
      setRequests(res.data);
    } catch {
      setError('Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    setError('');
    try {
      await importRequestsApi.approve(id);
      await fetchRequests();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setActionLoading(rejectId);
    setError('');
    try {
      await importRequestsApi.reject(rejectId, rejectReason || undefined);
      setRejectId(null);
      setRejectReason('');
      await fetchRequests();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject.');
    } finally {
      setActionLoading(null);
    }
  };

  const daysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const filtered = filterStatus ? requests.filter(r => r.status === filterStatus) : requests;
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (loading) return <div className="p-6 text-[var(--text-muted)]">Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Import Requests</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {pendingCount > 0
            ? `${pendingCount} pending request${pendingCount !== 1 ? 's' : ''} waiting for review`
            : 'All requests have been reviewed'}
          {' · '}Pending requests auto-approve after 30 days.
        </p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">{error}</div>}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} type="button"
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filterStatus === s ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">{pendingCount}</span>
            )}
          </button>
        ))}
        <button type="button" onClick={fetchRequests} className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
          <RefreshCw size={16} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
          <p className="text-[var(--text-muted)]">No requests found.</p>
        </div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-7 gap-3 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
            <div className="col-span-2">Label</div>
            <div>Type</div>
            <div>Department</div>
            <div>Submitted By</div>
            <div>Status / Expiry</div>
            {isSuperadmin && <div>Actions</div>}
          </div>

          {filtered.map(req => (
            <div key={req.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] items-center text-sm">
              <div className="md:col-span-2">
                <p className="font-medium text-[var(--text)] truncate">{req.label || '—'}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{req.requestNo || req.csvImportId || '—'}</p>
                <p className="text-xs text-[var(--text-muted)]">{req.productIds?.length ?? 0} product{req.productIds?.length !== 1 ? 's' : ''} · {new Date(req.createdAt).toLocaleDateString()}</p>
                {req.notes && req.status === 'rejected' && (
                  <p className="text-xs text-red-600 mt-0.5 italic">Reason: {req.notes}</p>
                )}
              </div>
              <div>
                <span className="px-2 py-0.5 bg-[var(--surface-2)] text-[var(--text-muted)] rounded text-xs font-medium">
                  {TYPE_LABEL[req.type] ?? req.type}
                </span>
              </div>
              <div className="text-[var(--text-muted)] truncate">{req.department?.name ?? '—'}</div>
              <div className="text-[var(--text-muted)] truncate">{req.submitter?.name ?? '—'}</div>
              <div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[req.status]}`}>
                  {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                </span>
                {req.status === 'pending' && (
                  <p className="text-xs mt-1 text-[var(--text-muted)]">
                    <Clock size={10} className="inline mr-0.5" />
                    {daysLeft(req.expiresAt) > 0
                      ? `Auto-approves in ${daysLeft(req.expiresAt)}d`
                      : 'Expiring soon'}
                  </p>
                )}
                {req.status !== 'pending' && req.reviewer && (
                  <p className="text-xs mt-1 text-[var(--text-muted)]">by {req.reviewer.name}</p>
                )}
              </div>
              {isSuperadmin && (
                <div className="flex gap-1.5">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={actionLoading === req.id}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 font-medium">
                        <CheckCircle size={12} />
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectId(req.id); setRejectReason(''); }}
                        disabled={actionLoading === req.id}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg disabled:opacity-50 font-medium">
                        <XCircle size={12} />
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">{new Date(req.reviewedAt).toLocaleDateString()}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Reject Request</h3>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              All products in this request will be permanently deleted. This cannot be undone.
            </p>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Reason (optional)</label>
            <input
              type="text"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Duplicate import, wrong data..."
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                Cancel
              </button>
              <button onClick={handleReject} disabled={!!actionLoading} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 font-medium">
                {actionLoading ? 'Deleting...' : 'Confirm Reject & Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
