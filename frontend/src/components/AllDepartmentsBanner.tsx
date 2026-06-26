import { Info } from 'lucide-react';

export default function AllDepartmentsBanner() {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100 text-sm">
      <Info size={16} className="flex-shrink-0" />
      <span>You&apos;re viewing All Departments (read-only). Switch to a specific department to make changes.</span>
    </div>
  );
}
