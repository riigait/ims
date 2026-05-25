import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Trash2, Building2, ArrowLeft, Edit } from 'lucide-react';
import { departmentsApi } from '@/services/api';
import Pagination from '@/components/Pagination';

interface Department {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export default function AdminDepartments() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<Department | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => { loadDepartments(); }, []);

  const loadDepartments = async () => {
    try {
      const res = await departmentsApi.getAll();
      setDepartments(res.data);
    } catch {
      setError('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const openNewDrawer = () => {
    setDrawerItem(null);
    setFormData({ name: '', description: '' });
    setFormError('');
    setDrawerEditing(true);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const openViewDrawer = (dept: Department) => {
    setDrawerItem(dept);
    setFormError('');
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const startEdit = (dept: Department) => {
    setFormData({ name: dept.name, description: dept.description || '' });
    setFormError('');
    setConfirmingDelete(false);
    setDrawerEditing(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setFormData({ name: '', description: '' });
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Department name is required');
      return;
    }
    try {
      if (drawerItem) {
        await departmentsApi.update(drawerItem.id, formData);
        setDrawerItem({ ...drawerItem, name: formData.name, description: formData.description });
        setDrawerEditing(false);
      } else {
        await departmentsApi.create(formData);
        closeDrawer();
      }
      await loadDepartments();
      setFormError('');
    } catch {
      setFormError('Failed to save department');
    }
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await departmentsApi.delete(drawerItem.id);
      await loadDepartments();
      closeDrawer();
    } catch {
      setError('Failed to delete department');
      setConfirmingDelete(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-[var(--text-muted)]">Loading...</div></div>;

  const paginatedDepartments = departments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/scanner')}
                className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition"
                title="Back to Scanner">
                <ArrowLeft size={24} className="text-[var(--text)]" />
              </button>
              <div>
                <h1 className="text-4xl font-bold text-[var(--text)] flex items-center gap-3">
                  <Building2 size={36} className="text-[var(--primary)]" />
                  Departments
                </h1>
                <p className="text-[var(--text-muted)] mt-2">Manage warehouse departments and locations</p>
              </div>
            </div>
            <button
              onClick={openNewDrawer}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium flex items-center gap-2">
              <Plus size={20} />
              Add Department
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {departments.length === 0 ? (
            <div className="bg-[var(--surface)] rounded-lg shadow p-12 text-center">
              <Building2 size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
              <p className="text-[var(--text-muted)] mb-4">No departments yet</p>
              <button
                onClick={openNewDrawer}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium inline-flex items-center gap-2">
                <Plus size={18} />
                Create First Department
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedDepartments.map(dept => (
                  <div
                    key={dept.id}
                    onClick={() => openViewDrawer(dept)}
                    className="bg-[var(--surface)] rounded-lg shadow p-6 border-l-4 border-[var(--primary)] hover:shadow-lg transition cursor-pointer">
                    <h3 className="text-lg font-semibold text-[var(--text)] mb-1">{dept.name}</h3>
                    {dept.description && (
                      <p className="text-[var(--text-muted)] text-sm mb-3">{dept.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">
                      Created {new Date(dept.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
              <Pagination
                currentPage={currentPage}
                totalItems={departments.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
            </>
          )}
        </div>
      </div>

      {/* Right-Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-[var(--text)]">
                {!drawerItem ? 'New Department' : drawerEditing ? 'Edit Department' : drawerItem.name}
              </h2>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerEditing ? (
                <form id="dept-form" onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Department Name *</label>
                    <input
                      type="text"
                      placeholder="e.g., SCADA Office"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
                      autoFocus
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Description</label>
                    <textarea
                      placeholder="Optional description"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)] resize-none"
                    />
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                </form>
              ) : drawerItem && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Name</p>
                        <p className="text-sm font-medium text-[var(--text)]">{drawerItem.name}</p>
                      </div>
                      {drawerItem.description && (
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Description</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.description}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Date Created</p>
                        <p className="text-sm text-[var(--text)]">{new Date(drawerItem.createdAt).toLocaleDateString()}</p>
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
                  <button type="submit" form="dept-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    {drawerItem ? 'Save' : 'Create'}
                  </button>
                  <button type="button" onClick={() => drawerItem ? setDrawerEditing(false) : closeDrawer()}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{drawerItem?.name}"?</p>
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
              ) : drawerItem && (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(drawerItem)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    <Edit size={14} /> Edit
                  </button>
                  <button onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
