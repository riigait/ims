import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/services/api';
import { validateEmail, validatePassword } from '@/utils/validation';
import { useTheme } from '@/contexts/ThemeContext';

export default function Login() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');

  useEffect(() => {
    // On login page load, ensure superadmin exists
    const ensureSuperadmin = async () => {
      try {
        const response = await authApi.ensureSuperadmin();
        if (!response.data.exists && response.data.created) {
          setSetupMessage('Default superadmin created. Please login with admin@ims.local / changeme123');
        }
      } catch (err) {
        // Silently fail - it's optional
      }
    };

    ensureSuperadmin();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(formData.email)) {
      setError('Invalid email format');
      return;
    }

    if (!validatePassword(formData.password)) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.login(formData.email, formData.password);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-[var(--surface)] rounded-lg shadow-lg p-8 border border-[var(--border)]">
        <div className="flex justify-center mb-6">
          <img src={theme === 'dark' ? '/icons/logo-img-white.svg' : '/icons/logo-img.svg'} alt="IMS" className="h-16 w-16" />
        </div>
        <h1 className="text-3xl font-bold text-center text-[var(--text)] mb-8">
          Inventory Management System
        </h1>

        {error && (
          <div className="bg-red-100 dark:bg-red-950 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {setupMessage && (
          <div className="bg-blue-100 dark:bg-blue-950 border border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-200 px-4 py-3 rounded mb-4">
            {setupMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text)] mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text)] mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--primary)] text-white py-2 rounded-lg font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Don't have an account?{' '}
            <button
              onClick={() => navigate('/register')}
              className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium"
            >
              Register with invite code
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
