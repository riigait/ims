import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, RefreshCw, Check, X } from 'lucide-react';
import { importRequestsApi, deleteRequestsApi, passwordRequestsApi, editRequestsApi, exportRequestsApi } from '@/services/api';
import ConfirmDialog from '@/components/ConfirmDialog';

type RequestTab = 'import' | 'delete' | 'password' | 'edit' | 'export';

interface DeleteRequest {
  id: string;
  requestedBy: string;
  requester: { id: string; name: string; email: string };
  entityType: string;
  entityName: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: { id: string; name: string; email: string };
  reviewedAt?: string;
  createdAt: string;
}

interface PasswordRequest {
  id: string;
  requestedBy: string;
  requester: { id: string; name: string; email: string; role: string };
  reason?: string;
  status: string;
  approver?: { id: string; name: string; email: string };
  approvedAt?: string;
  createdAt: string;
}

interface EditRequest {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string };
  requester: { id: string; name: string; email: string };
  proposedChanges: Record<string, any>;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewer?: { id: string; name: string; email: string };
  reviewedAt?: string;
  createdAt: string;
}

interface ExportRequest {
  id: string;
  type: string;
  label: string;
  requester: { id: string; name: string; email: string };
  department?: { id: string; name: string };
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewer?: { id: string; name: string; email: string };
  reviewedAt?: string;
  createdAt: string;
}

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
  const isStaff = user.role === 'staff';
  const routeState = (useLocation().state as any) || {};

  const defaultTab: RequestTab = (routeState.tab as RequestTab) || (isStaff ? 'delete' : 'import');
  const [activeTab, setActiveTab] = useState<RequestTab>(defaultTab);

  // Import state
  const [importRequests, setImportRequests] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(true);
  const [importActionLoading, setImportActionLoading] = useState<string | null>(null);
  const [importRejectId, setImportRejectId] = useState<string | null>(null);
  const [importRejectReason, setImportRejectReason] = useState('');
  const [importFilterStatus, setImportFilterStatus] = useState('');

  // Delete state
  const [deleteRequests, setDeleteRequests] = useState<DeleteRequest[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteFilter, setDeleteFilter] = useState<'pending' | 'all'>('pending');
  const [deleteApproveConfirm, setDeleteApproveConfirm] = useState<string | null>(null);
  const [deleteRejectId, setDeleteRejectId] = useState<string | null>(null);
  const [deleteRejectReason, setDeleteRejectReason] = useState('');

  // Password state
  const [passwordRequests, setPasswordRequests] = useState<PasswordRequest[]>([]);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [approvingPasswordId, setApprovingPasswordId] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState<string | null>(null);
  const [rejectPasswordConfirm, setRejectPasswordConfirm] = useState<string | null>(null);

  // Edit state
  const [editRequests, setEditRequests] = useState<EditRequest[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editFilter, setEditFilter] = useState<'pending' | 'all'>('pending');
  const [editApproveConfirm, setEditApproveConfirm] = useState<string | null>(null);
  const [editRejectId, setEditRejectId] = useState<string | null>(null);
  const [editRejectReason, setEditRejectReason] = useState('');

  // Export state
  const [exportRequests, setExportRequests] = useState<ExportRequest[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportApproveConfirm, setExportApproveConfirm] = useState<string | null>(null);
  const [exportRejectId, setExportRejectId] = useState<string | null>(null);
  const [exportRejectReason, setExportRejectReason] = useState('');

  const [error, setError] = useState('');

  // Fetch functions
  const fetchImportRequests = async () => {
    try {
      setImportLoading(true);
      const res = await importRequestsApi.getAll();
      setImportRequests(res.data.data ?? res.data);
    } catch {
      setError('Failed to load import requests.');
    } finally {
      setImportLoading(false);
    }
  };

  const fetchDeleteRequests = async () => {
    try {
      setDeleteLoading(true);
      const res = await deleteRequestsApi.getAll(deleteFilter === 'pending' ? 'pending' : undefined);
      setDeleteRequests(res.data.data ?? res.data);
    } catch {
      setError('Failed to load delete requests.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchPasswordRequests = async () => {
    try {
      setPasswordLoading(true);
      const res = await passwordRequestsApi.getAll();
      setPasswordRequests(res.data.data ?? res.data);
    } catch {
      setError('Failed to load password requests.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const fetchEditRequests = async () => {
    try {
      setEditLoading(true);
      const res = await editRequestsApi.getAll(editFilter === 'pending' ? 'pending' : undefined);
      setEditRequests(res.data.data ?? res.data);
    } catch {
      setError('Failed to load edit requests.');
    } finally {
      setEditLoading(false);
    }
  };

  const fetchExportRequests = async () => {
    try {
      setExportLoading(true);
      const res = await exportRequestsApi.getAll();
      setExportRequests(res.data.data ?? res.data);
    } catch {
      setError('Failed to load export requests.');
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    setError('');
    if (activeTab === 'import') fetchImportRequests();
    else if (activeTab === 'delete') fetchDeleteRequests();
    else if (activeTab === 'password') fetchPasswordRequests();
    else if (activeTab === 'edit') fetchEditRequests();
    else if (activeTab === 'export') fetchExportRequests();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'delete') fetchDeleteRequests();
  }, [deleteFilter]);

  useEffect(() => {
    if (activeTab === 'edit') fetchEditRequests();
  }, [editFilter]);

  // Import handlers
  const handleImportApprove = async (id: string) => {
    setImportActionLoading(id);
    setError('');
    try {
      await importRequestsApi.approve(id);
      await fetchImportRequests();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve.');
    } finally {
      setImportActionLoading(null);
    }
  };

  const handleImportReject = async () => {
    if (!importRejectId) return;
    setImportActionLoading(importRejectId);
    setError('');
    try {
      await importRequestsApi.reject(importRejectId, importRejectReason || undefined);
      setImportRejectId(null);
      setImportRejectReason('');
      await fetchImportRequests();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject.');
    } finally {
      setImportActionLoading(null);
    }
  };

  // Delete handlers
  const confirmDeleteApprove = async () => {
    if (!deleteApproveConfirm) return;
    try {
      await deleteRequestsApi.approve(deleteApproveConfirm);
      await fetchDeleteRequests();
      setDeleteApproveConfirm(null);
    } catch {
      setError('Failed to approve delete request.');
      setDeleteApproveConfirm(null);
    }
  };

  const handleDeleteReject = async () => {
    if (!deleteRejectId) return;
    try {
      await deleteRequestsApi.reject(deleteRejectId, deleteRejectReason || '');
      setDeleteRejectId(null);
      setDeleteRejectReason('');
      await fetchDeleteRequests();
    } catch {
      setError('Failed to reject delete request.');
    }
  };

  // Password handlers
  const handlePasswordApprove = async (id: string) => {
    if (!tempPassword || tempPassword.length < 8) {
      alert('Temporary password must be at least 8 characters');
      return;
    }
    try {
      setApprovingPasswordId(id);
      const response = await passwordRequestsApi.approve(id, tempPassword);
      alert(`Password changed. Temporary password: ${response.data.temporaryPassword}\n\nShare this with the user.`);
      setTempPassword('');
      setShowPasswordForm(null);
      fetchPasswordRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setApprovingPasswordId('');
    }
  };

  const confirmPasswordReject = async () => {
    if (!rejectPasswordConfirm) return;
    try {
      await passwordRequestsApi.reject(rejectPasswordConfirm);
      setRejectPasswordConfirm(null);
      fetchPasswordRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject request');
      setRejectPasswordConfirm(null);
    }
  };

  // Export handlers
  const confirmExportApprove = async () => {
    if (!exportApproveConfirm) return;
    try {
      await exportRequestsApi.approve(exportApproveConfirm);
      await fetchExportRequests();
      setExportApproveConfirm(null);
    } catch {
      setError('Failed to approve export request.');
      setExportApproveConfirm(null);
    }
  };

  const handleExportReject = async () => {
    if (!exportRejectId) return;
    try {
      await exportRequestsApi.reject(exportRejectId, exportRejectReason || undefined);
      setExportRejectId(null);
      setExportRejectReason('');
      await fetchExportRequests();
    } catch {
      setError('Failed to reject export request.');
    }
  };

  const handleExportDownload = (id: string) => {
    const token = localStorage.getItem('token');
    const url = exportRequestsApi.downloadUrl(id);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('data-token', token || '');
    // Use fetch for authenticated download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        link.href = blobUrl;
        link.download = `export-${id.slice(0, 8)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(() => setError('Failed to download export.'));
  };

  // Edit handlers
  const confirmEditApprove = async () => {
    if (!editApproveConfirm) return;
    try {
      await editRequestsApi.approve(editApproveConfirm);
      await fetchEditRequests();
      setEditApproveConfirm(null);
    } catch {
      setError('Failed to approve edit request.');
      setEditApproveConfirm(null);
    }
  };

  const handleEditReject = async () => {
    if (!editRejectId) return;
    try {
      await editRequestsApi.reject(editRejectId, editRejectReason || undefined);
      setEditRejectId(null);
      setEditRejectReason('');
      await fetchEditRequests();
    } catch {
      setError('Failed to reject edit request.');
    }
  };

  const daysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const importFiltered = importFilterStatus
    ? importRequests.filter(r => r.status === importFilterStatus)
    : importRequests;
  const importPendingCount = importRequests.filter(r => r.status === 'pending').length;
  const deletePendingCount = deleteRequests.filter(r => r.status === 'pending').length;
  const passwordPendingCount = passwordRequests.filter(r => r.status === 'pending').length;
  const editPendingCount = editRequests.filter(r => r.status === 'pending').length;
  const exportPendingCount = exportRequests.filter(r => r.status === 'pending').length;

  const ALL_TABS: { key: RequestTab; label: string; pending: number; roles: string[] }[] = [
    { key: 'import',   label: 'Import Requests',   pending: importPendingCount,   roles: ['admin', 'superadmin'] },
    { key: 'export',   label: 'Export Requests',   pending: exportPendingCount,   roles: ['admin', 'superadmin'] },
    { key: 'delete',   label: 'Delete Requests',   pending: deletePendingCount,   roles: ['admin', 'superadmin', 'staff'] },
    { key: 'edit',     label: 'Edit Requests',     pending: editPendingCount,     roles: ['admin', 'superadmin', 'staff'] },
    { key: 'password', label: 'Password Requests', pending: passwordPendingCount, roles: ['admin', 'superadmin', 'staff'] },
  ];
  const TABS = ALL_TABS.filter(t => t.roles.includes(user.role));

  return (
    <div className="p-6">
      {/* Confirm dialogs */}
      {deleteApproveConfirm && (
        <ConfirmDialog
          title="Approve Delete Request"
          message="Are you sure you want to approve this deletion? This cannot be undone."
          confirmText="Approve"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDeleteApprove}
          onCancel={() => setDeleteApproveConfirm(null)}
        />
      )}
      {rejectPasswordConfirm && (
        <ConfirmDialog
          title="Reject Password Request"
          message="Are you sure you want to reject this password change request?"
          confirmText="Reject"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmPasswordReject}
          onCancel={() => setRejectPasswordConfirm(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Requests</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
            {tab.pending > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {tab.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">{error}</div>}

      {/* IMPORT REQUESTS */}
      {activeTab === 'import' && (
        <>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            {importPendingCount > 0
              ? `${importPendingCount} pending request${importPendingCount !== 1 ? 's' : ''} waiting for review`
              : 'All requests have been reviewed'}
            {' · '}Pending requests auto-approve after 30 days.
          </p>

          <div className="flex gap-2 mb-4">
            {['', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} type="button"
                onClick={() => setImportFilterStatus(s)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  importFilterStatus === s
                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                    : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'
                }`}>
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                {s === 'pending' && importPendingCount > 0 && (
                  <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
                    {importPendingCount}
                  </span>
                )}
              </button>
            ))}
            <button type="button" onClick={fetchImportRequests}
              className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
              <RefreshCw size={16} />
            </button>
          </div>

          {importLoading ? (
            <div className="p-6 text-[var(--text-muted)]">Loading...</div>
          ) : importFiltered.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <p className="text-[var(--text-muted)]">No requests found.</p>
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <div className="hidden md:grid grid-cols-7 gap-3 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
                <div className="col-span-2">Label</div>
                <div className="text-center">Type</div>
                <div>Department</div>
                <div>Submitted By</div>
                <div className="text-center">Status / Expiry</div>
                {isSuperadmin && <div className="text-center">Actions</div>}
              </div>
              {importFiltered.map(req => (
                <div key={req.id} className="grid grid-cols-1 md:grid-cols-7 gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] items-center text-sm">
                  <div className="md:col-span-2">
                    <p className="font-medium text-[var(--text)] truncate">{req.label || '—'}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{req.requestNo || req.csvImportId || '—'}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {req.productIds?.length ?? 0} product{req.productIds?.length !== 1 ? 's' : ''} · {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                    {req.notes && req.status === 'rejected' && (
                      <p className="text-xs text-red-600 mt-0.5 italic">Reason: {req.notes}</p>
                    )}
                  </div>
                  <div className="flex justify-center">
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
                    <div className="flex gap-1.5 justify-center">
                      {req.status === 'pending' ? (
                        <>
                          <button onClick={() => handleImportApprove(req.id)}
                            disabled={importActionLoading === req.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 font-medium">
                            <CheckCircle size={12} /> Approve
                          </button>
                          <button onClick={() => { setImportRejectId(req.id); setImportRejectReason(''); }}
                            disabled={importActionLoading === req.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg disabled:opacity-50 font-medium">
                            <XCircle size={12} /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Import reject modal */}
          {importRejectId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Reject Request</h3>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  All products in this request will be permanently deleted. This cannot be undone.
                </p>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Reason (optional)</label>
                <input type="text" value={importRejectReason}
                  onChange={e => setImportRejectReason(e.target.value)}
                  placeholder="e.g. Duplicate import, wrong data..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-4"
                  autoFocus />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setImportRejectId(null)}
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                  <button onClick={handleImportReject} disabled={!!importActionLoading}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 font-medium">
                    {importActionLoading ? 'Deleting...' : 'Confirm Reject & Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* DELETE REQUESTS */}
      {activeTab === 'delete' && (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setDeleteFilter('pending')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                deleteFilter === 'pending'
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}>
              Pending
              {deletePendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {deletePendingCount}
                </span>
              )}
            </button>
            <button onClick={() => setDeleteFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                deleteFilter === 'all'
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}>
              All Requests
            </button>
            <button type="button" onClick={fetchDeleteRequests}
              className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
              <RefreshCw size={16} />
            </button>
          </div>

          {deleteLoading ? (
            <div className="p-6 text-[var(--text-muted)]">Loading...</div>
          ) : deleteRequests.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <p className="text-[var(--text-muted)]">No delete requests found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deleteRequests.map(req => (
                <div key={req.id} className={`bg-[var(--surface)] rounded-lg border border-[var(--border)] border-l-4 p-4 ${
                  req.status === 'pending' ? 'border-l-yellow-500' : req.status === 'approved' ? 'border-l-green-500' : 'border-l-red-500'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-[var(--text)]">{req.entityName}</span>
                        <span className="text-xs bg-[var(--surface-2)] text-[var(--text-muted)] px-2 py-0.5 rounded capitalize">
                          {req.entityType}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[req.status]}`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">
                        Requested by: {req.requester.name} ({req.requester.email})
                      </p>
                      {req.reason && (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">Reason: {req.reason}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {new Date(req.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => setDeleteApproveConfirm(req.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium">
                          <Check size={12} /> Approve
                        </button>
                        <button onClick={() => { setDeleteRejectId(req.id); setDeleteRejectReason(''); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium">
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Delete reject modal */}
          {deleteRejectId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Reject Delete Request</h3>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Reason (optional)</label>
                <input type="text" value={deleteRejectReason}
                  onChange={e => setDeleteRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-4"
                  autoFocus />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDeleteRejectId(null)}
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                  <button onClick={handleDeleteReject}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                    Confirm Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* PASSWORD REQUESTS */}
      {activeTab === 'password' && (
        <>
          <div className="flex justify-end mb-4">
            <button type="button" onClick={fetchPasswordRequests}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
              <RefreshCw size={16} />
            </button>
          </div>

          {passwordLoading ? (
            <div className="p-6 text-[var(--text-muted)]">Loading...</div>
          ) : passwordRequests.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <p className="text-[var(--text-muted)]">No password change requests.</p>
            </div>
          ) : (
            <>
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="hidden md:grid grid-cols-6 gap-3 px-4 py-2 bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide border-b border-[var(--border)]">
                  <div className="col-span-2">User</div>
                  <div className="text-center">Role</div>
                  <div>Reason</div>
                  <div className="text-center">Status</div>
                  <div className="text-center">Actions</div>
                </div>
                {passwordRequests.map(req => (
                  <div key={req.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] items-center text-sm">
                    <div className="md:col-span-2">
                      <p className="font-medium text-[var(--text)]">{req.requester.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{req.requester.email}</p>
                    </div>
                    <div className="flex justify-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        req.requester.role === 'staff'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {req.requester.role}
                      </span>
                    </div>
                    <div className="text-[var(--text-muted)]">{req.reason || '—'}</div>
                    <div className="flex justify-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[req.status]}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex justify-center">
                      {req.status === 'pending' ? (
                        <div className="flex gap-2 flex-wrap justify-center">
                          <button
                            onClick={() => setShowPasswordForm(showPasswordForm === req.id ? null : req.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium">
                            <Check size={12} /> Approve
                          </button>
                          <button onClick={() => setRejectPasswordConfirm(req.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium">
                            <X size={12} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">{req.approver?.name || '—'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {showPasswordForm && (
                <div className="mt-4 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4">
                  <label className="block text-sm font-medium text-[var(--text)] mb-2">
                    Set Temporary Password (min 8 characters)
                  </label>
                  <div className="flex gap-2">
                    <input id="temp-password" type="text" value={tempPassword}
                      onChange={e => setTempPassword(e.target.value)}
                      placeholder="e.g. Temp@123456"
                      className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
                    <button onClick={() => handlePasswordApprove(showPasswordForm)}
                      disabled={approvingPasswordId === showPasswordForm}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
                      {approvingPasswordId === showPasswordForm ? 'Setting...' : 'Set Password'}
                    </button>
                    <button onClick={() => setShowPasswordForm(null)}
                      className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* EDIT REQUESTS */}
      {activeTab === 'edit' && (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setEditFilter('pending')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                editFilter === 'pending'
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}>
              Pending
              {editPendingCount > 0 && (
                <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {editPendingCount}
                </span>
              )}
            </button>
            <button onClick={() => setEditFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                editFilter === 'all'
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}>
              All Requests
            </button>
            <button type="button" onClick={fetchEditRequests}
              className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
              <RefreshCw size={16} />
            </button>
          </div>

          {editLoading ? (
            <div className="p-6 text-[var(--text-muted)]">Loading...</div>
          ) : editRequests.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <p className="text-[var(--text-muted)]">No edit requests found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {editRequests.map(req => (
                <div key={req.id} className={`bg-[var(--surface)] rounded-lg border border-[var(--border)] border-l-4 p-4 ${
                  req.status === 'pending' ? 'border-l-yellow-500' : req.status === 'approved' ? 'border-l-green-500' : 'border-l-red-500'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-[var(--text)]">{req.product.name}</span>
                        <span className="font-mono text-xs text-[var(--primary)]">{req.product.sku}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[req.status]}`}>
                          {req.status}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">
                        Requested by: {req.requester.name} ({req.requester.email})
                      </p>
                      {req.reason && (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">Reason: {req.reason}</p>
                      )}
                      <div className="mt-2 bg-[var(--surface-2)] rounded-lg p-3 text-xs">
                        <p className="font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">Proposed Changes</p>
                        <div className="space-y-1">
                          {Object.entries(req.proposedChanges).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-[var(--text-muted)] min-w-[110px] capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                              <span className="text-[var(--text)] font-medium break-all">{val === null || val === '' ? '—' : String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {req.rejectionReason && (
                        <p className="text-sm text-red-500 mt-1">Rejection reason: {req.rejectionReason}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {new Date(req.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => setEditApproveConfirm(req.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium">
                          <Check size={12} /> Approve
                        </button>
                        <button onClick={() => { setEditRejectId(req.id); setEditRejectReason(''); }}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium">
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Edit reject modal */}
          {editRejectId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Reject Edit Request</h3>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Reason (optional)</label>
                <input type="text" value={editRejectReason}
                  onChange={e => setEditRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-4"
                  autoFocus />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditRejectId(null)}
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                  <button onClick={handleEditReject}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                    Confirm Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {editApproveConfirm && (
            <ConfirmDialog
              title="Approve Edit Request?"
              message="This will apply the proposed changes to the product immediately."
              confirmText="Approve & Apply"
              onConfirm={confirmEditApprove}
              onCancel={() => setEditApproveConfirm(null)}
            />
          )}
        </>
      )}

      {/* EXPORT REQUESTS */}
      {activeTab === 'export' && (
        <>
          <div className="flex justify-end mb-4">
            <button type="button" onClick={fetchExportRequests}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
              <RefreshCw size={16} />
            </button>
          </div>

          {exportLoading ? (
            <div className="p-6 text-[var(--text-muted)]">Loading...</div>
          ) : exportRequests.length === 0 ? (
            <div className="text-center py-12 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <p className="text-[var(--text-muted)]">No export requests found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exportRequests.map(req => (
                <div key={req.id} className={`bg-[var(--surface)] rounded-lg border border-[var(--border)] border-l-4 p-4 ${
                  req.status === 'pending' ? 'border-l-yellow-500' : req.status === 'approved' ? 'border-l-green-500' : 'border-l-red-500'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-[var(--text)]">{req.label}</span>
                        <span className="text-xs bg-[var(--surface-2)] text-[var(--text-muted)] px-2 py-0.5 rounded capitalize">{req.type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLOR[req.status]}`}>{req.status}</span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">
                        Requested by: {req.requester.name} ({req.requester.email})
                        {req.department && ` — ${req.department.name}`}
                      </p>
                      {req.rejectionReason && (
                        <p className="text-sm text-red-500 mt-0.5">Rejection reason: {req.rejectionReason}</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] mt-1">{new Date(req.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-col items-end">
                      {req.status === 'approved' && (
                        <button onClick={() => handleExportDownload(req.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs rounded-lg font-medium">
                          <CheckCircle size={12} /> Download CSV
                        </button>
                      )}
                      {req.status === 'pending' && isSuperadmin && (
                        <div className="flex gap-2">
                          <button onClick={() => setExportApproveConfirm(req.id)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium">
                            <Check size={12} /> Approve
                          </button>
                          <button onClick={() => { setExportRejectId(req.id); setExportRejectReason(''); }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium">
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {req.status === 'pending' && !isSuperadmin && (
                        <span className="flex items-center gap-1 text-xs text-yellow-600">
                          <Clock size={12} /> Awaiting approval
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {exportRejectId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-[var(--text)] mb-1">Reject Export Request</h3>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Reason (optional)</label>
                <input type="text" value={exportRejectReason}
                  onChange={e => setExportRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-4"
                  autoFocus />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setExportRejectId(null)}
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                  <button onClick={handleExportReject}
                    className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                    Confirm Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {exportApproveConfirm && (
            <ConfirmDialog
              title="Approve Export Request?"
              message="The Admin will be able to download this CSV export."
              confirmText="Approve"
              onConfirm={confirmExportApprove}
              onCancel={() => setExportApproveConfirm(null)}
            />
          )}
        </>
      )}

      {deleteApproveConfirm && (
        <ConfirmDialog
          title="Approve Delete Request?"
          message="This will permanently delete the record. This action cannot be undone."
          confirmText="Yes, Delete"
          isDangerous
          onConfirm={confirmDeleteApprove}
          onCancel={() => setDeleteApproveConfirm(null)}
        />
      )}
      {rejectPasswordConfirm && (
        <ConfirmDialog
          title="Reject Password Request?"
          message="The staff member's password will not be changed."
          confirmText="Reject"
          isDangerous
          onConfirm={confirmPasswordReject}
          onCancel={() => setRejectPasswordConfirm(null)}
        />
      )}
    </div>
  );
}
