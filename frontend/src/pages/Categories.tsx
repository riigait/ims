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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [formError, setFormError] = useState('');

  const fetchCategories = async () => {
    try {
      const [categoriesRes, deptRes] = await Promise.all([
        categoriesApi.getAll(),
        user.role === 'superadmin' ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
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
    setSelectedItem(null);
    setEditingItem(null);
    setFormData({ name: '', description: '' });
    setFormError('');
    setIsCreating(true);
    setConfirmingDelete(false);
    setIsDrawerOpen(true);
  };

  const openViewDrawer = (category: Category) => {
    setSelectedItem(category);
    setEditingItem(null);
    setIsCreating(false);
    setFormError('');
    setConfirmingDelete(false);
    setIsDrawerOpen(true);
  };

  const openEdit = (category: Category) => {
    setSelectedItem(category);
    setEditingItem(category);
    setIsCreating(false);
    setFormData({ name: category.name, description: category.description || '' });
    setFormError('');
    setConfirmingDelete(false);
    setIsDrawerOpen(true);
  };

  const cancelEdit = () => {
    if (isCreating) { closeDrawer(); return; }
    setEditingItem(null);
    setFormError('');
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedItem(null);
    setEditingItem(null);
    setIsCreating(false);
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
      if (editingItem) {
        await categoriesApi.update(editingItem.id, formData);
        const updated = { ...editingItem, name: formData.name, description: formData.description };
        setSelectedItem(updated);
        setEditingItem(null);
        await fetchCategories();
      } else {
        await categoriesApi.create(formData);
        await fetchCategories();
        closeDrawer();
      }
      setFormError('');
    } catch {
      setFormError('Failed to save category');
    }
  };

  const doDelete = async () => {
    if (!selectedItem) return;
    try {
      await categoriesApi.delete(selectedItem.id);
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
      <p className="text-sm text-[var(--text-muted)]">
        {filteredAndSortedCategories.length !== categories.length
          ? <><span className="text-[var(--primary)] font-medium">{filteredAndSortedCategories.length} filtered</span> of {categories.length} total</>
          : <>{categories.length} total</>
        }
        {categories.filter(c => c.departmentId).length > 0 && <> · <span className="text-blue-600">{categories.filter(c => c.departmentId).length} with department</span></>}
        {categories.filter(c => !c.departmentId).length > 0 && <> · <span className="text-[var(--text-muted)]">{categories.filter(c => !c.departmentId).length} unassigned</span></>}
      </p>
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
                const dept = category.department;
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
      {isDrawerOpen && (selectedItem || isCreating) && (
        <div className="fixed inset-0 z-50 flex drawer-overlay">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden drawer-panel">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {isCreating ? 'New Category' : editingItem ? 'Edit Category' : selectedItem?.name}
                </h2>
                {selectedItem && !editingItem && !isCreating && (
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">
                    {selectedItem.department?.name ?? 'No department'}
                  </p>
                )}
              </div>
              <button type="button" onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(editingItem || isCreating) ? (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Category Details</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Category Name *</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
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
                          className="w-full px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                        />
                      </div>
                    </div>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                  <div className="flex gap-2">
                    <button type="submit"
                      className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      Save
                    </button>
                    <button type="button" onClick={cancelEdit}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : selectedItem && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Name</p>
                        <p className="text-sm font-medium text-[var(--text)]">{selectedItem.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Department</p>
                        <p className="text-sm text-[var(--text)]">{selectedItem.department?.name ?? '—'}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Description</p>
                        <p className="text-sm text-[var(--text)]">{selectedItem.description || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Date Added</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(selectedItem.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Last Updated</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(selectedItem.updatedAt)}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Footer — view mode actions only */}
            {!editingItem && !isCreating && (
              <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
                {confirmingDelete ? (
                  <div className="w-full">
                    <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{selectedItem?.name}"?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={doDelete}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                        Yes, Delete
                      </button>
                      <button type="button" onClick={() => setConfirmingDelete(false)}
                        className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : user.role === 'admin' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => selectedItem && openEdit(selectedItem)}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                      <Edit size={14} /> Edit Details
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
