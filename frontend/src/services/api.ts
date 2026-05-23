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

  // Add current department header for admins
  const currentDeptId = localStorage.getItem('currentDepartmentId');
  if (currentDeptId) {
    config.headers['X-Department-Id'] = currentDeptId;
  }

  return config;
});

// Handle token expiration (401)
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
  getById: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
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

// Floor Plans
export const floorPlansApi = {
  getAll: () => api.get('/floor-plans'),
  getById: (id: string) => api.get(`/floor-plans/${id}`),
  create: (data: any) => api.post('/floor-plans', data),
  update: (id: string, data: any) => api.put(`/floor-plans/${id}`, data),
  delete: (id: string) => api.delete(`/floor-plans/${id}`),
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentMovements: () => api.get('/dashboard/recent-movements'),
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

export default api;
