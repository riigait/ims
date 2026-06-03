import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Auth endpoints refresh the user's actual role/assignments and should not carry a stale department header.
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
      const networkError = new Error(
        'Cannot connect to the server. Please make sure the backend is running and try again.'
      );
      (networkError as any).isOffline = true;
      return Promise.reject(networkError);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
  logout: () => localStorage.removeItem('token'),
  getCurrentUser: () => api.get('/auth/me'),
  completeInitialSetup: (newEmail: string, newPassword: string, newName: string) =>
    api.post('/auth/complete-initial-setup', { newEmail, newPassword, newName }),
  ensureSuperadmin: () =>
    api.post('/auth/ensure-superadmin', {}),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  resetPassword: (userId: string, newPassword: string) =>
    api.post(`/auth/reset-password/${userId}`, { newPassword }),
};

// Products
export const productsApi = {
  getAll: (params?: any) => api.get('/products', { params }),
  getAllForDepartment: (departmentId: string) => api.get('/products', { headers: { 'X-Department-Id': departmentId } }),
  getById: (id: string) => api.get(`/products/${id}`),
  getMovements: (id: string) => api.get(`/products/${id}/movements`),
  create: (data: any) => api.post('/products', data),
  bulkCreate: (data: any[]) => api.post('/products/bulk', { products: data }),
  update: (id: string, data: any) => api.put(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
};

// Categories
export const categoriesApi = {
  getAll: () => api.get('/categories'),
  getById: (id: string) => api.get(`/categories/${id}`),
  create: (data: any) => api.post('/categories', data),
  update: (id: string, data: any) => api.put(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// Locations
export const locationsApi = {
  getAll: () => api.get('/locations'),
  getForDepartment: (departmentId: string) => api.get('/locations', { headers: { 'X-Department-Id': departmentId } }),
  getById: (id: string) => api.get(`/locations/${id}`),
  create: (data: any) => api.post('/locations', data),
  update: (id: string, data: any) => api.put(`/locations/${id}`, data),
  delete: (id: string) => api.delete(`/locations/${id}`),
};

// Stock Movements
export const stockMovementsApi = {
  getAll: (params?: any) => api.get('/stock-movements', { params }),
  getById: (id: string) => api.get(`/stock-movements/${id}`),
  create: (data: any) => api.post('/stock-movements', data),
  update: (id: string, data: any) => api.put(`/stock-movements/${id}`, data),
  delete: (id: string) => api.delete(`/stock-movements/${id}`),
};

// Stock Details
export const stockDetailsApi = {
  getAll: () => api.get('/stock-details'),
  getByProductId: (productId: string) => api.get(`/stock-details/product/${productId}`),
  getByStatus: (status: string) => api.get(`/stock-details/by-status/${status}`),
  getById: (id: string) => api.get(`/stock-details/${id}`),
  getMovements: (id: string) => api.get(`/stock-details/${id}/movements`),
  getDeployment: (id: string) => api.get(`/stock-details/${id}/deployment`),
  create: (data: any) => api.post('/stock-details', data),
  update: (id: string, data: any) => api.put(`/stock-details/${id}`, data),
  delete: (id: string) => api.delete(`/stock-details/${id}`),
  bulkVerify: (ids: string[]) => api.post('/stock-details/bulk-verify', { ids }),
};

// Floor Plans
export const floorPlansApi = {
  getAll: () => api.get('/floor-plans'),
  getByLocation: (locationId: string) => api.get(`/floor-plans/by-location/${locationId}`),
  getById: (id: string) => api.get(`/floor-plans/${id}`),
  autoGenerate: (data?: any) => api.post('/floor-plans/auto-generate', data),
  create: (data: any) => api.post('/floor-plans', data),
  update: (id: string, data: any) => api.put(`/floor-plans/${id}`, data),
  delete: (id: string) => api.delete(`/floor-plans/${id}`),
  feedback: (id: string, data: { feedback: string; rating?: number; correctedData?: string }) =>
    api.post(`/floor-plans/${id}/feedback`, data),
  regenerate: (id: string) => api.post(`/floor-plans/${id}/regenerate`, {}),
  getRules: () => api.get('/floor-plans/rules'),
};

// Map Search
export const mapApi = {
  search: (query: string) => api.get('/map/search', { params: { q: query } }),
  reverse: (lat: number, lng: number) => api.get('/map/reverse', { params: { lat, lng } }),
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
  create: (data: any) => api.post('/departments', data),
  update: (id: string, data: any) => api.patch(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

// Delete Requests
export const deleteRequestsApi = {
  getAll: (status?: string) => api.get('/delete-requests', { params: { status } }),
  create: (data: any) => api.post('/delete-requests', data),
  approve: (id: string) => api.patch(`/delete-requests/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/delete-requests/${id}/reject`, { reason }),
};

// Password Requests
export const passwordRequestsApi = {
  getAll: () => api.get('/password-requests'),
  create: (reason?: string) => api.post('/password-requests', { reason }),
  approve: (id: string, temporaryPassword: string) =>
    api.patch(`/password-requests/${id}/approve`, { temporaryPassword }),
  reject: (id: string) =>
    api.patch(`/password-requests/${id}/reject`),
};

// Edit Requests
export const editRequestsApi = {
  getAll: (status?: string) => api.get('/edit-requests', { params: { status } }),
  create: (productId: string, proposedChanges: Record<string, any>, reason?: string) =>
    api.post('/edit-requests', { productId, proposedChanges, reason }),
  approve: (id: string) => api.patch(`/edit-requests/${id}/approve`),
  reject: (id: string, rejectionReason?: string) =>
    api.patch(`/edit-requests/${id}/reject`, { rejectionReason }),
};

// Export Requests
export const exportRequestsApi = {
  getAll: () => api.get('/export-requests'),
  create: (type: string, label: string, csvData: string) =>
    api.post('/export-requests', { type, label, csvData }),
  approve: (id: string) => api.patch(`/export-requests/${id}/approve`),
  reject: (id: string, rejectionReason?: string) =>
    api.patch(`/export-requests/${id}/reject`, { rejectionReason }),
  downloadUrl: (id: string) => `/api/export-requests/${id}/download`,
};

// Import Requests
export const importRequestsApi = {
  getAll: () => api.get('/import-requests'),
  approve: (id: string) => api.patch(`/import-requests/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch(`/import-requests/${id}/reject`, { reason }),
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
