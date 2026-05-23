import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Tag, MapPin, ArrowLeftRight, Map, Building2, Users, UserCheck, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [currentDeptId, setCurrentDeptId] = useState(localStorage.getItem('currentDepartmentId') || ALL_DEPARTMENTS_ID);

  const isActive = (path: string) => location.pathname === path;

  const handleDepartmentChange = (deptId: string) => {
    if (window.confirm('Are you sure? Any unsaved changes will be lost.')) {
      localStorage.setItem('currentDepartmentId', deptId);
      setCurrentDeptId(deptId);
      setDeptDropdownOpen(false);
      window.location.reload();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/products', icon: Package, label: 'Products', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/categories', icon: Tag, label: 'Categories', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/locations', icon: MapPin, label: 'Locations', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/stock-movements', icon: ArrowLeftRight, label: 'Stock Movements', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/floor-plans', icon: Map, label: 'Floor Plans', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/admin/departments', icon: Building2, label: 'Departments', roles: ['superadmin', 'admin'], section: 'admin' },
    { path: '/admin/users', icon: Users, label: 'Users', roles: ['superadmin', 'admin'], section: 'admin' },
    { path: '/admin/assignment', icon: UserCheck, label: 'Role Assignments', roles: ['superadmin'], section: 'admin' },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));
  const mainItems = filteredNavItems.filter(item => item.section === 'main');
  const adminItems = filteredNavItems.filter(item => item.section === 'admin');

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col transition-all duration-300">
      {/* Logo */}
      <button
        onClick={() => navigate('/dashboard')}
        className="w-full p-4 border-b border-[var(--border)] flex items-center gap-3 hover:bg-[var(--surface-2)] transition"
      >
        <img src={theme === 'dark' ? '/icons/logo-img-white.svg' : '/icons/logo-img.svg'} alt="IMS" className="h-12 w-12 flex-shrink-0" />
        <div className="text-left">
          <h1 className="text-lg font-bold text-[var(--text)] tracking-tight">IMS</h1>
          <p className="text-xs text-[var(--text-muted)]">Inventory</p>
        </div>
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Main Items */}
        {mainItems.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                active
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}

        {/* Administration Section */}
        {adminItems.length > 0 && (
          <>
            <div className="my-2 border-t border-[var(--border)]" />
            <div className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Administration
            </div>
            {adminItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    active
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Department Switcher (for admin/staff) */}
      {(user.role === 'admin' || user.role === 'staff') && (
        <div className="p-4 border-t border-[var(--border)]">
          <div className="relative">
            {(() => {
              const userDepts = user.role === 'admin' ? user.adminDepartments : user.staffDepartments;
              const hasDepts = userDepts && userDepts.length > 0;
              const currentDeptName = currentDeptId === ALL_DEPARTMENTS_ID
                ? 'All Departments'
                : userDepts?.find((d: any) => d.departmentId === currentDeptId)?.department.name || 'Select';

              return (
                <>
                  <button
                    onClick={() => setDeptDropdownOpen(!deptDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-sm hover:bg-[var(--border)] transition-colors"
                  >
                    <span className="font-medium text-xs truncate">{hasDepts ? currentDeptName : 'DEPARTMENT'}</span>
                    {hasDepts && <ChevronDown size={16} className={`transition-transform flex-shrink-0 ${deptDropdownOpen ? 'rotate-180' : ''}`} />}
                  </button>
                  {deptDropdownOpen && hasDepts && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => handleDepartmentChange(ALL_DEPARTMENTS_ID)}
                        className={`w-full text-left px-3 py-2 text-sm ${currentDeptId === ALL_DEPARTMENTS_ID ? 'bg-[var(--primary)] text-white' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                      >
                        All Departments
                      </button>
                      {userDepts && userDepts.length > 1 && <div className="border-t border-[var(--border)]" />}
                      {userDepts && userDepts.map((ad: any) => (
                        <button
                          key={ad.departmentId}
                          onClick={() => handleDepartmentChange(ad.departmentId)}
                          className={`w-full text-left px-3 py-2 text-sm ${ad.departmentId === currentDeptId ? 'bg-[var(--primary)] text-white' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                        >
                          {ad.department.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* User Section */}
      <div className="p-4 border-t border-[var(--border)] space-y-4">
        {/* User Info */}
        <div className="px-3 py-2 bg-[var(--surface-2)] rounded-lg">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase">User</p>
          <p className="text-sm font-medium text-[var(--text)] mt-1">{user.name || user.email}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 capitalize">{user.role}</p>
        </div>

        {/* Theme Toggle + Logout */}
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
