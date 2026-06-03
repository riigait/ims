import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { invitesApi } from '@/services/api';

export default function Register() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [step, setStep] = useState<'code' | 'signup'>('code');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'staff'>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });

  const validateCode = async () => {
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await invitesApi.validate(inviteCode);
      setInviteRole(res.data.role);
      setStep('signup');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired invite code');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await invitesApi.redeem(inviteCode, formData.name, formData.email, formData.password);
      navigate('/login', { state: { message: 'Account created successfully! Please log in.' } });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register. Code may be invalid or already used.');
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
        <h1 className="text-3xl font-bold text-center text-[var(--text)] mb-2">
          Inventory Management
        </h1>
        <p className="text-center text-[var(--text-muted)] mb-8">Create your account</p>

        {error && (
          <div className="bg-red-100 dark:bg-red-950 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4 flex gap-3">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {step === 'code' ? (
          <div className="space-y-6">
            <div>
              <label htmlFor="invite-code" className="block text-sm font-medium text-[var(--text)] mb-2">
                Invite Code
              </label>
              <input
                id="invite-code"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter your invite code"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                disabled={loading}
              />
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              Ask your administrator for an invite code to register
            </p>

            <button
              onClick={validateCode}
              disabled={loading || !inviteCode.trim()}
              className="w-full bg-[var(--primary)] text-white py-2 rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-medium transition"
            >
              {loading ? 'Validating...' : 'Continue'}
            </button>

            <div className="text-center">
              <p className="text-sm text-[var(--text-muted)]">
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium"
                >
                  Login
                </button>
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="bg-blue-100 dark:bg-blue-950 border border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-200 px-4 py-3 rounded flex gap-3">
              <CheckCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">Code Verified</p>
                <p className="text-xs">Role: {inviteRole}</p>
              </div>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[var(--text)] mb-2">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your full name"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--text)] mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@email.com"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text)] mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="password-confirm" className="block text-sm font-medium text-[var(--text)] mb-2">
                Confirm Password
              </label>
              <input
                id="password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={formData.passwordConfirm}
                onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                placeholder="Confirm your password"
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--primary)] text-white py-2 rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-medium transition"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>

            <div className="text-center">
              <p className="text-sm text-[var(--text-muted)]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium"
                >
                  Login
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
