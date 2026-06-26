import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { Product, Category, Location, Department, User } from '../types/inventory';
import type { FloorPlanObject } from '../types/floorplan';
import { upgradeLegacyRoomObjects } from '../utils/floorplanGrid';

const API_BASE_URL = '/api';

type QueryParams = Record<string, string | number | boolean | undefined>;

interface OfflineError extends Error { isOffline: boolean; }

// Omit relational/computed fields; widen unit (form strings vs Unit union) and locationId (null vs undefined)
type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'category' | 'location' | 'department' | 'unit' | 'locationId'> & { unit?: string; locationId?: string | null };
type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'department'>;
type LocationInput = Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'department'>;
type DepartmentInput = Omit<Department, 'id'>;
// Request payload for updating a movement header (create uses a freeform payload due to complex items shape)
type StockMovementUpdateInput = { status?: string; remarks?: string; movementType?: string };
type UserPatch = Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'adminDepartments' | 'staffDepartments'>>;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add department header to non-auth requests
api.interceptors.request.use((config) => {
  const currentDeptId = localStorage.getItem('currentDepartmentId');
  const isAuthEndpoint = String(config.url || '').startsWith('/auth/');
  if (!isAuthEndpoint && currentDeptId && !config.headers['X-Department-Id']) {
    config.headers['X-Department-Id'] = currentDeptId;
  }

  return config;
});

// Handle network errors and token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Backend is not running (ECONNREFUSED / ERR_NETWORK / no response)
    if (!error.response) {
      const networkError = Object.assign(
        new Error('Cannot connect to the server. Please make sure the backend is running and try again.'),
        { isOffline: true }
      ) as OfflineError;
      return Promise.reject(networkError);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      localStorage.removeItem('currentDepartmentId');
      globalThis.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/auth/me'),
  completeInitialSetup: (newEmail: string, newPassword: string, newName: string) =>
    api.post('/auth/complete-initial-setup', { newEmail, newPassword, newName }),
  ensureSuperadmin: () =>
    api.post('/auth/ensure-superadmin', {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  resetPassword: (userId: string, newPassword: string) =>
    api.post(`/auth/reset-password/${userId}`, { newPassword }),
  updateIsoViewSettings: (settings: { isoTW: number; isoTH: number; isoZScale: number }) =>
    api.patch('/auth/me/iso-view-settings', settings),
};

// Products
export const productsApi = {
  getAll: (params?: QueryParams) => api.get('/products', { params }),
  getAllForDepartment: (departmentId: string, params?: QueryParams) => api.get('/products', { headers: { 'X-Department-Id': departmentId }, params }),
  getById: (id: string) => api.get(`/products/${id}`),
  getMovements: (id: string) => api.get(`/products/${id}/movements`),
  create: (data: Partial<ProductInput>) => api.post('/products', data),
  bulkCreate: (data: Partial<ProductInput>[]) => api.post('/products/bulk', { products: data }),
  update: (id: string, data: Partial<ProductInput>) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
};

// Categories
export const categoriesApi = {
  getAll: (params?: QueryParams) => api.get('/categories', { params }),
  getById: (id: string) => api.get(`/categories/${id}`),
  create: (data: Partial<CategoryInput>) => api.post('/categories', data),
  update: (id: string, data: Partial<CategoryInput>) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Locations
export const locationsApi = {
  getAll: (params?: QueryParams) => api.get('/locations', { params }),
  getForDepartment: (departmentId: string) => api.get('/locations', { headers: { 'X-Department-Id': departmentId } }),
  getById: (id: string) => api.get(`/locations/${id}`),
  create: (data: Partial<LocationInput>) => api.post('/locations', data),
  update: (id: string, data: Partial<LocationInput>) => api.put(`/locations/${id}`, data),
  delete: (id: string) => api.delete(`/locations/${id}`),
};

// Stock Movements
export const stockMovementsApi = {
  getAll: (params?: QueryParams) => api.get('/stock-movements', { params }),
  getById: (id: string) => api.get(`/stock-movements/${id}`),
  create: (data: Record<string, unknown>) => api.post('/stock-movements', data),
  update: (id: string, data: StockMovementUpdateInput) => api.put(`/stock-movements/${id}`, data),
  delete: (id: string) => api.delete(`/stock-movements/${id}`),
};

// Stock Details
export const stockDetailsApi = {
  getAll: (params?: QueryParams) => api.get('/stock-details', { params }),
  getByProductId: (productId: string) => api.get(`/stock-details/product/${productId}`),
  getByStatus: (status: string) => api.get(`/stock-details/by-status/${status}`),
  getById: (id: string) => api.get(`/stock-details/${id}`),
  getMovements: (id: string) => api.get(`/stock-details/${id}/movements`),
  getDeployment: (id: string) => api.get(`/stock-details/${id}/deployment`),
  create: (data: Record<string, unknown>) => api.post('/stock-details', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/stock-details/${id}`, data),
  delete: (id: string) => api.delete(`/stock-details/${id}`),
  bulkVerify: (ids: string[]) => api.post('/stock-details/bulk-verify', { ids }),
};

// Floor Plans
// Auto-generated/legacy plans store rooms as rectangles; the floor-plan UI is
// polygon-based, so upgrade rooms in every floor-plan response shape (single
// plan, plan array, or { regenerated: plan[] }).
const withPolygonRooms = <T extends { objects?: unknown }>(plan: T): T =>
  plan && Array.isArray(plan.objects)
    ? { ...plan, objects: upgradeLegacyRoomObjects(plan.objects as FloorPlanObject[]) }
    : plan;

const normalizeFloorPlanResponse = (response: AxiosResponse) => {
  const data = response.data;
  if (Array.isArray(data)) {
    response.data = data.map(withPolygonRooms);
  } else if (data && typeof data === 'object') {
    response.data = withPolygonRooms(data);
    if (Array.isArray(data.regenerated)) {
      response.data = { ...response.data, regenerated: data.regenerated.map(withPolygonRooms) };
    }
  }
  return response;
};

export const floorPlansApi = {
  getAll: (summary = false) => api.get('/floor-plans', summary ? { params: { summary: 'true' } } : undefined).then(normalizeFloorPlanResponse),
  getByLocation: (locationId: string) => api.get(`/floor-plans/by-location/${locationId}`).then(normalizeFloorPlanResponse),
  getById: (id: string) => api.get(`/floor-plans/${id}`).then(normalizeFloorPlanResponse),
  autoGenerate: (data?: object) => api.post('/floor-plans/auto-generate', data).then(normalizeFloorPlanResponse),
  create: (data: object) => api.post('/floor-plans', data).then(normalizeFloorPlanResponse),
  update: (id: string, data: object) => api.put(`/floor-plans/${id}`, data).then(normalizeFloorPlanResponse),
  delete: (id: string) => api.delete(`/floor-plans/${id}`),
  feedback: (id: string, data: { feedback: string; rating?: number; correctedData?: string }) =>
    api.post(`/floor-plans/${id}/feedback`, data),
  regenerate: (id: string, data?: object, signal?: AbortSignal) => api.post(`/floor-plans/${id}/regenerate`, data ?? {}, { signal }).then(normalizeFloorPlanResponse),
  getRules: () => api.get('/floor-plans/rules'),
  getByBuilding: (buildingKey: string) => api.get(`/floor-plans/building/${encodeURIComponent(buildingKey)}`).then(normalizeFloorPlanResponse),
  validate: (objects: object[]) => api.post('/floor-plans/validate', { objects }),
  autoFix: (objects: object[]) => api.post('/floor-plans/auto-fix', { objects }),
  setPerimeter: (id: string, walls: object[], alignmentData?: object) =>
    api.patch(`/floor-plans/${id}/perimeter`, { walls, alignmentData }),
  exportJson: () => api.get('/floor-plans/export/json'),
  exportFinalizedJson: () => api.get('/floor-plans/export/finalized/json'),
  importJson: (backup: object, departmentId?: string) =>
    api.post('/floor-plans/import/json', { backup, departmentId }),
  importFinalizedJson: (backup: object, departmentId?: string) =>
    api.post('/floor-plans/import/finalized/json', { backup, departmentId }),
};

// Map Search
export const mapApi = {
  search: (query: string) => api.get('/map/search', { params: { q: query } }),
  reverse: (lat: number, lng: number) => api.get('/map/reverse', { params: { lat, lng } }),
  buildings: (south: number, west: number, north: number, east: number) =>
    api.get('/map/buildings', { params: { south, west, north, east } }),
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentMovements: () => api.get('/dashboard/recent-movements'),
  getRecentRequests: () => api.get('/dashboard/recent-requests'),
};

// Departments
export const departmentsApi = {
  getAll: () => api.get('/departments'),
  getById: (id: string) => api.get(`/departments/${id}`),
  create: (data: Partial<DepartmentInput>) => api.post('/departments', data),
  update: (id: string, data: Partial<DepartmentInput>) => api.patch(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

// Delete Requests
export const deleteRequestsApi = {
  getAll: (status?: string) => api.get('/delete-requests', { params: { status } }),
  create: (data: Record<string, unknown>) => api.post('/delete-requests', data),
  approve: (id: string) => api.patch(`/delete-requests/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/delete-requests/${id}/reject`, { reason }),
};

// Password Requests
export const passwordRequestsApi = {
  getAll: (params?: QueryParams) => api.get('/password-requests', { params }),
  create: (reason?: string) => api.post('/password-requests', { reason }),
  approve: (id: string, temporaryPassword: string) =>
    api.patch(`/password-requests/${id}/approve`, { temporaryPassword }),
  reject: (id: string) =>
    api.patch(`/password-requests/${id}/reject`),
};

// Edit Requests
export const editRequestsApi = {
  getAll: (status?: string) => api.get('/edit-requests', { params: { status } }),
  create: (productId: string, proposedChanges: Record<string, unknown>, reason?: string) =>
    api.post('/edit-requests', { productId, proposedChanges, reason }),
  approve: (id: string) => api.patch(`/edit-requests/${id}/approve`),
  reject: (id: string, rejectionReason?: string) =>
    api.patch(`/edit-requests/${id}/reject`, { rejectionReason }),
};

// Export Requests
export const exportRequestsApi = {
  getAll: (params?: QueryParams) => api.get('/export-requests', { params }),
  create: (type: string, label: string, csvData: string) =>
    api.post('/export-requests', { type, label, csvData }),
  approve: (id: string) => api.patch(`/export-requests/${id}/approve`),
  reject: (id: string, rejectionReason?: string) =>
    api.patch(`/export-requests/${id}/reject`, { rejectionReason }),
  downloadUrl: (id: string) => `/api/export-requests/${id}/download`,
  download: (id: string) => api.get(`/export-requests/${id}/download`, { responseType: 'blob' }),
};

// Verify Requests
export const verifyRequestsApi = {
  getAll: (status?: string) => api.get('/verify-requests', { params: { status } }),
  create: (stockDetailIds: string[], reason?: string) =>
    api.post('/verify-requests', { stockDetailIds, reason }),
  approve: (id: string) => api.patch(`/verify-requests/${id}/approve`),
  reject: (id: string, rejectionReason?: string) =>
    api.patch(`/verify-requests/${id}/reject`, { rejectionReason }),
};

// Import Requests
export const importRequestsApi = {
  getAll: (params?: QueryParams) => api.get('/import-requests', { params }),
  approve: (id: string) => api.patch(`/import-requests/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/import-requests/${id}/reject`, { reason }),
};

// Users
export const usersApi = {
  getAll: (params?: QueryParams) => api.get('/users', { params }),
  update: (id: string, data: UserPatch) => api.patch(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// Invites
export const invitesApi = {
  getAll: () => api.get('/invites'),
  generate: (role: string) => api.post('/invites/generate', { role }),
  revoke: (id: string) => api.delete(`/invites/${id}`),
  validate: (code: string) => api.post('/invites/validate', { code }),
  redeem: (code: string, name: string, email: string, password: string) =>
    api.post('/invites/redeem', { code, name, email, password }),
};

// Admin Department Assignments
export const adminDepartmentsApi = {
  assign: (adminId: string, departmentId: string) =>
    api.post('/admin-departments', { adminId, departmentId }),
  unassign: (adminId: string, deptId: string) =>
    api.delete(`/admin-departments/${adminId}/${deptId}`),
};

// Staff Department Assignments
export const staffDepartmentsApi = {
  assign: (staffId: string, departmentId: string) =>
    api.post('/staff-departments', { staffId, departmentId }),
  unassign: (staffId: string, deptId: string) =>
    api.delete(`/staff-departments/${staffId}/${deptId}`),
};

// Settings
export const settingsApi = {
  deleteOperationalData: (confirmPhrase: string) =>
    api.post('/settings/danger/delete-data', { confirmPhrase }),
  deleteDepartmentData: (departmentId: string, confirmPhrase: string) =>
    api.post('/settings/danger/delete-department-data', { departmentId, confirmPhrase }),
  syncStockCounts: () =>
    api.post('/settings/sync-stock-counts'),
};

export default api;
