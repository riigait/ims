import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Building2, ChevronDown } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

interface AdminDepartment {
  departmentId: string;
  department: Department;
}

const ALL_DEPARTMENTS_ID = 'all-departments';

interface DepartmentSwitcherProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export default function DepartmentSwitcher({ isOpen, onOpenChange }: DepartmentSwitcherProps) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const location = useLocation();
  const [departments, setDepartments] = useState<AdminDepartment[]>(user.adminDepartments || []);
  const [currentDeptId, setCurrentDeptId] = useState<string>(
    localStorage.getItem('currentDepartmentId') || ALL_DEPARTMENTS_ID
  );

  useEffect(() => {
    if (user.role === 'admin' && user.adminDepartments && user.adminDepartments.length > 0) {
      setDepartments(user.adminDepartments);
      // Only set default department if not already set
      const saved = localStorage.getItem('currentDepartmentId');
      if (!saved) {
        setCurrentDeptId(ALL_DEPARTMENTS_ID);
        localStorage.setItem('currentDepartmentId', ALL_DEPARTMENTS_ID);
      }
    }
  }, []);

  useEffect(() => {
    onOpenChange(false);
  }, [location]);

  const handleSwitchDepartment = (deptId: string) => {
    setCurrentDeptId(deptId);
    localStorage.setItem('currentDepartmentId', deptId);
    onOpenChange(false);
    window.location.reload();
  };

  if (user.role !== 'admin' || departments.length <= 1) {
    return null;
  }

  const currentDeptName = currentDeptId === ALL_DEPARTMENTS_ID ? 'All Departments' : departments.find(d => d.departmentId === currentDeptId)?.department.name;

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!isOpen)}
        className="h-16 px-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-1 bg-blue-700"
      >
        <Building2 size={14} />
        <span className="truncate max-w-xs">{currentDeptName || 'Select Department'}</span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-0 min-w-full bg-white text-gray-800 rounded-lg shadow-lg py-0.5 z-10">
          <button
            onClick={() => handleSwitchDepartment(ALL_DEPARTMENTS_ID)}
            className={`block w-full text-left px-2 py-0.5 text-sm hover:bg-gray-100 ${
              currentDeptId === ALL_DEPARTMENTS_ID ? 'bg-blue-50 text-blue-600 font-medium' : ''
            }`}
          >
            All Departments
          </button>
          <div className="border-t border-gray-200"></div>
          {departments.map(ad => (
            <button
              key={ad.departmentId}
              onClick={() => handleSwitchDepartment(ad.departmentId)}
              className={`block w-full text-left px-2 py-0.5 text-sm hover:bg-gray-100 ${
                ad.departmentId === currentDeptId ? 'bg-blue-50 text-blue-600 font-medium' : ''
              }`}
            >
              {ad.department.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
