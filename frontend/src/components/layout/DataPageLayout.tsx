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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {showAddButton && (
          <button
            onClick={onAddClick}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} /> Add {title.slice(0, -1)}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          {formContent}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        {filterContent}
        {children}
      </div>
    </div>
  );
}
