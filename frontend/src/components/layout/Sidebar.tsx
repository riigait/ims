import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Tag, MapPin, ArrowLeftRight, Map, Building2, Users, UserCheck, Sun, Moon, LogOut, ChevronDown, Upload, Boxes, ChevronLeft, ChevronRight, Settings, ClipboardList, KeyRound } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import ConfirmDialog from '../ConfirmDialog';
import NotificationBell from '../NotificationBell';
import { authApi } from '@/services/api';

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [currentDeptId, setCurrentDeptId] = useState(localStorage.getItem('currentDepartmentId') || ALL_DEPARTMENTS_ID);

  const [deptChangeConfirm, setDeptChangeConfirm] = useState<string | null>(null);

  const isActive = (path: string) => location.pathname === path;

  const handleDepartmentChange = (deptId: string) => {
    setDeptChangeConfirm(deptId);
  };

  const confirmDepartmentChange = () => {
    if (deptChangeConfirm) {
      localStorage.setItem('currentDepartmentId', deptChangeConfirm);
      setCurrentDeptId(deptChangeConfirm);
      setDeptDropdownOpen(false);
      setDeptChangeConfirm(null);
      window.location.reload();
    }
  };

  const handleLogout = () => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('currentDepartmentId');
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',       roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/categories',      icon: Tag,             label: 'Categories',      roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/locations',       icon: MapPin,          label: 'Locations',       roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/products',        icon: Package,         label: 'Products',        roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/inventory-items', icon: Boxes,           label: 'Inventory Items', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/stock-movements', icon: ArrowLeftRight,  label: 'Stock Movements', roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/floor-plans',     icon: Map,             label: 'Floor Plans',     roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/building-view',   icon: Building2,       label: '2D Building',     roles: ['superadmin', 'admin', 'staff'], section: 'main' },
    { path: '/import-pclsf',    icon: Upload,          label: 'Import / Export',    roles: ['admin', 'staff'], section: 'main' },
    { path: '/admin/requests',    icon: ClipboardList, label: 'Requests',         roles: ['superadmin', 'admin', 'staff'], section: 'admin' },
    { path: '/admin/departments', icon: Building2, label: 'Departments', roles: ['superadmin', 'admin'], section: 'admin' },
    { path: '/admin/users', icon: Users, label: 'Users', roles: ['superadmin', 'admin'], section: 'admin' },
    { path: '/admin/assignment', icon: UserCheck, label: 'Role Assignments', roles: ['superadmin'], section: 'admin' },
    { path: '/admin/settings', icon: Settings, label: 'Settings', roles: ['superadmin'], section: 'admin' },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role));
  const mainItems = filteredNavItems.filter(item => item.section === 'main');
  const adminItems = filteredNavItems.filter(item => item.section === 'admin');

  return (
    <>
      {deptChangeConfirm && (
        <ConfirmDialog
          title="Change Department"
          message="Any unsaved changes will be lost. Continue?"
          confirmText="Change"
          cancelText="Cancel"
          onConfirm={confirmDepartmentChange}
          onCancel={() => setDeptChangeConfirm(null)}
        />
      )}
      <aside className={`fixed left-0 top-0 bottom-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col overflow-hidden ${collapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo */}
      <div className="border-b border-[var(--border)] flex items-center justify-center px-3 py-3">
        <button
          onClick={() => navigate('/dashboard')}
          className={`flex items-center gap-3 hover:bg-[var(--surface-2)] rounded-lg p-1 transition min-w-0 ${collapsed ? 'justify-center' : ''}`}
        >
          <img src={theme === 'dark' ? '/icons/logo-img-white.svg' : '/icons/logo-img.svg'} alt="IMS" className="h-10 w-10 flex-shrink-0" />
          {!collapsed && (
            <div className="text-left min-w-0">
              <h1 className="text-base font-bold text-[var(--text)] tracking-tight">IMS</h1>
              <p className="text-xs text-[var(--text-muted)]">Inventory</p>
            </div>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-4 space-y-1 ${collapsed ? 'px-2' : 'px-4'}`}>
        {/* Main Items */}
        {mainItems.map(item => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center rounded-lg transition-colors text-sm font-medium ${
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2'
              } ${
                active
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <Icon size={18} />
              {!collapsed && item.label}
            </button>
          );
        })}

        {/* Administration Section */}
        {adminItems.length > 0 && (
          <>
            <div className="my-2 border-t border-[var(--border)]" />
            {!collapsed && (
              <div className="px-4 py-2 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Administration
              </div>
            )}
            {adminItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded-lg transition-colors text-sm font-medium ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-4 py-2'
                  } ${
                    active
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon size={18} />
                  {!collapsed && item.label}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Department Switcher (for admin/staff) */}
      {(user.role === 'admin' || user.role === 'staff') && (
        <div className={`border-t border-[var(--border)] ${collapsed ? 'p-2' : 'p-4'}`}>
          {collapsed ? (
            (() => {
              const userDepts = user.role === 'admin' ? user.adminDepartments : user.staffDepartments;
              const hasDepts = userDepts && userDepts.length > 0;
              return (
                <button
                  onClick={() => hasDepts && setDeptDropdownOpen(!deptDropdownOpen)}
                  title={hasDepts ? (currentDeptId === ALL_DEPARTMENTS_ID ? 'All Departments' : userDepts?.find((d: any) => d.departmentId === currentDeptId)?.department.name || 'Department') : 'Department'}
                  className="w-full flex items-center justify-center p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Building2 size={18} />
                </button>
              );
            })()
          ) : (
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
          )}
        </div>
      )}

      {/* User Section */}
      <div className={`border-t border-[var(--border)] ${collapsed ? 'p-2' : 'p-4'}`}>
        {collapsed ? (
          /* Collapsed: avatar + theme + logout + expand */
          <div className="flex flex-col items-center gap-1">
            {/* User avatar */}
            <div
              title={`${user.name || user.email} · ${user.role}`}
              className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-default"
            >
              {(user.name || user.email || '?').trim().split(/\s+/).length >= 2
                ? (user.name.split(/\s+/)[0][0] + user.name.split(/\s+/)[1][0]).toUpperCase()
                : (user.name || user.email || '?').slice(0, 2).toUpperCase()}
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="w-full flex items-center justify-center p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <NotificationBell collapsed={true} />
            <button
              onClick={() => navigate('/change-password')}
              title="Change Password"
              className={`w-full flex items-center justify-center p-2 rounded-lg transition-colors ${
                isActive('/change-password')
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <KeyRound size={16} />
            </button>
            <button
              onClick={handleLogout}
              title="Logout"
              className="w-full flex items-center justify-center p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <LogOut size={16} />
            </button>
            <button
              onClick={onToggle}
              title="Expand sidebar"
              className="w-full flex items-center justify-center p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* User Info row: info on left, collapse toggle on right */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 bg-[var(--surface-2)] rounded-lg">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase">User</p>
                <p className="text-sm font-medium text-[var(--text)] mt-1 truncate">{user.name || user.email}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 capitalize">{user.role}</p>
              </div>
              <button
                onClick={onToggle}
                title="Collapse sidebar"
                className="flex-shrink-0 p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Theme Toggle + Bell + Change Password + Settings + Logout */}
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors"
                title="Toggle theme"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <NotificationBell collapsed={false} />
              <button
                onClick={() => navigate('/change-password')}
                aria-label="Change Password"
                className={`flex-1 flex items-center justify-center px-3 py-2 rounded-lg transition-colors ${
                  isActive('/change-password')
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                }`}
                title="Change Password"
              >
                <KeyRound size={16} />
              </button>
              <button
                onClick={handleLogout}
                aria-label="Logout"
                className="flex-1 flex items-center justify-center px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
