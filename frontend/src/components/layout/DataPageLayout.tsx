import React from 'react';
import { Plus } from 'lucide-react';
import AllDepartmentsBanner from '@/components/AllDepartmentsBanner';

interface DataPageLayoutProps {
  title: string;
  error: string;
  showForm: boolean;
  onAddClick: () => void;
  showAddButton: boolean;
  formContent: React.ReactNode;
  filterContent: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  showAllDepartmentsBanner?: boolean;
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
  actions,
  showAllDepartmentsBanner,
}: DataPageLayoutProps) {
  return (
    <div className="space-y-6">
      {showAllDepartmentsBanner && <AllDepartmentsBanner />}

      {error && (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-[var(--text)]">{title}</h1>
        {actions ?? (showAddButton && (
          <button
            onClick={onAddClick}
            className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]"
          >
            <Plus size={20} /> Add {title.endsWith('ies') ? title.slice(0, -3) + 'y' : title.slice(0, -1)}
          </button>
        ))}
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
