import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, ScanLine, Users, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isLoggedIn = !!localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="text-2xl font-bold flex-shrink-0">
            IMS
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1 flex-1 justify-center">
            {isLoggedIn && (
              <>
                <Link to="/dashboard" className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm">
                  Dashboard
                </Link>
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

                {user.role === 'admin' && (
                  <div className="relative">
                    <button
                      onClick={() => setAdminOpen(!adminOpen)}
                      className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-1 bg-blue-700"
                    >
                      <Users size={16} />
                      Admin
                      <ChevronDown size={16} />
                    </button>
                    {adminOpen && (
                      <div className="absolute right-0 mt-0 w-48 bg-white text-gray-800 rounded-lg shadow-lg py-2 z-10">
                        <Link to="/admin/users" className="block px-4 py-2 hover:bg-gray-100 text-sm">
                          Users
                        </Link>
                        <Link to="/admin/departments" className="block px-4 py-2 hover:bg-gray-100 text-sm">
                          Departments
                        </Link>
                        <Link to="/delete-requests" className="block px-4 py-2 hover:bg-gray-100 text-sm">
                          Delete Requests
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center space-x-4 flex-shrink-0">
            {isLoggedIn && (
              <>
                <span className="text-sm font-medium">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded hover:bg-blue-500 transition"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
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
                <Link to="/dashboard" className="block px-4 py-2 hover:bg-blue-500 rounded text-sm">
                  Dashboard
                </Link>
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

                {user.role === 'admin' && (
                  <>
                    <div className="border-t border-blue-500 pt-2 mt-2">
                      <p className="px-4 py-2 text-xs font-semibold text-blue-200">ADMIN</p>
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
