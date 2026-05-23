import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogOut, ScanLine, Users, ChevronDown, Lock } from 'lucide-react';
import DepartmentSwitcher from '../DepartmentSwitcher';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    setAdminOpen(false);
    setIsOpen(false);
    setUserOpen(false);
    setDeptOpen(false);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleDeptOpenChange = (open: boolean) => {
    setDeptOpen(open);
    if (open) {
      setAdminOpen(false);
      setUserOpen(false);
    }
  };

  const handleAdminOpenChange = (open: boolean) => {
    setAdminOpen(open);
    if (open) {
      setDeptOpen(false);
      setUserOpen(false);
    }
  };

  const handleUserOpenChange = (open: boolean) => {
    setUserOpen(open);
    if (open) {
      setDeptOpen(false);
      setAdminOpen(false);
    }
  };

  return (
    <nav className="text-white shadow-lg sticky top-0 z-50 relative" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="bg-blue-600 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="text-2xl font-bold flex-shrink-0">
            IMS
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1 flex-1 justify-center">
            {isLoggedIn && (
              <>

                <Link to="/products" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Products
                </Link>
                <Link to="/categories" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Categories
                </Link>
                <Link to="/locations" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Locations
                </Link>
                <Link to="/stock-movements" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Stock
                </Link>
                <Link to="/floor-plans" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Plans
                </Link>
                <Link to="/scanner" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-1">
                  <ScanLine size={16} />
                </Link>

                {(user.role === 'admin' || user.role === 'staff') && <DepartmentSwitcher isOpen={deptOpen} onOpenChange={handleDeptOpenChange} />}

                {(user.role === 'admin' || user.role === 'superadmin') && (
                  <div className="relative">
                    <button
                      onClick={() => handleAdminOpenChange(!adminOpen)}
                      className="h-16 px-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-1 bg-blue-700"
                    >
                      <Users size={14} />
                      Administration
                      <ChevronDown size={14} />
                    </button>
                    {adminOpen && (
                      <div className="absolute left-0 mt-0 min-w-full bg-white text-gray-800 rounded-lg shadow-lg py-0.5 z-10">
                        {user.role === 'superadmin' && (
                          <>
                            <Link to="/admin/assignment" onClick={() => setAdminOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm font-medium text-blue-600">
                              Role Assignment
                            </Link>
                            <div className="border-t border-gray-200"></div>
                          </>
                        )}
                        <Link to="/admin/users" onClick={() => setAdminOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm">
                          Users
                        </Link>
                        <Link to="/admin/departments" onClick={() => setAdminOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm">
                          Departments
                        </Link>
                        {user.role === 'admin' && (
                          <>
                            <div className="border-t border-gray-200"></div>
                            <Link to="/delete-requests" onClick={() => setAdminOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm">
                              Delete Requests
                            </Link>
                            <div className="border-t border-gray-200"></div>
                            <Link to="/password-requests" onClick={() => setAdminOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm">
                              Password Requests
                            </Link>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center flex-shrink-0">
            {isLoggedIn && (
              <>
                <div className="relative">
                  <button
                    onClick={() => handleUserOpenChange(!userOpen)}
                    className="h-16 px-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-1"
                  >
                    {user.name}
                    <ChevronDown size={14} />
                  </button>
                  {userOpen && (
                    <div className="absolute right-0 mt-0 min-w-full bg-white text-gray-800 rounded-lg shadow-lg py-0.5 z-10">
                      {['admin', 'superadmin', 'staff'].includes(user.role) && (
                        <>
                          <Link to="/change-password" onClick={() => setUserOpen(false)} className="block px-2 py-0.5 hover:bg-gray-100 text-sm flex items-center gap-2">
                            <Lock size={14} /> Change Password
                          </Link>
                          <div className="border-t border-gray-200"></div>
                        </>
                      )}
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-2 py-0.5 hover:bg-gray-100 text-sm flex items-center gap-2"
                      >
                        <LogOut size={14} /> Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t border-blue-500">
            {isLoggedIn && (
              <>
                <Link to="/products" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Products
                </Link>
                <Link to="/categories" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Categories
                </Link>
                <Link to="/locations" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Locations
                </Link>
                <Link to="/stock-movements" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Stock
                </Link>
                <Link to="/floor-plans" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Floor Plans
                </Link>
                <Link to="/scanner" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Scanner
                </Link>

                {(user.role === 'admin' || user.role === 'superadmin') && (
                  <>
                    <div className="border-t border-blue-500 pt-2 mt-2">
                      <p className="px-4 py-2 text-xs font-semibold text-blue-200">ADMINISTRATION</p>
                      {user.role === 'superadmin' && (
                        <Link to="/admin/assignment" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm font-medium">
                          Role Assignment
                        </Link>
                      )}
                      <Link to="/admin/users" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                        Users
                      </Link>
                      <Link to="/admin/departments" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                        Departments
                      </Link>
                      <Link to="/delete-requests" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                        Delete Requests
                      </Link>
                    </div>
                  </>
                )}

                <div className="border-t border-blue-500 pt-2 mt-2">
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 hover:bg-red-600 rounded text-sm"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
