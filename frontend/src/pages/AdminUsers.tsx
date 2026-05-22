import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Trash2, Shield, Users, Plus, Calendar, CheckCircle } from 'lucide-react';
import { authApi } from '@/services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  createdAt: string;
}

interface InviteCode {
  id: string;
  code: string;
  role: string;
  creator: { name: string; email: string };
  usedBy?: string;
  usedAt?: string;
  expiresAt: string;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generateRole, setGenerateRole] = useState<'admin' | 'staff'>('staff');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    try {
      const response = await authApi.getCurrentUser();
      setCurrentUser(response.data);
      if (response.data.role !== 'admin') {
        navigate('/dashboard');
      }
    } catch {
      navigate('/login');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, invitesRes] = await Promise.all([
        fetch('/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
        fetch('/api/invites', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
      ]);
      setUsers(usersRes);
      setInvites(invitesRes);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const generateInvite = async () => {
    try {
      const response = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ role: generateRole }),
      });
      if (!response.ok) throw new Error('Failed to generate invite');
      const newInvite = await response.json();
      setInvites([newInvite, ...invites]);
    } catch (err) {
      setError('Failed to generate invite');
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      await fetch(`/api/invites/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setInvites(invites.filter(i => i.id !== id));
    } catch (err) {
      setError('Failed to revoke invite');
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    try {
      await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(users.filter(u => u.id !== id));
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={32} /> User Management
          </h1>
          <p className="text-gray-600 mt-2">Manage users and generate invite codes</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Generate Invite Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Plus size={20} /> Generate Invite Code
          </h2>
          <div className="flex gap-4">
            <select
              value={generateRole}
              onChange={(e) => setGenerateRole(e.target.value as 'admin' | 'staff')}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={generateInvite}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Generate
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">Invites expire in 7 days</p>
        </div>

        {/* Pending Invites */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Pending Invites ({invites.filter(i => !i.usedAt).length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Invite Code</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Created By</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {invites.filter(i => !i.usedAt).map(invite => (
                  <tr key={invite.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs">{invite.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        invite.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{invite.creator.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-green-600">Unused</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(invite.code)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Copy code"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={() => revokeInvite(invite.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Revoke"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {copied === invite.code && <span className="text-xs text-green-600">Copied!</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invites.filter(i => !i.usedAt).length === 0 && (
              <div className="text-center py-8 text-gray-500">No pending invites</div>
            )}
          </div>
        </div>

        {/* Used Invites */}
        {invites.filter(i => i.usedAt).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" /> Used Invites
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Invite Code</th>
                    <th className="px-4 py-2 text-left">Role</th>
                    <th className="px-4 py-2 text-left">Created By</th>
                    <th className="px-4 py-2 text-left">Used By</th>
                    <th className="px-4 py-2 text-left">Used Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.filter(i => i.usedAt).map(invite => (
                    <tr key={invite.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{invite.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          invite.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {invite.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{invite.creator.name}</td>
                      <td className="px-4 py-3 text-gray-600">{invite.usedBy || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(invite.usedAt!).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">All Users ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium flex w-fit gap-1 ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role === 'admin' && <Shield size={12} />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
