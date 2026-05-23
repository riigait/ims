import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, Mail } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-red-100 dark:bg-red-950 p-6 rounded-full">
            <AlertTriangle size={48} className="text-red-600 dark:text-red-400" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-[var(--text)] mb-2">404</h1>

        <h2 className="text-2xl font-semibold text-[var(--text)] mb-4">
          Something's Wrong
        </h2>

        <p className="text-lg text-[var(--text-muted)] mb-2">
          I Think We Need to See This To Admin
        </p>

        <p className="text-[var(--text-muted)] mb-8">
          There's Nothing in Here
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center gap-2 bg-[var(--primary)] text-white px-6 py-3 rounded-lg hover:bg-[var(--primary-hover)] font-medium transition"
          >
            <Home size={20} />
            Go to Dashboard
          </button>

          <button
            onClick={() => navigate(-1)}
            className="w-full px-6 py-3 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)] font-medium transition"
          >
            Go Back
          </button>

          {user.role === 'admin' && (
            <a
              href={`mailto:${(import.meta as any).env.VITE_SUPPORT_EMAIL || 'support@example.com'}`}
              className="w-full flex items-center justify-center gap-2 bg-[var(--surface-2)] text-[var(--text)] px-6 py-3 rounded-lg hover:bg-[var(--border)] font-medium transition"
            >
              <Mail size={20} />
              Report to Admin
            </a>
          )}
        </div>

        <div className="mt-8 p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)]">
            Error Code: 404<br />
            Page not found or access denied
          </p>
        </div>
      </div>
    </div>
  );
}
