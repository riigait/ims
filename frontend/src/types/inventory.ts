// Inventory Types
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  locationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  type: 'branch' | 'building' | 'floor' | 'room' | 'rack' | 'shelf';
  parentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  movementType: 'stock_in' | 'stock_out';
  quantity: number;
  reason: string;
  locationId?: string;
  userId: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
