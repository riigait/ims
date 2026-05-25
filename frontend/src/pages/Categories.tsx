import { useState, useEffect } from 'react';
import { X, Edit, Trash2, ChevronRight } from 'lucide-react';
import { categoriesApi, departmentsApi } from '@/services/api';
import { Category } from '@/types/inventory';
import { CategoryFilter } from '@/types/filters';
import { filterCategories } from '@/utils/filterHelpers';
import { formatDate } from '@/utils/ids';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

interface Department {
  id: string;
  name: string;
}

export default function Categories() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CategoryFilter & { departmentId?: string }>({
    search: '',
    departmentId: undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<Category | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');

  const fetchCategories = async () => {
    try {
      const [categoriesRes, deptRes] = await Promise.all([
        categoriesApi.getAll(),
        departmentsApi.getAll(),
      ]);
      setCategories(categoriesRes.data);
      setDepartments(deptRes.data);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => { setLoading(true); fetchCategories(); };
    setLoading(true);
    fetchCategories();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const openNewDrawer = () => {
    setDrawerItem(null);
    setFormData({ name: '', description: '' });
    setFormError('');
    setDrawerEditing(true);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const openViewDrawer = (category: Category) => {
    setDrawerItem(category);
    setFormError('');
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const startEdit = (category: Category) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    if (currentDeptId === ALL_DEPARTMENTS_ID && category.departmentId) {
      localStorage.setItem('currentDepartmentId', category.departmentId);
      window.location.reload();
      return;
    }
    setFormData({ name: category.name, description: category.description || '' });
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
      setFormError('Category name is required');
      return;
    }
    try {
      if (drawerItem) {
        await categoriesApi.update(drawerItem.id, formData);
        setDrawerItem({ ...drawerItem, name: formData.name, description: formData.description });
        setDrawerEditing(false);
      } else {
        await categoriesApi.create(formData);
        closeDrawer();
      }
      await fetchCategories();
      setFormError('');
    } catch {
      setFormError('Failed to save category');
    }
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await categoriesApi.delete(drawerItem.id);
      await fetchCategories();
      closeDrawer();
    } catch {
      setError('Failed to delete category');
      setConfirmingDelete(false);
    }
  };

  const filteredAndSortedCategories = filterCategories(categories, filters.search)
    .filter(cat => !filters.departmentId || cat.departmentId === filters.departmentId)
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'recently-added') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return 0;
    });
  const paginatedCategories = filteredAndSortedCategories.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setFilters({ search: '', departmentId: undefined });
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search by category name…"
          value={filters.search}
          onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
        />
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          onClick={clearAllFilters}
          className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">
          Clear
        </button>
      </div>
      {user.role === 'superadmin' && (
        <div className="flex gap-2 flex-wrap">
          <select
            value={filters.departmentId || ''}
            onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  return (
    <>
      <DataPageLayout
        title="Categories"
        error={error}
        showForm={false}
        formContent={null}
        onAddClick={openNewDrawer}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        filterContent={filterContent}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Name</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Description</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Department</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredAndSortedCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No categories found.
                  </td>
                </tr>
              ) : paginatedCategories.map((category) => {
                const dept = category.departmentId ? departments.find(d => d.id === category.departmentId) : null;
                return (
                  <tr
                    key={category.id}
                    onClick={() => openViewDrawer(category)}
                    className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
                    <td className="px-4 py-2 text-[var(--text)] font-medium">{category.name}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">{category.description || '—'}</td>
                    <td className="px-4 py-2 text-[var(--text)]">{dept?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(category.createdAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <ChevronRight size={16} className="text-[var(--text-muted)] inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAndSortedCategories.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedCategories.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </DataPageLayout>

      {/* Right-Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {!drawerItem ? 'New Category' : drawerEditing ? 'Edit Category' : drawerItem.name}
                </h2>
                {drawerItem && !drawerEditing && (
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">
                    {departments.find(d => d.id === drawerItem.departmentId)?.name ?? 'No department'}
                  </p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerEditing ? (
                <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Category Name *</label>
                    <input
                      type="text"
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
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
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
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Description</p>
                        <p className="text-sm text-[var(--text)]">{drawerItem.description || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Department</p>
                        <p className="text-sm text-[var(--text)]">{departments.find(d => d.id === drawerItem.departmentId)?.name ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Date Added</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(drawerItem.createdAt)}</p>
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
                  <button type="submit" form="category-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Save
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
              ) : user.role === 'admin' && (
                <div className="flex gap-2">
                  <button onClick={() => drawerItem && startEdit(drawerItem)}
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
