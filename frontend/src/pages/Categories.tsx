import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { categoriesApi, departmentsApi } from '@/services/api';
import { Category } from '@/types/inventory';
import { CategoryFilter } from '@/types/filters';
import { filterCategories } from '@/utils/filterHelpers';

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

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const fetchCategories = async () => {
    try {
      const [categoriesRes, deptRes] = await Promise.all([
        categoriesApi.getAll(),
        user.role === 'superadmin' ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
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
      alert('Category name is required');
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
    } catch (error) {
      console.error('Failed to save category:', error);
      alert('Failed to save category');
    }
  };

  const handleEdit = (category: Category) => {
    setFormData({
      name: category.name,
      description: category.description,
    });
    setEditingId(category.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await categoriesApi.delete(id);
      await fetchCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category');
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

  const clearAllFilters = () => {
    setFilters({ search: '', departmentId: undefined });
    setSortBy('recently-added');
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
        {(user.role === 'admin' || user.role === 'superadmin') && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            Add Category
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Category' : 'New Category'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="category-name" className="block text-sm font-medium text-gray-700 mb-1">
                Category Name *
              </label>
              <input
                id="category-name"
                name="name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label htmlFor="category-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="category-description"
                name="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        {/* Filters */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by category name…"
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Search categories"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {user.role === 'superadmin' && (
              <select
                value={filters.departmentId || ''}
                onChange={e => setFilters({ ...filters, departmentId: e.target.value || undefined })}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
                aria-label="Filter by department">
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            )}

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm font-medium bg-blue-50"
              aria-label="Sort by">
              <option value="recently-added">Sort: Recently Added</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>

          <button
            onClick={clearAllFilters}
            className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium">
            Clear All Filters
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Description
              </th>
              {user.role === 'superadmin' && (
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Department
                </th>
              )}
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredAndSortedCategories.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'superadmin' ? 4 : 3} className="px-6 py-8 text-center text-gray-400">
                  No categories found.
                </td>
              </tr>
            ) : filteredAndSortedCategories.map((category) => {
              const dept = category.departmentId ? departments.find(d => d.id === category.departmentId) : null;
              return (
              <tr key={category.id}>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {category.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {category.description}
                </td>
                {user.role === 'superadmin' && (
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {dept?.name ?? '—'}
                  </td>
                )}
                <td className="px-6 py-4 text-sm space-x-2">
                  {(user.role === 'admin' || user.role === 'superadmin') && (
                    <>
                      <button
                        onClick={() => handleEdit(category)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="text-red-600 hover:text-red-800"
                      >
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
      </div>
    </div>
  );
}
