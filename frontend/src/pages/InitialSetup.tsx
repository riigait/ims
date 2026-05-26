import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useTheme } from '@/contexts/ThemeContext';

export default function InitialSetup() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = localStorage.getItem('user');
    const userObj = user ? JSON.parse(user) : null;

    // Redirect non-superadmin users to dashboard
    if (userObj?.role !== 'superadmin') {
      navigate('/dashboard');
    }
    // Redirect if setup already completed
    if (userObj?.initialSetupComplete === true) {
      navigate('/dashboard');
    }
  }, [navigate]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.email || !form.password || !form.confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!form.email.includes('@')) {
      setError('Invalid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.completeInitialSetup(
        form.email,
        form.password,
        form.name
      );
      const { token, user } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Setup failed');
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
        <h1 className="text-3xl font-bold text-center text-[var(--text)] mb-2">IMS Setup</h1>
        <p className="text-center text-[var(--text-muted)] mb-8">Complete your initial setup</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="setup-name" className="block text-sm font-medium text-[var(--text)] mb-2">
              Name
            </label>
            <input
              id="setup-name"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="setup-email" className="block text-sm font-medium text-[var(--text)] mb-2">
              Email
            </label>
            <input
              id="setup-email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="setup-password" className="block text-sm font-medium text-[var(--text)] mb-2">
              Password
            </label>
            <input
              id="setup-password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="New password (min 8 characters)"
            />
          </div>

          <div>
            <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-[var(--text)] mb-2">
              Confirm Password
            </label>
            <input
              id="setup-confirm-password"
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="Confirm password"
            />
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-950 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--primary)] text-white py-2 rounded-lg font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Complete Setup'}
          </button>

          <div className="text-center text-sm text-[var(--text-muted)] mt-4">
            <p>This account is the system superadmin.</p>
            <p>Keep your credentials secure.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
