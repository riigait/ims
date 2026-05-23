import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Building2, ArrowLeft } from 'lucide-react';
import { departmentsApi } from '@/services/api';

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
  const [showForm, setShowForm] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', description: '' });

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const res = await departmentsApi.getAll();
      setDepartments(res.data);
    } catch (err) {
      setError('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newDept.name.trim()) {
      setError('Department name is required');
      return;
    }
    try {
      await departmentsApi.create(newDept);
      setNewDept({ name: '', description: '' });
      setShowForm(false);
      setError('');
      await loadDepartments();
    } catch (err) {
      setError('Failed to create department');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    try {
      await departmentsApi.delete(id);
      await loadDepartments();
    } catch (err) {
      setError('Failed to delete department');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-[var(--text-muted)]">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/scanner')}
              className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition"
              title="Back to Scanner"
            >
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
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium flex items-center gap-2"
          >
            <Plus size={20} />
            Add Department
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {showForm && (
          <div className="bg-[var(--surface)] rounded-lg shadow p-6 border-l-4 border-[var(--primary)]">
            <h2 className="text-lg font-semibold mb-4 text-[var(--text)]">Create New Department</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="dept-name" className="block text-sm font-medium text-[var(--text)] mb-2">
                  Department Name *
                </label>
                <input
                  id="dept-name"
                  name="name"
                  type="text"
                  placeholder="e.g., SCADA Office"
                  value={newDept.name}
                  onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <label htmlFor="dept-description" className="block text-sm font-medium text-[var(--text)] mb-2">
                  Description
                </label>
                <textarea
                  id="dept-description"
                  name="description"
                  placeholder="Optional description"
                  value={newDept.description}
                  onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none bg-[var(--surface)] text-[var(--text)]"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreate}
                  className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)] font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {departments.length === 0 ? (
          <div className="bg-[var(--surface)] rounded-lg shadow p-12 text-center">
            <Building2 size={48} className="mx-auto text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-muted)] mb-4">No departments yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium inline-flex items-center gap-2"
            >
              <Plus size={18} />
              Create First Department
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(dept => (
              <div
                key={dept.id}
                className="bg-[var(--surface)] rounded-lg shadow p-6 border-l-4 border-[var(--primary)] hover:shadow-lg transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-[var(--text)]">{dept.name}</h3>
                  <button
                    onClick={() => handleDelete(dept.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                    title="Delete department"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                {dept.description && (
                  <p className="text-[var(--text-muted)] text-sm mb-3">{dept.description}</p>
                )}
                <p className="text-xs text-[var(--text-muted)]">
                  Created {new Date(dept.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
