import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Plus, X } from 'lucide-react';

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
  adminDepartments?: Array<{ departmentId: string; department: Department }>;
}

export default function AdminAssignment() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const assignDepartment = async (adminId: string, deptId: string) => {
    try {
      setError('');
      const response = await fetch(`/api/admin-departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ adminId, departmentId: deptId }),
      });

      if (!response.ok) throw new Error('Failed to assign department');

      setAdmins(
        admins.map(a => {
          if (a.id === adminId) {
            return {
              ...a,
              adminDepartments: [
                ...(a.adminDepartments || []),
                { departmentId: deptId, department: departments.find(d => d.id === deptId)! },
              ],
            };
          }
          return a;
        })
      );
    } catch (err) {
      setError('Failed to assign department');
      console.error(err);
    }
  };

  const unassignDepartment = async (adminId: string, deptId: string) => {
    try {
      const response = await fetch(`/api/admin-departments/${adminId}/${deptId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!response.ok) throw new Error('Failed to unassign department');

      setAdmins(
        admins.map(a => {
          if (a.id === adminId) {
            return {
              ...a,
              adminDepartments: (a.adminDepartments || []).filter(ad => ad.departmentId !== deptId),
            };
          }
          return a;
        })
      );
    } catch (err) {
      setError('Failed to unassign department');
      console.error(err);
    }
  };

  const getAvailableDepartments = (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    const assignedIds = new Set((admin?.adminDepartments || []).map(ad => ad.departmentId));
    return departments.filter(d => !assignedIds.has(d.id));
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/scanner')}
            className="p-2 hover:bg-gray-200 rounded-lg transition"
            title="Back to Scanner"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Admin Department Assignment</h1>
            <p className="text-gray-600 mt-2">Assign multiple departments to admins</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {admins.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">No admins found. Create admin accounts first.</p>
            </div>
          ) : (
            admins.map(admin => (
              <div key={admin.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{admin.name}</h3>
                    <p className="text-sm text-gray-500">{admin.email}</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    Admin
                  </span>
                </div>

                {/* Assigned Departments */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Assigned Departments ({admin.adminDepartments?.length || 0})
                  </p>
                  {(admin.adminDepartments?.length || 0) === 0 ? (
                    <p className="text-sm text-gray-500">No departments assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {admin.adminDepartments?.map(ad => (
                        <div
                          key={ad.departmentId}
                          className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm font-medium text-green-800">{ad.department.name}</span>
                          <button
                            onClick={() => unassignDepartment(admin.id, ad.departmentId)}
                            className="text-green-600 hover:text-red-600 transition"
                            title="Remove"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assign More Departments */}
                {getAvailableDepartments(admin.id).length > 0 && (
                  <div className="flex gap-2">
                    <select
                      id={`select-${admin.id}`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                    >
                      <option value="">Select a department to assign...</option>
                      {getAvailableDepartments(admin.id).map(dept => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById(`select-${admin.id}`) as HTMLSelectElement;
                        if (select.value) {
                          assignDepartment(admin.id, select.value);
                          select.value = '';
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 transition"
                    >
                      <Plus size={16} />
                      Assign
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {departments.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-700 text-sm">
              No departments found. Create departments first.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
