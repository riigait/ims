import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';

interface Department {
  id: string;
  name: string;
  description?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId?: string;
}

export default function AdminAssignment() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user.role !== 'superadmin') {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [deptsRes, usersRes] = await Promise.all([
        fetch('/api/departments', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
        fetch('/api/users', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }).then(r => r.json()),
      ]);

      const deptList = deptsRes.data || deptsRes;
      const adminsList = (usersRes || []).filter((u: User) => u.role === 'admin');

      setDepartments(deptList);
      setAdmins(adminsList);

      // Build current assignments
      const curr: Record<string, string> = {};
      adminsList.forEach((admin: User) => {
        if (admin.departmentId) {
          curr[admin.departmentId] = admin.id;
        }
      });
      setAssignments(curr);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (deptId: string, adminId: string) => {
    try {
      setError('');
      const response = await fetch(`/api/users/${adminId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ departmentId: adminId === '' ? null : deptId }),
      });

      if (!response.ok) throw new Error('Failed to update assignment');

      setAssignments({ ...assignments, [deptId]: adminId });
    } catch (err) {
      setError('Failed to assign admin to department');
      console.error(err);
    }
  };

  const handleUnassign = async (deptId: string) => {
    try {
      const currentAdminId = assignments[deptId];
      if (!currentAdminId) return;

      await fetch(`/api/users/${currentAdminId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ departmentId: null }),
      });

      const newAssignments = { ...assignments };
      delete newAssignments[deptId];
      setAssignments(newAssignments);
    } catch (err) {
      setError('Failed to unassign admin');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/scanner')}
            className="p-2 hover:bg-gray-200 rounded-lg transition"
            title="Back to Scanner"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Department Admin Assignment</h1>
            <p className="text-gray-600 mt-2">Assign department admins (superadmin only)</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Department</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Current Admin</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {departments.map(dept => (
                <tr key={dept.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{dept.name}</p>
                      <p className="text-sm text-gray-500">{dept.description || '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={assignments[dept.id] || ''}
                      onChange={(e) => handleAssign(dept.id, e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">Unassigned</option>
                      {admins.map(admin => (
                        <option key={admin.id} value={admin.id}>
                          {admin.name} ({admin.email})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    {assignments[dept.id] && (
                      <button
                        onClick={() => handleUnassign(dept.id)}
                        className="px-3 py-1 text-red-600 hover:bg-red-50 rounded transition text-sm"
                      >
                        Unassign
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {departments.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No departments found</p>
          </div>
        )}

        {admins.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-700 text-sm">
              No admins found. Create admin accounts in User Management first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
