import { useState, useEffect } from 'react';
import { Building2, ChevronDown } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

interface AdminDepartment {
  departmentId: string;
  department: Department;
}

export default function DepartmentSwitcher() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [currentDeptId, setCurrentDeptId] = useState(localStorage.getItem('currentDepartmentId') || '');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (user.role === 'admin' && user.adminDepartments) {
      setDepartments(user.adminDepartments);
      if (user.adminDepartments.length > 0 && !currentDeptId) {
        setCurrentDeptId(user.adminDepartments[0].departmentId);
        localStorage.setItem('currentDepartmentId', user.adminDepartments[0].departmentId);
      }
    }
  }, [user, currentDeptId]);

  const handleSwitchDepartment = (deptId: string) => {
    setCurrentDeptId(deptId);
    localStorage.setItem('currentDepartmentId', deptId);
    setIsOpen(false);
    window.location.reload();
  };

  if (user.role !== 'admin' || departments.length <= 1) {
    return null;
  }

  const currentDept = departments.find(d => d.departmentId === currentDeptId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 rounded hover:bg-blue-500 transition text-sm flex items-center gap-2 bg-blue-700"
      >
        <Building2 size={16} />
        <span className="truncate max-w-xs">{currentDept?.department.name || 'Select Department'}</span>
        <ChevronDown size={16} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-0 w-56 bg-white text-gray-800 rounded-lg shadow-lg py-2 z-10">
          {departments.map(ad => (
            <button
              key={ad.departmentId}
              onClick={() => handleSwitchDepartment(ad.departmentId)}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
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
