import { useState, useEffect } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { categoriesApi, departmentsApi } from '@/services/api';
import { Category } from '@/types/inventory';
import { CategoryFilter } from '@/types/filters';
import { filterCategories } from '@/utils/filterHelpers';
import { formatDate } from '@/utils/ids';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CategoryFilter & { departmentId?: string }>({
    search: '',
    departmentId: undefined,
  });
  const [sortBy, setSortBy] = useState('recently-added');
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [wasInAllDepartmentsMode, setWasInAllDepartmentsMode] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchCategories = async () => {
    try {
      const [categoriesRes, deptRes] = await Promise.all([
        categoriesApi.getAll(),
        departmentsApi.getAll(),
      ]);
      setCategories(categoriesRes.data);
      setDepartments(deptRes.data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      setLoading(true);
      fetchCategories();
    };
    setLoading(true);
    fetchCategories();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Category name is required');
      return;
    }
    try {
      if (editingId) {
        await categoriesApi.update(editingId, formData);
      } else {
        await categoriesApi.create(formData);
      }
      await fetchCategories();
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', description: '' });
      setError('');
      if (wasInAllDepartmentsMode) {
        localStorage.setItem('currentDepartmentId', ALL_DEPARTMENTS_ID);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to save category:', error);
      setError('Failed to save category');
    }
  };

  const handleEdit = (category: Category) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    const isInAllDepartmentsMode = currentDeptId === ALL_DEPARTMENTS_ID;
    if (isInAllDepartmentsMode && category.departmentId) {
      setWasInAllDepartmentsMode(true);
      localStorage.setItem('currentDepartmentId', category.departmentId);
      window.location.reload();
      return;
    }
    setFormData({ name: category.name, description: category.description });
    setEditingId(category.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await categoriesApi.delete(deleteConfirm);
      await fetchCategories();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete category:', error);
      setError('Failed to delete category');
      setDeleteConfirm(null);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', description: '' });
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

  const formContent = (
    <>
      <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">{editingId ? 'Edit Category' : 'New Category'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="category-name" className="block text-sm font-medium text-[var(--text)] mb-1">
            Category Name *
          </label>
          <input
            id="category-name"
            name="name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            required
          />
        </div>
        <div>
          <label htmlFor="category-description" className="block text-sm font-medium text-[var(--text)] mb-1">
            Description
          </label>
          <textarea
            id="category-description"
            name="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
            Save
          </button>
          <button type="button" onClick={handleCancel} className="px-4 py-2 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)]">
            Cancel
          </button>
        </div>
      </form>
    </>
  );

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input
          id="search-categories"
          name="search"
          type="text"
          placeholder="Search by category name…"
          value={filters.search}
          onChange={e => { setFilters({ ...filters, search: e.target.value }); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
          aria-label="Search categories"
        />
        <select
          id="sort-by"
          name="sort-by"
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]"
          aria-label="Sort by">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          onClick={clearAllFilters}
          className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">
          Clear
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {user.role === 'superadmin' && (
          <select
            id="filter-department"
            name="filter-department"
            value={filters.departmentId || ''}
            onChange={e => { setFilters({ ...filters, departmentId: e.target.value || undefined }); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
            aria-label="Filter by department">
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );

  return (
    <>
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Category"
          message="Are you sure you want to delete this category?"
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <DataPageLayout
        title="Categories"
        error={error}
        showForm={showForm}
        onAddClick={() => setShowForm(true)}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        formContent={formContent}
        filterContent={filterContent}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Name</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Description</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Department</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Date</th>
              {user.role !== 'superadmin' && (
                <th className="px-4 py-2 text-right text-[var(--text)] font-semibold">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filteredAndSortedCategories.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No categories found.
                </td>
              </tr>
            ) : paginatedCategories.map((category) => {
              const dept = category.departmentId ? departments.find(d => d.id === category.departmentId) : null;
              return (
                <tr key={category.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-2 text-[var(--text)]">{category.name}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{category.description}</td>
                  <td className="px-4 py-2 text-[var(--text)]">{dept?.name ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(category.createdAt)}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {user.role === 'admin' && (
                      <>
                        <button
                          onClick={() => handleEdit(category)}
                          className="text-[var(--primary)] hover:text-[var(--primary-hover)]">
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="text-red-600 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
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
    </>
  );
}
