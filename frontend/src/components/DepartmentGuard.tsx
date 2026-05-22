import { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DepartmentGuardProps {
  children: ReactNode;
}

export default function DepartmentGuard({ children }: DepartmentGuardProps) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Check if user is unassigned
  const isUnassigned = (user.role === 'admin' || user.role === 'staff') &&
    !user.departmentId &&
    (!user.adminDepartments || user.adminDepartments.length === 0);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentDepartmentId');
    navigate('/login');
  };

  if (isUnassigned) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Navbar */}
        <nav className="bg-blue-600 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <h1 className="text-2xl font-bold">IMS</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">{user.name || 'User'}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-sm font-medium"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </div>
        </nav>

        {/* Unassigned Message */}
        <div className="flex-1 p-6">
          <div className="max-w-2xl mx-auto mt-12">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-8 rounded-lg shadow">
              <h2 className="text-2xl font-bold text-yellow-800 mb-4">
                ⚠️ Unassigned to Department
              </h2>
              <p className="text-yellow-700 text-lg mb-6">
                Your account is not yet assigned to a department.
              </p>
              <p className="text-yellow-700">
                Please contact your superadmin to assign you to a department to access inventory data.
              </p>
              <div className="mt-8 p-4 bg-yellow-100 rounded border border-yellow-300">
                <p className="text-sm text-yellow-800">
                  <strong>Your Role:</strong> {user.role?.toUpperCase() || 'Unknown'}
                </p>
                <p className="text-sm text-yellow-800 mt-2">
                  <strong>Your Name:</strong> {user.name || 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
