import { useState, useEffect, useRef } from 'react';
import { Bell, X, AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';

interface Notification {
  key: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  message: string;
  count: number;
  actionPath: string;
  actionTab?: string;
}

interface Summary {
  total: number;
  alerts: number;
  critical: number;
  high: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high:     'text-orange-600 dark:text-orange-400',
  medium:   'text-yellow-600 dark:text-yellow-400',
  low:      'text-blue-500 dark:text-blue-400',
  info:     'text-[var(--text-muted)]',
};

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
  high:     'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800',
  medium:   'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800',
  low:      'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  info:     'bg-[var(--surface-2)] border-[var(--border)]',
};

function SeverityIcon({ severity }: { severity: string }) {
  const cls = `w-4 h-4 flex-shrink-0 ${SEVERITY_COLOR[severity]}`;
  if (severity === 'critical' || severity === 'high') return <AlertCircle className={cls} />;
  if (severity === 'medium') return <AlertTriangle className={cls} />;
  return <Info className={cls} />;
}

export default function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchSummary = async () => {
    try {
      const res = await api.get('/notifications/summary');
      setSummary(res.data);
    } catch { /* silent */ }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const badgeCount = summary?.total ?? 0;
  const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);
  const hasCritical = (summary?.critical ?? 0) > 0;
  const hasHigh = (summary?.high ?? 0) > 0;
  const badgeColor = hasCritical
    ? 'bg-red-600'
    : hasHigh
    ? 'bg-orange-500'
    : 'bg-[var(--primary)]';

  const handleNavigate = (n: Notification) => {
    setOpen(false);
    if (n.actionTab) {
      navigate(n.actionPath, { state: { tab: n.actionTab } });
    } else {
      navigate(n.actionPath);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        className={`relative flex items-center justify-center rounded-lg transition-colors text-[var(--text-muted)] hover:bg-[var(--surface-2)] ${
          collapsed ? 'w-full p-2' : 'flex-1 px-3 py-2'
        } ${open ? 'bg-[var(--surface-2)]' : ''}`}
      >
        <Bell size={16} />
        {badgeCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full ${badgeColor}`}>
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed z-[200] bottom-20 left-16 w-80 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col max-h-[70vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-[var(--text-muted)]" />
              <span className="font-semibold text-sm text-[var(--text)]">Notifications</span>
              {badgeCount > 0 && (
                <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-full ${badgeColor}`}>
                  {badgeLabel}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center">
                <Bell size={24} className="mx-auto text-[var(--text-muted)] mb-2 opacity-40" />
                <p className="text-sm text-[var(--text-muted)]">No alerts right now</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {notifications.map(n => (
                  <button
                    key={n.key}
                    onClick={() => handleNavigate(n)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors hover:opacity-90 ${SEVERITY_BG[n.severity]}`}
                  >
                    <SeverityIcon severity={n.severity} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-[var(--text)] truncate">{n.title}</span>
                        {n.count > 1 && (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20 ${SEVERITY_COLOR[n.severity]} flex-shrink-0`}>
                            {n.count}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{n.message}</p>
                    </div>
                    <ChevronRight size={12} className="text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-2 flex-shrink-0">
              <p className="text-xs text-[var(--text-muted)] text-center">{notifications.length} active alert{notifications.length > 1 ? 's' : ''} · refreshes every minute</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
