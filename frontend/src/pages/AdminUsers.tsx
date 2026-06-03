import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Copy, Trash2, Shield, Users, CheckCircle, Mail, ArrowLeft, Edit, ChevronRight } from 'lucide-react';
import { authApi, departmentsApi } from '@/services/api';
import Pagination from '@/components/Pagination';

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

const ROLE_COLOR: Record<string, string> = {
  superadmin: 'bg-blue-100 text-blue-700',
  admin: 'bg-green-100 text-green-700',
  staff: 'bg-purple-100 text-purple-700',
};

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<User | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });
  const [editError, setEditError] = useState('');

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
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const generateInvite = async () => {
    if (!currentUser) return;
    try {
      const roleToGenerate = currentUser.role === 'superadmin' ? generateRole : 'staff';
      const response = await fetch('/api/invites/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ role: roleToGenerate }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate invite');
      }
      const newInvite = await response.json();
      setInvites([newInvite, ...invites]);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      await fetch(`/api/invites/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setInvites(invites.filter(i => i.id !== id));
    } catch {
      setError('Failed to revoke invite');
    }
  };

  const openUserDrawer = (user: User) => {
    setDrawerUser(user);
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setEditError('');
    setDrawerOpen(true);
  };

  const startEdit = (user: User) => {
    setEditFormData({ name: user.name, email: user.email });
    setEditError('');
    setConfirmingDelete(false);
    setDrawerEditing(true);
  };

  const saveUserEdit = async () => {
    if (!drawerUser) return;
    if (!editFormData.name.trim()) { setEditError('Name is required'); return; }
    if (!editFormData.email.trim()) { setEditError('Email is required'); return; }
    try {
      const response = await fetch(`/api/users/${drawerUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: editFormData.name, email: editFormData.email }),
      });
      if (!response.ok) throw new Error();
      const updated = { ...drawerUser, ...editFormData };
      setUsers(users.map(u => u.id === drawerUser.id ? updated : u));
      setDrawerUser(updated);
      setDrawerEditing(false);
      setError('');
    } catch {
      setEditError('Failed to update user');
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerUser(null);
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setEditError('');
  };

  const doDelete = async () => {
    if (!drawerUser) return;
    try {
      await fetch(`/api/users/${drawerUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setUsers(users.filter(u => u.id !== drawerUser.id));
      closeDrawer();
    } catch {
      setError('Failed to delete user');
      setConfirmingDelete(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const canDeleteUser = (targetUser: User): boolean => {
    if (!currentUser) return false;
    if (targetUser.id === currentUser.id) return false;
    if (currentUser.role === 'superadmin') return true;
    if (currentUser.role === 'admin') return targetUser.role !== 'superadmin';
    return false;
  };

  const getDepartmentLabel = (user: User) => {
    if (user.role === 'superadmin') return 'All Departments';
    if (user.role === 'admin') {
      return user.adminDepartments?.map(ad => ad.department.name).join(', ') || 'Unassigned';
    }
    return user.departmentId ? departments.find(d => d.id === user.departmentId)?.name ?? 'Unknown' : 'Unassigned';
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-[var(--text-muted)]">Loading...</div></div>;
  if (!currentUser) return null;

  const getFilteredPendingInvites = () => {
    const all = invites.filter(i => !i.usedAt);
    if (currentUser.role === 'superadmin') return all;
    if (currentUser.role === 'admin') return all.filter(i => ['admin', 'staff'].includes(i.role));
    return [];
  };
  const pendingInvites = getFilteredPendingInvites();
  const paginatedPendingInvites = pendingInvites.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getFilteredUsedInvites = () => {
    const all = invites.filter(i => i.usedAt);
    if (currentUser.role === 'superadmin') return all;
    if (currentUser.role === 'admin') return all.filter(i => ['admin', 'staff'].includes(i.role));
    return [];
  };
  const usedInvites = getFilteredUsedInvites();
  const paginatedUsedInvites = usedInvites.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const paginatedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
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
              title="Back to Scanner">
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
              }`}>
              <Mail className="inline mr-2" size={18} />
              Invite Codes ({pendingInvites.length} pending)
            </button>
            <button
              onClick={() => { setActiveTab('users'); setCurrentPage(1); }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
                activeTab === 'users'
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              <Users className="inline mr-2" size={18} />
              Users ({users.length})
            </button>
          </div>

          {/* Generate Invite */}
          {activeTab === 'invites' && ['admin', 'superadmin'].includes(currentUser.role) && (
            <div className="bg-[var(--surface)] rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text)]">Generate New Invite Code</h2>
              <div className="flex gap-3">
                <select
                  value={generateRole}
                  onChange={e => setGenerateRole(e.target.value as 'superadmin' | 'admin' | 'staff')}
                  className="px-4 py-2 border border-[var(--border)] rounded-lg font-medium text-sm bg-[var(--surface)] text-[var(--text)]">
                  <option value="staff">Staff User</option>
                  {currentUser.role === 'superadmin' && (
                    <option value="admin">Admin User</option>
                  )}
                  {currentUser.role === 'superadmin' && (
                    <option value="superadmin">Super Admin User</option>
                  )}
                </select>
                <button
                  onClick={generateInvite}
                  className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium text-sm">
                  Generate Code
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-3">Invite codes expire in 7 days</p>
            </div>
          )}

          {/* Pending Invites */}
          {activeTab === 'invites' && ['admin', 'superadmin'].includes(currentUser.role) && (
            <div className="bg-[var(--surface)] rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 text-[var(--text)]">Pending Invites</h3>
              {pendingInvites.length === 0 ? (
                <p className="text-[var(--text-muted)] py-8 text-center">No pending invites</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Code</th>
                          <th className="px-4 py-3 text-center font-semibold text-[var(--text)]">Role</th>
                          <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Created By</th>
                          <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Expires</th>
                          <th className="px-4 py-3 text-center font-semibold text-[var(--text)]">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {paginatedPendingInvites.map(invite => (
                          <tr key={invite.id} className="hover:bg-[var(--surface-2)] transition-colors">
                            <td className="px-4 py-3">
                              <code className="bg-[var(--surface-2)] px-3 py-1 rounded font-mono text-xs text-[var(--text)]">{invite.code}</code>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${ROLE_COLOR[invite.role] ?? 'bg-gray-100 text-gray-700'}`}>{invite.role}</span>
                            </td>
                            <td className="px-4 py-3 text-[var(--text-muted)]">{invite.creator?.name || 'Unknown'}</td>
                            <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(invite.expiresAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex gap-2 items-center justify-center">
                                <button onClick={() => copyToClipboard(invite.code)}
                                  className="p-2 text-[var(--primary)] hover:bg-[var(--surface-2)] rounded transition" title="Copy code">
                                  <Copy size={16} />
                                </button>
                                <button onClick={() => revokeInvite(invite.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded transition" title="Revoke">
                                  <Trash2 size={16} />
                                </button>
                                {copied === invite.code && <span className="text-xs text-green-600">✓ Copied</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={currentPage}
                    totalItems={pendingInvites.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                  />
                </>
              )}
            </div>
          )}

          {/* Used Invites */}
          {activeTab === 'invites' && usedInvites.length > 0 && ['admin', 'superadmin'].includes(currentUser.role) && (
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
                      <th className="px-4 py-3 text-center font-semibold text-[var(--text)]">Role</th>
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
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${ROLE_COLOR[invite.role] ?? 'bg-gray-100 text-gray-700'}`}>{invite.role}</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{invite.usedBy || '-'}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(invite.usedAt!).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalItems={usedInvites.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
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
                      <th className="px-4 py-3 text-center font-semibold text-[var(--text)]">Role</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Department</th>
                      <th className="px-4 py-3 text-left font-semibold text-[var(--text)]">Created</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {paginatedUsers.map(user => (
                      <tr
                        key={user.id}
                        onClick={() => openUserDrawer(user)}
                        className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{user.name}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{user.email}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium inline-flex gap-1 ${ROLE_COLOR[user.role] ?? 'bg-gray-100 text-gray-700'}`}>
                            {(user.role === 'admin' || user.role === 'superadmin') && <Shield size={12} />}
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{getDepartmentLabel(user)}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)] text-xs">{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight size={16} className="text-[var(--text-muted)] inline-block" />
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

      {/* Right-Side Drawer */}
      {drawerOpen && drawerUser && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-[var(--text)]">
                    {drawerEditing ? 'Edit User' : drawerUser.name}
                  </h2>
                  {!drawerEditing && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1 ${ROLE_COLOR[drawerUser.role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {(drawerUser.role === 'admin' || drawerUser.role === 'superadmin') && <Shield size={11} />}
                      {drawerUser.role}
                    </span>
                  )}
                </div>
                {!drawerEditing && (
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{drawerUser.email}</p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Name</label>
                    <input
                      type="text"
                      value={editFormData.name}
                      onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Email</label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
                    />
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">Password changes are handled through password requests.</p>
                  {editError && <p className="text-red-500 text-sm">{editError}</p>}
                </div>
              ) : (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Account</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Name</p>
                        <p className="text-sm font-medium text-[var(--text)]">{drawerUser.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Email</p>
                        <p className="text-sm text-[var(--text)]">{drawerUser.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Role</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${ROLE_COLOR[drawerUser.role] ?? 'bg-gray-100 text-gray-700'}`}>
                          {(drawerUser.role === 'admin' || drawerUser.role === 'superadmin') && <Shield size={11} />}
                          {drawerUser.role}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Department(s)</p>
                        {drawerUser.role === 'superadmin' ? (
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200 font-medium">All Departments</span>
                        ) : drawerUser.role === 'admin' && drawerUser.adminDepartments?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {drawerUser.adminDepartments.map(ad => (
                              <span key={ad.departmentId} className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded border border-green-200">{ad.department.name}</span>
                            ))}
                          </div>
                        ) : drawerUser.role === 'staff' && drawerUser.departmentId ? (
                          <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-200">
                            {departments.find(d => d.id === drawerUser.departmentId)?.name ?? 'Unknown'}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--text-muted)]">Unassigned</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Date Created</p>
                        <p className="text-sm text-[var(--text)]">{new Date(drawerUser.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
              {drawerEditing ? (
                <div className="flex gap-2">
                  <button onClick={saveUserEdit}
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Save
                  </button>
                  <button onClick={() => setDrawerEditing(false)}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{drawerUser.name}"?</p>
                  <div className="flex gap-2">
                    <button onClick={doDelete}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                      Yes, Delete
                    </button>
                    <button onClick={() => setConfirmingDelete(false)}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {currentUser?.role === 'superadmin' && (
                    <button onClick={() => startEdit(drawerUser)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      <Edit size={14} /> Edit
                    </button>
                  )}
                  {canDeleteUser(drawerUser) && (
                    <button onClick={() => setConfirmingDelete(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
