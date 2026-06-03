import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, AlertTriangle, AlertCircle, Info, ChevronRight, CheckCheck, BellOff } from 'lucide-react';
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
  actionFilter?: string;
}

type ReadStore = Record<string, number>;
type SnoozeStore = Record<string, number>; // key → expiry timestamp

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

const SEVERITY_RING: Record<string, string> = {
  critical: 'ring-1 ring-red-400 dark:ring-red-600',
  high:     'ring-1 ring-orange-400 dark:ring-orange-600',
  medium:   'ring-1 ring-yellow-400 dark:ring-yellow-600',
  low:      'ring-1 ring-blue-400 dark:ring-blue-600',
  info:     'ring-1 ring-[var(--border)]',
};

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

function getUserId(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.id || 'anon';
  } catch { return 'anon'; }
}

function loadReadStore(): ReadStore {
  try {
    return JSON.parse(localStorage.getItem(`ims_notif_read_${getUserId()}`) || '{}');
  } catch { return {}; }
}

function saveReadStore(store: ReadStore) {
  localStorage.setItem(`ims_notif_read_${getUserId()}`, JSON.stringify(store));
}

function loadSnoozeStore(): SnoozeStore {
  try { return JSON.parse(localStorage.getItem(`ims_notif_snooze_${getUserId()}`) || '{}'); }
  catch { return {}; }
}

function saveSnoozeStore(store: SnoozeStore) {
  localStorage.setItem(`ims_notif_snooze_${getUserId()}`, JSON.stringify(store));
}

function isSnoozed(key: string, store: SnoozeStore): boolean {
  return key in store && store[key] > Date.now();
}

function isUnread(n: Notification, store: ReadStore): boolean {
  return !(n.key in store) || store[n.key] < n.count;
}

function sortNotifications(data: Notification[], store: ReadStore): Notification[] {
  return [...data].sort((a, b) => {
    const aU = isUnread(a, store) ? 1 : 0;
    const bU = isUnread(b, store) ? 1 : 0;
    if (aU !== bU) return bU - aU;
    return (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0);
  });
}

function SeverityIcon({ severity }: { severity: string }) {
  const cls = `w-4 h-4 flex-shrink-0 ${SEVERITY_COLOR[severity]}`;
  if (severity === 'critical' || severity === 'high') return <AlertCircle className={cls} />;
  if (severity === 'medium') return <AlertTriangle className={cls} />;
  return <Info className={cls} />;
}

export default function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readStore, setReadStoreState] = useState<ReadStore>(loadReadStore);
  const [snoozeStore, setSnoozeStoreState] = useState<SnoozeStore>(loadSnoozeStore);
  const [loading, setLoading] = useState(false);
  const [bellBounce, setBellBounce] = useState(false);
  const prevKeysRef = useRef<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/notifications');
      const data: Notification[] = res.data;
      const store = loadReadStore();

      // Detect if any new unread alert arrived since last fetch
      const hadPrev = prevKeysRef.current.size > 0;
      const hasNew = data.some(n => {
        const isNewKey = !prevKeysRef.current.has(n.key);
        const isCountUp = n.key in store && store[n.key] < n.count;
        return (isNewKey || isCountUp) && isUnread(n, store);
      });

      if (hadPrev && hasNew) {
        setBellBounce(true);
        setTimeout(() => setBellBounce(false), 1500);
      }

      prevKeysRef.current = new Set(data.map(n => n.key));
      setNotifications(sortNotifications(data, store));
    } catch { /* silent */ } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + 60s background refresh
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(true), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Extra 30s poll while dropdown is open (catch new arrivals)
  useEffect(() => {
    if (!open) return;
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(true), 30000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications]);

  // Outside click closes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleNotifications = notifications.filter(n => !isSnoozed(n.key, snoozeStore));
  const unreadCount = visibleNotifications.filter(n => isUnread(n, readStore)).length;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const hasCritical = visibleNotifications.some(n => isUnread(n, readStore) && n.severity === 'critical');
  const hasHigh = visibleNotifications.some(n => isUnread(n, readStore) && n.severity === 'high');
  const badgeColor = hasCritical ? 'bg-red-600' : hasHigh ? 'bg-orange-500' : 'bg-[var(--primary)]';

  const updateStore = (store: ReadStore) => {
    saveReadStore(store);
    setReadStoreState({ ...store });
    setNotifications(prev => sortNotifications(prev, store));
  };

  const markRead = (n: Notification) => {
    const store = loadReadStore();
    store[n.key] = n.count;
    updateStore(store);
  };

  const markAllRead = () => {
    const store = loadReadStore();
    for (const n of notifications) store[n.key] = n.count;
    updateStore(store);
  };

  const handleSnooze = (key: string) => {
    const store = loadSnoozeStore();
    store[key] = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    saveSnoozeStore(store);
    setSnoozeStoreState({ ...store });
  };

  const handleNavigate = (n: Notification) => {
    markRead(n);
    setOpen(false);
    navigate(n.actionPath, {
      state: {
        ...(n.actionTab ? { tab: n.actionTab } : {}),
        ...(n.actionFilter ? { notifFilter: n.actionFilter } : {}),
      },
    });
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
        <Bell size={16} className={bellBounce ? 'animate-bounce' : ''} />
        {unreadCount > 0 && (
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
              {unreadCount > 0 && (
                <span className={`text-xs font-bold text-white px-1.5 py-0.5 rounded-full ${badgeColor}`}>
                  {badgeLabel} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <CheckCheck size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </div>
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
                {visibleNotifications.map(n => {
                  const unread = isUnread(n, readStore);
                  return (
                    <div
                      key={n.key}
                      className={`w-full flex items-start gap-2 p-3 rounded-lg border transition-all ${SEVERITY_BG[n.severity]} ${
                        unread ? SEVERITY_RING[n.severity] : 'opacity-60'
                      }`}
                    >
                      <button
                        onClick={() => handleNavigate(n)}
                        className="flex-1 flex items-start gap-3 text-left min-w-0 hover:opacity-90"
                      >
                        {/* Icon + unread dot */}
                        <div className="relative flex-shrink-0 mt-0.5">
                          <SeverityIcon severity={n.severity} />
                          {unread && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--primary)] border border-[var(--surface)]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-xs truncate ${unread ? 'font-bold text-[var(--text)]' : 'font-medium text-[var(--text-muted)]'}`}>
                              {n.title}
                            </span>
                            {n.count > 1 && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20 ${SEVERITY_COLOR[n.severity]} flex-shrink-0`}>
                                {n.count}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{n.message}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => handleSnooze(n.key)}
                          title="Snooze 7 days"
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/20 transition-colors"
                        >
                          <BellOff size={11} />
                        </button>
                        <ChevronRight size={12} className="text-[var(--text-muted)]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {visibleNotifications.length > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-2 flex-shrink-0">
              <p className="text-xs text-[var(--text-muted)] text-center">
                {visibleNotifications.length} active alert{visibleNotifications.length > 1 ? 's' : ''} · refreshes every minute
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
