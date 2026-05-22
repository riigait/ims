import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Trash2, Shield, Users, CheckCircle, Mail, ArrowLeft } from 'lucide-react';
import { authApi, departmentsApi } from '@/services/api';

interface Department {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'staff';
  departmentId?: string;
  adminDepartments?: Array<{ departmentId: string; department: { id: string; name: string; description?: string } }>;
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generateRole, setGenerateRole] = useState<'superadmin' | 'admin' | 'staff'>('staff');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invites' | 'users'>('invites');

  useEffect(() => {
    loadData();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    try {
      const response = await authApi.getCurrentUser();
      setCurrentUser(response.data);
      if (!['admin', 'superadmin'].includes(response.data.role)) {
        navigate('/dashboard');
      }
    } catch {
      navigate('/login');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, invitesRes, deptsRes] = await Promise.all([
        fetch('/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
        fetch('/api/invites', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
        departmentsApi.getAll(),
      ]);
      setUsers(usersRes);
      setInvites(invitesRes);
      setDepartments(deptsRes.data);
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
      setError('');
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

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">Loading...</div></div>;
  if (!currentUser) return null;

  const pendingInvites = invites.filter(i => !i.usedAt);
  const usedInvites = invites.filter(i => i.usedAt);

  return (
    <div className="min-h-screen bg-gray-50">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/scanner')}
            className="p-2 hover:bg-gray-200 rounded-lg transition"
            title="Back to Scanner"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-2">Manage users and generate invite codes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('invites')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === 'invites'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="inline mr-2" size={18} />
            Invite Codes ({pendingInvites.length} pending)
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="inline mr-2" size={18} />
            Users ({users.length})
          </button>
        </div>

        {/* Generate Invite Section */}
        {activeTab === 'invites' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Generate New Invite Code</h2>
            <div className="flex gap-3">
              <select
                value={generateRole}
                onChange={(e) => setGenerateRole(e.target.value as 'superadmin' | 'admin' | 'staff')}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-sm"
              >
                <option value="staff">Staff User</option>
                <option value="admin">Admin User</option>
                {currentUser?.role === 'superadmin' && (
                  <option value="superadmin">Super Admin User</option>
                )}
              </select>
              <button
                onClick={generateInvite}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                Generate Code
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3">Invite codes expire in 7 days</p>
          </div>
        )}

        {/* Pending Invites */}
        {activeTab === 'invites' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Pending Invites</h3>
            {pendingInvites.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">No pending invites</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Code</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Role</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Created By</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Expires</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pendingInvites.map(invite => (
                      <tr key={invite.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <code className="bg-gray-100 px-3 py-1 rounded font-mono text-xs">{invite.code}</code>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            invite.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {invite.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{invite.creator?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-gray-600">{new Date(invite.expiresAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => copyToClipboard(invite.code)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                              title="Copy code"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              onClick={() => revokeInvite(invite.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                              title="Revoke"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {copied === invite.code && <span className="text-xs text-green-600">✓ Copied</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Used Invites */}
        {activeTab === 'invites' && usedInvites.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              Used Invites ({usedInvites.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Used By</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usedInvites.map(invite => (
                    <tr key={invite.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 px-3 py-1 rounded font-mono text-xs">{invite.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          invite.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {invite.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{invite.usedBy || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{new Date(invite.usedAt!).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users List */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">All Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Department</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Created</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium flex w-fit gap-1 ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role === 'admin' && <Shield size={12} />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.role === 'admin' ? (
                          // Admin: show assigned departments from adminDepartments
                          user.adminDepartments && user.adminDepartments.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.adminDepartments.map(ad => (
                                <span key={ad.departmentId} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                                  {ad.department.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">Unassigned</span>
                          )
                        ) : (
                          // Staff: show single department
                          user.departmentId ? (
                            <span className="text-gray-700 text-xs">{departments.find(d => d.id === user.departmentId)?.name || '-'}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">Unassigned</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        {user.id !== currentUser.id && (
                          <button
                            onClick={() => deleteUser(user.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition"
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
        )}
      </div>
    </div>
  );
}
