export type Unit =
  | 'pcs' | 'dozen' | 'box' | 'pack'
  | 'g' | 'kg' | 'mg' | 'oz' | 'lb' | 'ton'
  | 'ml' | 'liter' | 'gallon' | 'cup'
  | 'mm' | 'cm' | 'm' | 'km' | 'inch' | 'ft' | 'yard'
  | 'cm2' | 'm2'
  | 'roll' | 'sheet' | 'can' | 'bottle' | 'bag' | 'carton';

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  category?: Category;
  unit: Unit;
  currentStock: number;
  lowStockThreshold: number;
  locationId?: string;
  location?: Location;
  departmentId?: string;
  department?: Department;
  supplier?: string;
  unitPrice?: number;
  status?: string;
  expiryDate?: string;
  leadTimeDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  departmentId?: string;
  department?: { name: string };
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  type: 'branch' | 'building' | 'floor' | 'room' | 'rack' | 'shelf';
  parentId?: string;
  notes?: string;
  departmentId?: string;
  department?: { name: string };
  createdAt: string;
  updatedAt: string;
}

export type MovementType = 'stock_in' | 'stock_out' | 'adjustment' | 'transfer' | 'damaged' | 'returned' | 'opening_stock' | 'deployment' | 'repair' | 'disposal' | 'borrowed' | 'lost';

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  movementType: MovementType;
  quantity: number;
  reason?: string;
  locationId?: string;
  location?: Location;
  modelNumber?: string;
  serialNumber?: string;
  macId?: string;
  userId: string;
  user?: User;
  departmentId?: string;
  department?: Department;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
}

export interface AdminDepartment {
  departmentId: string;
  department: Department;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'superadmin';
  departmentId?: string;
  initialSetupComplete?: boolean;
  adminDepartments?: AdminDepartment[];
  staffDepartments?: AdminDepartment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
