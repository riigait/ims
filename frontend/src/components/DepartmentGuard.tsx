import { ReactNode } from 'react';
import { LogOut, Mail, HelpCircle, RefreshCw } from 'lucide-react';
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
    (user.role === 'admin' ? (!user.adminDepartments || user.adminDepartments.length === 0) : (!user.staffDepartments || user.staffDepartments.length === 0));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentDepartmentId');
    navigate('/login');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  if (isUnassigned) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
        {/* Navbar */}
        <nav className="bg-blue-600 text-white shadow-xl">
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
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-12 text-center">
                <div className="text-6xl mb-4">⚠️</div>
                <h2 className="text-3xl font-bold text-white">Department Assignment Required</h2>
              </div>

              {/* Content */}
              <div className="p-8 space-y-6">
                <p className="text-lg text-slate-700 text-center">
                  Your account has not been assigned to any department yet.
                </p>

                <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-3">What does this mean?</h3>
                  <p className="text-blue-800 text-sm leading-relaxed">
                    To access inventory data, manage products, and view floor plans, you need to be assigned to one or more departments by your superadmin. This ensures you can only see and modify data relevant to your departments.
                  </p>
                </div>

                <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                  <h3 className="font-semibold text-green-900 mb-3">What's next?</h3>
                  <p className="text-green-800 text-sm leading-relaxed">
                    Please contact your superadmin to request assignment to your department(s). Once assigned, you'll have full access to the inventory management system.
                  </p>
                </div>

                {/* User Info Card */}
                <div className="bg-slate-100 rounded-lg p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Your Account Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Name:</span>
                      <span className="font-medium text-slate-900">{user.name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Role:</span>
                      <span className="font-medium text-slate-900 bg-blue-100 px-3 py-1 rounded-full text-sm">
                        {user.role?.charAt(0).toUpperCase() + user.role?.slice(1) || 'Unknown'}
                      </span>
                    </div>
                    {user.email && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Email:</span>
                        <span className="font-medium text-slate-900">{user.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contact Support Section */}
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Mail size={18} /> Contact Support
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a
                      href="mailto:noc.voxptech@gmail.com"
                      className="flex items-center gap-3 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
                    >
                      <Mail size={20} className="text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Email Support</p>
                        <p className="text-xs text-slate-600">noc.voxptech@gmail.com</p>
                      </div>
                    </a>
                    <button
                      onClick={handleRefresh}
                      className="flex items-center gap-3 p-4 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition"
                    >
                      <RefreshCw size={20} className="text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Refresh Status</p>
                        <p className="text-xs text-slate-600">Check if assigned</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* FAQ Section */}
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <HelpCircle size={18} /> Frequently Asked Questions
                  </h3>
                  <div className="space-y-3">
                    <details className="bg-slate-50 rounded-lg p-4 cursor-pointer hover:bg-slate-100 transition">
                      <summary className="font-medium text-slate-900">How do I get assigned to a department?</summary>
                      <p className="text-slate-700 text-sm mt-3">
                        Contact your superadmin or department manager. They can assign you through the Role Assignments section in the admin panel. Once assigned, refresh this page to access the system.
                      </p>
                    </details>
                    <details className="bg-slate-50 rounded-lg p-4 cursor-pointer hover:bg-slate-100 transition">
                      <summary className="font-medium text-slate-900">I was just assigned, but still see this message</summary>
                      <p className="text-slate-700 text-sm mt-3">
                        Try refreshing the page or logging out and back in. Your assignment should take effect immediately after refresh.
                      </p>
                    </details>
                    <details className="bg-slate-50 rounded-lg p-4 cursor-pointer hover:bg-slate-100 transition">
                      <summary className="font-medium text-slate-900">Can I be assigned to multiple departments?</summary>
                      <p className="text-slate-700 text-sm mt-3">
                        Yes! Admins and staff members can be assigned to multiple departments. You'll be able to switch between them using the department switcher in the navigation menu.
                      </p>
                    </details>
                    <details className="bg-slate-50 rounded-lg p-4 cursor-pointer hover:bg-slate-100 transition">
                      <summary className="font-medium text-slate-900">Who can request department assignment?</summary>
                      <p className="text-slate-700 text-sm mt-3">
                        Only superadmins can assign users to departments. If you need assignment, reach out to your organization's superadmin or IT support team.
                      </p>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
