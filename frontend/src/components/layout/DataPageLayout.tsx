import React from 'react';
import { Plus } from 'lucide-react';

interface DataPageLayoutProps {
  title: string;
  error: string;
  showForm: boolean;
  onAddClick: () => void;
  showAddButton: boolean;
  formContent: React.ReactNode;
  filterContent: React.ReactNode;
  children: React.ReactNode;
}

export default function DataPageLayout({
  title,
  error,
  showForm,
  onAddClick,
  showAddButton,
  formContent,
  filterContent,
  children,
}: DataPageLayoutProps) {
  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg border border-[var(--border)]" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-[var(--text)]">{title}</h1>
        {showAddButton && (
          <button
            onClick={onAddClick}
            className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]"
          >
            <Plus size={20} /> Add {title.slice(0, -1)}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-[var(--surface)] p-6 rounded-lg shadow-lg">
          {formContent}
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-lg shadow p-4 space-y-3">
        {filterContent}
        {children}
      </div>
    </div>
  );
}
