import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isLoggedIn = !!localStorage.getItem('token');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="text-2xl font-bold">
            IMS
          </Link>

          <div className="hidden md:flex space-x-8">
            {isLoggedIn && (
              <>
                <Link to="/dashboard" className="hover:text-blue-200">
                  Dashboard
                </Link>
                <Link to="/products" className="hover:text-blue-200">
                  Products
                </Link>
                <Link to="/categories" className="hover:text-blue-200">
                  Categories
                </Link>
                <Link to="/locations" className="hover:text-blue-200">
                  Locations
                </Link>
                <Link to="/stock-movements" className="hover:text-blue-200">
                  Stock
                </Link>
                <Link to="/floor-plans" className="hover:text-blue-200">
                  Floor Plans
                </Link>
              </>
            )}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {isLoggedIn && (
              <>
                <span className="text-sm">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 hover:text-blue-200"
                >
                  <LogOut size={20} />
                </button>
              </>
            )}
          </div>

          <button
            className="md:hidden"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            {isLoggedIn && (
              <>
                <Link to="/dashboard" className="block hover:text-blue-200 py-2">
                  Dashboard
                </Link>
                <Link to="/products" className="block hover:text-blue-200 py-2">
                  Products
                </Link>
                <Link to="/categories" className="block hover:text-blue-200 py-2">
                  Categories
                </Link>
                <Link to="/locations" className="block hover:text-blue-200 py-2">
                  Locations
                </Link>
                <Link to="/stock-movements" className="block hover:text-blue-200 py-2">
                  Stock
                </Link>
                <Link to="/floor-plans" className="block hover:text-blue-200 py-2">
                  Floor Plans
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left hover:text-blue-200 py-2"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
