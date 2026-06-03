import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { passwordRequestsApi } from '@/services/api';
import ConfirmDialog from '@/components/ConfirmDialog';

interface PasswordRequest {
  id: string;
  requestedBy: string;
  requester: { id: string; name: string; email: string; role: string };
  reason?: string;
  status: string;
  approvedBy?: string;
  approver?: { id: string; name: string; email: string };
  approvedAt?: string;
  createdAt: string;
}

export default function PasswordRequests() {
  const [requests, setRequests] = useState<PasswordRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const response = await passwordRequestsApi.getAll();
      setRequests(response.data);
    } catch (err) {
      setError('Failed to load password requests');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!tempPassword || tempPassword.length < 8) {
      alert('Temporary password must be at least 8 characters');
      return;
    }

    try {
      setApprovingId(id);
      const response = await passwordRequestsApi.approve(id, tempPassword);
      alert(`Password changed. Temporary password: ${response.data.temporaryPassword}\n\nShare this with the user.`);
      setTempPassword('');
      setShowPasswordForm(null);
      loadRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setApprovingId('');
    }
  };

  const handleReject = (id: string) => {
    setRejectConfirm(id);
  };

  const confirmReject = async () => {
    if (!rejectConfirm) return;

    try {
      await passwordRequestsApi.reject(rejectConfirm);
      loadRequests();
      setRejectConfirm(null);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject request');
      setRejectConfirm(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <>
      {rejectConfirm && (
        <ConfirmDialog
          title="Reject Password Request"
          message="Are you sure you want to reject this password change request?"
          confirmText="Reject"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmReject}
          onCancel={() => setRejectConfirm(null)}
        />
      )}
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Password Change Requests</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No password change requests
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">User</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Role</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Reason</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Requested</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-gray-900">{request.requester.name}</div>
                      <div className="text-gray-600">{request.requester.email}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        request.requester.role === 'staff' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {request.requester.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{request.reason || '-'}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        request.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : request.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      {request.status === 'pending' ? (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setShowPasswordForm(showPasswordForm === request.id ? null : request.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            <Check size={16} /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            <X size={16} /> Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-gray-500 text-xs">
                          {request.approver?.name || '-'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {showPasswordForm && (
              <div className="bg-blue-50 border-t p-6">
                <div className="max-w-md">
                  <label htmlFor="temp-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Temporary Password (min 8 characters)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="temp-password"
                      name="tempPassword"
                      type="text"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="e.g., Temp@123456"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleApprove(showPasswordForm)}
                      disabled={approvingId === showPasswordForm}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium"
                    >
                      {approvingId === showPasswordForm ? 'Setting...' : 'Set'}
                    </button>
                    <button
                      onClick={() => setShowPasswordForm(null)}
                      className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-900 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
