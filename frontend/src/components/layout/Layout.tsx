import { useState } from 'react';
import Sidebar from './Sidebar';
import AssistantPanel from '../AssistantPanel';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  };

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <AssistantPanel />
      <main className={`flex-1 min-w-0 flex flex-col ${collapsed ? 'ml-16' : 'ml-60'}`}>
        <div className="flex-1 p-6">{children}</div>
        <footer className="px-6 py-4 border-t border-[var(--border)] text-center text-xs text-[var(--text-muted)] space-y-1">
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
        </footer>
      </main>
    </div>
  );
}
