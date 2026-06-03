import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Plus, X } from 'lucide-react';
import { departmentsApi, usersApi, adminDepartmentsApi, staffDepartmentsApi } from '@/services/api';

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
  staffDepartments?: Array<{ departmentId: string; department: Department }>;
}

export default function AdminAssignment() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
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
      const [deptRes, usersRes] = await Promise.all([
        departmentsApi.getAll(),
        usersApi.getAll(),
      ]);
      const deptList = deptRes.data.data || deptRes.data;
      const userList = usersRes.data.data || usersRes.data || [];
      setDepartments(deptList);
      setAdmins(userList.filter((u: User) => u.role === 'admin'));
      setStaff(userList.filter((u: User) => u.role === 'staff'));
    } catch (err) {
      setError('Unable to load data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const assignDepartment = async (adminId: string, deptId: string) => {
    try {
      setError('');
      await adminDepartmentsApi.assign(adminId, deptId);
      setAdmins(admins.map(a => {
        if (a.id !== adminId) return a;
        return {
          ...a,
          adminDepartments: [
            ...(a.adminDepartments || []),
            { departmentId: deptId, department: departments.find(d => d.id === deptId)! },
          ],
        };
      }));
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(msg?.includes('already assigned') ? 'This admin is already assigned to this department' : 'Unable to complete request');
    }
  };

  const unassignDepartment = async (adminId: string, deptId: string) => {
    try {
      await adminDepartmentsApi.unassign(adminId, deptId);
      setAdmins(admins.map(a => {
        if (a.id !== adminId) return a;
        return { ...a, adminDepartments: (a.adminDepartments || []).filter(ad => ad.departmentId !== deptId) };
      }));
    } catch {
      setError('Unable to complete request');
    }
  };

  const getAvailableDepartments = (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    const assignedIds = new Set((admin?.adminDepartments || []).map(ad => ad.departmentId));
    return departments.filter(d => !assignedIds.has(d.id));
  };

  const getAvailableStaffDepartments = (staffId: string) => {
    const staffMember = staff.find(s => s.id === staffId);
    const assignedIds = new Set((staffMember?.staffDepartments || []).map(sd => sd.departmentId));
    return departments.filter(d => !assignedIds.has(d.id));
  };

  const assignStaffDepartment = async (staffId: string, deptId: string) => {
    try {
      setError('');
      await staffDepartmentsApi.assign(staffId, deptId);
      setStaff(staff.map(s => {
        if (s.id !== staffId) return s;
        return {
          ...s,
          staffDepartments: [
            ...(s.staffDepartments || []),
            { departmentId: deptId, department: departments.find(d => d.id === deptId)! },
          ],
        };
      }));
    } catch (err: any) {
      const msg = err.response?.data?.error;
      setError(msg?.includes('already assigned') ? 'This staff member is already assigned to this department' : 'Unable to complete request');
    }
  };

  const unassignStaffDepartment = async (staffId: string, deptId: string) => {
    try {
      await staffDepartmentsApi.unassign(staffId, deptId);
      setStaff(staff.map(s => {
        if (s.id !== staffId) return s;
        return { ...s, staffDepartments: (s.staffDepartments || []).filter(sd => sd.departmentId !== deptId) };
      }));
    } catch {
      setError('Unable to complete request');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-[var(--surface-2)] rounded-lg transition"
            title="Back to Scanner"
          >
            <ArrowLeft size={24} className="text-[var(--text)]" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-[var(--text)]">Role Assignments</h1>
            <p className="text-[var(--text-muted)] mt-2">Assign departments to admins and staff members</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Admin Assignments Section */}
          <div>
            <h2 className="text-2xl font-bold text-[var(--text)] mb-4">Admin Assignments</h2>
            <p className="text-[var(--text-muted)] mb-4">Assign multiple departments to admins</p>
            <div className="space-y-4">
              {admins.length === 0 ? (
                <div className="text-center py-12 bg-[var(--surface)] rounded-lg shadow">
                  <p className="text-[var(--text-muted)]">No admins found. Create admin accounts first.</p>
                </div>
              ) : (
                admins.map(admin => (
              <div key={admin.id} className="bg-[var(--surface)] rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">{admin.name}</h3>
                    <p className="text-sm text-[var(--text-muted)]">{admin.email}</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    Admin
                  </span>
                </div>

                {/* Assigned Departments */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-[var(--text)] mb-2">
                    Assigned Departments ({admin.adminDepartments?.length || 0})
                  </p>
                  {(admin.adminDepartments?.length || 0) === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No departments assigned</p>
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
                      name="admin-department"
                      className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm bg-[var(--surface)] text-[var(--text)]"
                      aria-label="Select department to assign to admin"
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
                      className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium text-sm flex items-center gap-2 transition"
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
          </div>

          {/* Staff Assignments Section */}
          <div>
            <h2 className="text-2xl font-bold text-[var(--text)] mb-4">Staff Assignments</h2>
            <p className="text-[var(--text-muted)] mb-4">Assign multiple departments to staff members</p>
            <div className="space-y-4">
              {staff.length === 0 ? (
                <div className="text-center py-12 bg-[var(--surface)] rounded-lg shadow">
                  <p className="text-[var(--text-muted)]">No staff found. Create staff accounts first.</p>
                </div>
              ) : (
                staff.map(s => (
              <div key={s.id} className="bg-[var(--surface)] rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text)]">{s.name}</h3>
                    <p className="text-sm text-[var(--text-muted)]">{s.email}</p>
                  </div>
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                    Staff
                  </span>
                </div>

                {/* Assigned Departments */}
                <div className="mb-4">
                  <p className="text-sm font-medium text-[var(--text)] mb-2">
                    Assigned Departments ({s.staffDepartments?.length || 0})
                  </p>
                  {(s.staffDepartments?.length || 0) === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No departments assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {s.staffDepartments?.map(sd => (
                        <div
                          key={sd.departmentId}
                          className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2"
                        >
                          <span className="text-sm font-medium text-purple-800">{sd.department.name}</span>
                          <button
                            onClick={() => unassignStaffDepartment(s.id, sd.departmentId)}
                            className="text-purple-600 hover:text-red-600 transition"
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
                {getAvailableStaffDepartments(s.id).length > 0 && (
                  <div className="flex gap-2">
                    <select
                      id={`staff-select-${s.id}`}
                      name="staff-department"
                      className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm bg-[var(--surface)] text-[var(--text)]"
                      aria-label="Select department to assign to staff"
                    >
                      <option value="">Select a department to assign...</option>
                      {getAvailableStaffDepartments(s.id).map(dept => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById(`staff-select-${s.id}`) as HTMLSelectElement;
                        if (select.value) {
                          assignStaffDepartment(s.id, select.value);
                          select.value = '';
                        }
                      }}
                      className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] font-medium text-sm flex items-center gap-2 transition"
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
          </div>
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
