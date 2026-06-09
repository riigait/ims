import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '@/services/api';
import { validateEmail, validatePassword } from '@/utils/validation';
import { useTheme } from '@/contexts/ThemeContext';

type ServerStatus = 'checking' | 'online' | 'offline';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const successMessage = (location.state as any)?.message || '';

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;

    const checkServer = async () => {
      try {
        const response = await authApi.ensureSuperadmin();
        setServerStatus('online');
        if (!response.data.exists && response.data.created) {
          const email = response.data.email || 'admin@ims.local';
          const password = response.data.temporaryPassword;
          setSetupMessage(password
            ? `Temporary superadmin created. Please login with ${email} / ${password} and complete setup immediately.`
            : response.data.message || 'Temporary superadmin created. Complete setup immediately.');
        }
      } catch (err: any) {
        if (err?.isOffline) {
          setServerStatus('offline');
          // retry every 5 seconds until the backend comes up
          retryTimer = setTimeout(checkServer, 5000);
        } else {
          // Backend is up but returned an error (e.g. 500) — still online
          setServerStatus('online');
        }
      }
    };

    checkServer();
    return () => clearTimeout(retryTimer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];

    if (!formData.email.trim()) errs.push('Email is required');
    else if (!validateEmail(formData.email)) errs.push('Invalid email format');

    if (!formData.password) errs.push('Password is required');
    else if (!validatePassword(formData.password)) errs.push('Password must be at least 6 characters');

    if (errs.length > 0) { setErrors(errs); return; }

    setErrors([]);
    setLoading(true);
    try {
      const response = await authApi.login(formData.email, formData.password);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.isOffline) {
        setServerStatus('offline');
        setErrors(['Cannot connect to the server. Please start the backend and try again.']);
      } else {
        const msg = err?.response?.data?.error || err?.message || 'Invalid credentials';
        setErrors([msg]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center py-12 px-4 gap-6">
      <div className="max-w-md w-full bg-[var(--surface)] rounded-lg shadow-lg p-8 border border-[var(--border)]">
        <div className="flex justify-center mb-6">
          <img src={theme === 'dark' ? '/icons/logo-img-white.svg' : '/icons/logo-img.svg'} alt="IMS" className="h-16 w-16" />
        </div>
        <h1 className="text-3xl font-bold text-center text-[var(--text)] mb-8">
          Inventory Management System
        </h1>

        {/* Server status banner */}
        {serverStatus === 'checking' && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 px-4 py-3 rounded mb-4 flex items-center gap-2 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            Connecting to server…
          </div>
        )}
        {serverStatus === 'offline' && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4 text-sm">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              Backend server is offline
            </div>
            <p>Start the backend server then this page will reconnect automatically.</p>
            <code className="block mt-1 text-xs opacity-75">cd backend &amp;&amp; npm run dev</code>
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-red-100 dark:bg-red-950 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            {errors.length === 1 ? (
              <p className="text-sm">{errors[0]}</p>
            ) : (
              <ul className="text-sm list-disc list-inside space-y-1">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}

        {successMessage && (
          <div className="bg-green-100 dark:bg-green-950 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-200 px-4 py-3 rounded mb-4">
            <p className="text-sm">{successMessage}</p>
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
            disabled={loading || serverStatus !== 'online'}
            className="w-full bg-[var(--primary)] text-white py-2 rounded-lg font-semibold hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {loading ? 'Logging in…' : serverStatus === 'checking' ? 'Connecting…' : serverStatus === 'offline' ? 'Server Offline' : 'Login'}
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

      {/* Dev notice + open-source footer */}
      <div className="max-w-md w-full text-center text-xs text-[var(--text-muted)] space-y-2">
        <p>
          <span className="font-semibold text-[var(--text)]">This app is under active development.</span>{' '}
          You can use it — please report any bugs you find.
        </p>
        <p>
          Built for <span className="text-[var(--text)]">IT asset tracking, office equipment inventory, and multi-department stock management</span> in companies and government offices.
        </p>
        <p>
          Open source on{' '}
          <a
            href="https://github.com/riigait/ims"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] hover:underline font-medium"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
