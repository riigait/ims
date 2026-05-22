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
  return config;
});

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
  logout: () => localStorage.removeItem('token'),
  getCurrentUser: () => api.get('/auth/me'),
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

export default api;
