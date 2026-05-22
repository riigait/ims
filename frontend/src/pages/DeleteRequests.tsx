import { useState, useEffect } from 'react';
import { Check, X, Clock, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { deleteRequestsApi } from '@/services/api';

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

export default function DeleteRequests() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await deleteRequestsApi.getAll(filter === 'pending' ? 'pending' : undefined);
      setRequests(res.data);
    } catch (err) {
      setError('Failed to load delete requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Approve this deletion?')) return;
    try {
      await deleteRequestsApi.approve(id);
      await loadRequests();
    } catch (err) {
      setError('Failed to approve request');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return;
    try {
      await deleteRequestsApi.reject(id, reason || '');
      await loadRequests();
    } catch (err) {
      setError('Failed to reject request');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">Loading...</div></div>;

  const displayRequests = user.role === 'admin'
    ? requests
    : requests.filter(r => r.requestedBy === user.id);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
            <Trash2 size={36} className="text-orange-600" />
            Delete Requests
          </h1>
          <p className="text-gray-600 mt-2">
            {user.role === 'admin'
              ? 'Review and approve deletion requests from staff'
              : 'Your deletion requests and status'}
          </p>
        </div>

        {/* Stats Cards */}
        {user.role === 'admin' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-3xl font-bold text-gray-900">{pendingCount}</p>
                </div>
                <Clock size={32} className="text-yellow-500 opacity-20" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Approved</p>
                  <p className="text-3xl font-bold text-gray-900">{approvedCount}</p>
                </div>
                <CheckCircle size={32} className="text-green-500 opacity-20" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Rejected</p>
                  <p className="text-3xl font-bold text-gray-900">{rejectedCount}</p>
                </div>
                <AlertCircle size={32} className="text-red-500 opacity-20" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Filter Tabs */}
        {user.role === 'admin' && (
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('pending')}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                filter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Requests
            </button>
          </div>
        )}

        {/* Requests List */}
        {displayRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Trash2 size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">
              {user.role === 'admin'
                ? 'No delete requests'
                : 'You have not submitted any delete requests'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRequests.map(req => (
              <div
                key={req.id}
                className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                  req.status === 'pending'
                    ? 'border-yellow-500'
                    : req.status === 'approved'
                    ? 'border-green-500'
                    : 'border-red-500'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{req.entityName}</h3>
                      <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full capitalize">
                        {req.entityType}
                      </span>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        req.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : req.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {req.status}
                      </span>
                    </div>

                    {user.role === 'admin' && (
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-medium">Requested by:</span> {req.requester.name} ({req.requester.email})
                      </p>
                    )}

                    {req.reason && (
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-medium">Reason:</span> {req.reason}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Requested: {new Date(req.createdAt).toLocaleString()}</span>
                      {req.reviewedAt && (
                        <span>
                          Reviewed by {req.reviewer?.name} on {new Date(req.reviewedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {user.role === 'admin' && req.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req.id)}
                        className="p-3 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition"
                        title="Approve deletion"
                      >
                        <Check size={20} />
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
                        title="Reject deletion"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
