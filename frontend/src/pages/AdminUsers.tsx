import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Trash2, Shield, Users, CheckCircle, Mail, ArrowLeft, Edit } from 'lucide-react';
import { authApi, departmentsApi } from '@/services/api';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';

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
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });
  const [editError, setEditError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  const startEditUser = (user: User) => {
    setEditingUser(user);
    setEditFormData({ name: user.name, email: user.email });
    setEditError('');
  };

  const saveUserEdit = async () => {
    if (!editingUser) return;
    if (!editFormData.name.trim()) {
      setEditError('Name is required');
      return;
    }
    if (!editFormData.email.trim()) {
      setEditError('Email is required');
      return;
    }

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: editFormData.name, email: editFormData.email }),
      });
      if (!response.ok) throw new Error('Failed to update user');

      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...editFormData } : u));
      setEditingUser(null);
      setError('');
    } catch (err) {
      setEditError('Failed to update user');
    }
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setEditError('');
  };

  const deleteUser = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirm) return;
    try {
      await fetch(`/api/users/${deleteConfirm}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(users.filter(u => u.id !== deleteConfirm));
      setDeleteConfirm(null);
    } catch (err) {
      setError('Failed to delete user');
      setDeleteConfirm(null);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const canDeleteUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    // Can't delete yourself
    if (targetUser.id === currentUser.id) return false;
    // Superadmin can delete anyone
    if (currentUser.role === 'superadmin') return true;
    // Admin can delete admin and staff, but not superadmin
    if (currentUser.role === 'admin') return targetUser.role !== 'superadmin';
    // Staff has no delete access
    return false;
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-[var(--text-muted)]">Loading...</div></div>;
  if (!currentUser) return null;

  const getFilteredPendingInvites = () => {
    const allPending = invites.filter(i => !i.usedAt);
    if (currentUser?.role === 'superadmin') return allPending;
    if (currentUser?.role === 'admin') return allPending.filter(i => ['admin', 'staff'].includes(i.role));
    return [];
  };
  const pendingInvites = getFilteredPendingInvites();
  const paginatedPendingInvites = pendingInvites.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getFilteredUsedInvites = () => {
    const allUsed = invites.filter(i => i.usedAt);
    if (currentUser?.role === 'superadmin') return allUsed;
    if (currentUser?.role === 'admin') return allUsed.filter(i => ['admin', 'staff'].includes(i.role));
    return [];
  };
  const usedInvites = getFilteredUsedInvites();
  const paginatedUsedInvites = usedInvites.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete User"
          message="Are you sure? This cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <div className="min-h-screen bg-[var(--bg)]">
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/scanner')}
            className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition"
            title="Back to Scanner"
          >
            <ArrowLeft size={24} className="text-[var(--text)]" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-[var(--text)]">User Management</h1>
            <p className="text-[var(--text-muted)] mt-2">Manage users and generate invite codes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)]">
          <button
            onClick={() => { setActiveTab('invites'); setCurrentPage(1); }}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === 'invites'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Mail className="inline mr-2" size={18} />
            Invite Codes ({pendingInvites.length} pending)
          </button>
          <button
            onClick={() => { setActiveTab('users'); setCurrentPage(1); }}
            className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
              activeTab === 'users'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Users className="inline mr-2" size={18} />
            Users ({users.length})
          </button>
        </div>

        {/* Generate Invite Section */}
        {activeTab === 'invites' && ['admin', 'superadmin'].includes(currentUser?.role || '') && (
          <div className="bg-[var(--surface)] rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-[var(--text)]">Generate New Invite Code</h2>
            <div className="flex gap-3">
              <select
                id="generate-role"
                name="generate-role"
                value={generateRole}
                onChange={(e) => setGenerateRole(e.target.value as 'superadmin' | 'admin' | 'staff')}
                className="px-4 py-2 border border-[var(--border)] rounded-lg font-medium text-sm bg-[var(--surface)] text-[var(--text)]"
                aria-label="Select role for new invite code"
              >
                <option value="staff">Staff User</option>
                <option value="admin">Admin User</option>
                {currentUser?.role === 'superadmin' && (
                  <option value="superadmin">Super Admin User</option>
                )}
              </select>
              <button
                onClick={generateInvite}
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium text-sm"
              >
                Generate Code
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3">Invite codes expire in 7 days</p>
          </div>
        )}

        {/* Pending Invites */}
        {activeTab === 'invites' && ['admin', 'superadmin'].includes(currentUser?.role || '') && (
          <div className="bg-[var(--surface)] rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 text-[var(--text)]">Pending Invites</h3>
            {pendingInvites.length === 0 ? (
              <p className="text-[var(--text-muted)] py-8 text-center">No pending invites</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Code</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Role</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Created By</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Expires</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {paginatedPendingInvites.map(invite => (
                      <tr key={invite.id} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-3">
                          <code className="bg-[var(--surface-2)] px-3 py-1 rounded font-mono text-xs text-[var(--text)]">{invite.code}</code>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            invite.role === 'superadmin' ? 'bg-blue-100 text-blue-700' : invite.role === 'admin' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {invite.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{invite.creator?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(invite.expiresAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => copyToClipboard(invite.code)}
                              className="p-2 text-[var(--primary)] hover:bg-[var(--surface-2)] rounded transition"
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
              {pendingInvites.length > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalItems={pendingInvites.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                />
              )}
            )}
          </div>
        )}

        {/* Used Invites */}
        {activeTab === 'invites' && usedInvites.length > 0 && ['admin', 'superadmin'].includes(currentUser?.role || '') && (
          <div className="bg-[var(--surface)] rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--text)]">
              <CheckCircle size={20} className="text-green-600" />
              Used Invites ({usedInvites.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Code</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Used By</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {paginatedUsedInvites.map(invite => (
                    <tr key={invite.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3">
                        <code className="bg-[var(--surface-2)] px-3 py-1 rounded font-mono text-xs text-[var(--text)]">{invite.code}</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          invite.role === 'superadmin' ? 'bg-blue-100 text-blue-700' : invite.role === 'admin' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {invite.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{invite.usedBy || '-'}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(invite.usedAt!).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {usedInvites.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalItems={usedInvites.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
            )}
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[var(--surface)] rounded-lg shadow-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 text-[var(--text)]">Edit User</h3>
              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                  {editError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Name</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1">Email</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)]">Note: Password changes are handled through password requests</p>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  onClick={saveUserEdit}
                  className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium"
                >
                  Save
                </button>
                <button
                  onClick={cancelEditUser}
                  className="flex-1 px-4 py-2 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)] font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Users List */}
        {activeTab === 'users' && (
          <div className="bg-[var(--surface)] rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 text-[var(--text)]">All Users</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Department</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Created</th>
                    <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {paginatedUsers.map(user => (
                    <tr key={user.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{user.name}</td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium flex w-fit gap-1 ${
                          user.role === 'superadmin' ? 'bg-blue-100 text-blue-700' : user.role === 'admin' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {(user.role === 'admin' || user.role === 'superadmin') && <Shield size={12} />}
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.role === 'superadmin' ? (
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 font-medium">All Departments</span>
                        ) : user.role === 'admin' ? (
                          // Admin: show assigned departments from adminDepartments
                          user.adminDepartments && user.adminDepartments.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.adminDepartments.map(ad => (
                                <span key={ad.departmentId} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-200">
                                  {ad.department.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">Unassigned</span>
                          )
                        ) : (
                          // Staff: show single department
                          user.departmentId ? (
                            <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-200">{departments.find(d => d.id === user.departmentId)?.name || '-'}</span>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">Unassigned</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 flex gap-2">
                        {currentUser?.role === 'superadmin' && (
                          <button
                            onClick={() => startEditUser(user)}
                            className="p-2 text-[var(--primary)] hover:bg-[var(--surface-2)] rounded transition"
                            title="Edit user"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                        {canDeleteUser(user) && (
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
            {users.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalItems={users.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
            )}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
