import { useEffect, useState } from 'react';
import { AlertTriangle, Database, ShieldAlert, Skull, XCircle } from 'lucide-react';
import { settingsApi } from '@/services/api';

type DeleteState = 'idle' | 'armed' | 'countdown' | 'deleting' | 'done' | 'error';

export default function SuperadminSettings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (deleteState !== 'countdown') return;

    if (countdown <= 0) {
      runDelete();
      return;
    }

    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [deleteState, countdown]);

  const beginCountdown = () => {
    if (confirmPhrase !== 'DELETE IMS DATA') {
      setMessage('Type DELETE IMS DATA exactly before the countdown can begin.');
      setDeleteState('error');
      return;
    }

    setMessage('');
    setCountdown(5);
    setDeleteState('countdown');
  };

  const runDelete = async () => {
    try {
      setDeleteState('deleting');
      const response = await settingsApi.deleteOperationalData(confirmPhrase);
      setMessage(response.data.message || 'Operational data deleted.');
      setDeleteState('done');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Delete failed. No confirmation was received.');
      setDeleteState('error');
    }
  };

  if (user.role !== 'superadmin') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-red-700">
        Superadmin access required.
      </div>
    );
  }

  const suspenseActive = deleteState === 'countdown' || deleteState === 'deleting';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-[var(--text)]">Settings</h1>
        <p className="text-[var(--text-muted)] mt-1">Superadmin controls for appearance, session, and dangerous database actions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <ShieldAlert size={20} />
            <h2 className="font-semibold">Superadmin Only</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">This page is hidden from admins and staff.</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <Database size={20} />
            <h2 className="font-semibold">Preserved Tables</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">Users, departments, admin assignments, and staff assignments remain.</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
          <div className="flex items-center gap-3 text-[var(--text)]">
            <AlertTriangle size={20} />
            <h2 className="font-semibold">Deleted Tables</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">Products, categories, locations, stock, movements, floorplans, requests, invites, and logs.</p>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-lg border border-red-500/40 bg-red-950 text-red-50 shadow-2xl">
        <div className={`absolute inset-0 bg-red-700/20 transition-opacity duration-700 ${suspenseActive ? 'opacity-100 animate-pulse' : 'opacity-30'}`} />
        <div className="relative p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="mt-1 rounded-full bg-red-500/20 p-3 text-red-200">
              <Skull size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-wide">Danger Zone</h2>
              <p className="mt-2 max-w-3xl text-sm text-red-100">
                This is the point of no return. It will erase operational IMS data from the database. The app will keep only users, departments, and department assignments.
              </p>
            </div>
          </div>

          {deleteState === 'idle' && (
            <button
              type="button"
              onClick={() => setDeleteState('armed')}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-red-500"
            >
              <AlertTriangle size={18} /> Open Destructive Control
            </button>
          )}

          {deleteState === 'armed' && (
            <div className="space-y-4 rounded-lg border border-red-300/30 bg-black/25 p-5">
              <div>
                <p className="text-sm font-semibold text-red-100">Final warning</p>
                <p className="mt-1 text-sm text-red-200">Type <span className="font-mono font-bold text-white">DELETE IMS DATA</span> to unlock the 5 second countdown.</p>
              </div>
              <input
                value={confirmPhrase}
                onChange={e => setConfirmPhrase(e.target.value)}
                className="w-full rounded-lg border border-red-300/40 bg-black/40 px-4 py-3 font-mono text-red-50 outline-none focus:border-red-200"
                placeholder="DELETE IMS DATA"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setDeleteState('idle'); setConfirmPhrase(''); setMessage(''); }}
                  className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-red-50 hover:bg-white/20"
                >
                  Step Away
                </button>
                <button
                  type="button"
                  onClick={beginCountdown}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                >
                  Delete It Now
                </button>
              </div>
            </div>
          )}

          {deleteState === 'countdown' && (
            <div className="rounded-lg border border-red-300/30 bg-black/40 p-8 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-red-200">Deletion begins in</p>
              <div className="my-4 text-8xl font-black tabular-nums text-white drop-shadow-lg">{countdown}</div>
              <p className="text-sm text-red-100">Close or navigate away now if this is a mistake.</p>
            </div>
          )}

          {deleteState === 'deleting' && (
            <div className="rounded-lg border border-red-300/30 bg-black/40 p-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-red-200 border-t-transparent animate-spin" />
              <p className="font-semibold text-white">Deleting operational data...</p>
              <p className="mt-1 text-sm text-red-200">Users and departments are being preserved.</p>
            </div>
          )}

          {(deleteState === 'done' || deleteState === 'error') && (
            <div className={`rounded-lg border p-4 ${deleteState === 'done' ? 'border-green-300/40 bg-green-500/10 text-green-100' : 'border-red-300/40 bg-black/30 text-red-100'}`}>
              <div className="flex items-center gap-2">
                {deleteState === 'error' && <XCircle size={18} />}
                <p className="font-semibold">{message}</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
