import { useState } from 'react';
import Sidebar from './Sidebar';

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
      <main className={`flex-1 p-6 min-w-0 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        {children}
      </main>
    </div>
  );
}
