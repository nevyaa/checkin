import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
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

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  refreshToken: () => api.post('/auth/refresh'),
};

// Properties API
export const propertiesAPI = {
  getAll: (params) => api.get('/properties', { params }),
  getById: (id) => api.get(`/properties/${id}`),
  create: (data) => api.post('/properties', data),
  update: (id, data) => api.put(`/properties/${id}`, data),
  delete: (id) => api.delete(`/properties/${id}`),
  toggleStatus: (id) => api.patch(`/properties/${id}/toggle-status`),
  getDashboard: (id) => api.get(`/properties/${id}/dashboard`),
};

// Tenants API
export const tenantsAPI = {
  getAll: (params) => api.get('/tenants', { params }),
  getById: (id) => api.get(`/tenants/${id}`),
  create: (data) => api.post('/tenants', data),
  update: (id, data) => api.put(`/tenants/${id}`, data),
  toggleStatus: (id) => api.patch(`/tenants/${id}/toggle-status`),
  getDashboard: (id) => api.get(`/tenants/${id}/dashboard`),
  getRentSchedule: (id) => api.get(`/tenants/${id}/rent-schedule`),
};

// Transactions API
export const transactionsAPI = {
  getAll: (params) => api.get('/transactions', { params }),
  getById: (id) => api.get(`/transactions/${id}`),
  create: (data) => api.post('/transactions', data),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
  markPaid: (id, data) => api.patch(`/transactions/${id}/mark-paid`, data),
  markUnpaid: (id) => api.patch(`/transactions/${id}/mark-unpaid`),
  getSummary: (params) => api.get('/transactions/summary/stats', { params }),
  getOverdue: () => api.get('/transactions/overdue/list'),
};

// Expenses API
export const expensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getById: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getCategories: () => api.get('/expenses/categories/list'),
  getSummary: (params) => api.get('/expenses/summary/stats', { params }),
};

// Reports API
export const reportsAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getIncomeExpense: (params) => api.get('/reports/income-expense', { params }),
  getROIAnalysis: (params) => api.get('/reports/roi-analysis', { params }),
  getVacancy: (params) => api.get('/reports/vacancy', { params }),
  getTenantAnalysis: () => api.get('/reports/tenant-analysis'),
  getMaintenance: (params) => api.get('/reports/maintenance', { params }),
};

// Documents API
export const documentsAPI = {
  getAll: (params) => api.get('/documents', { params }),
  upload: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  download: (id) => api.get(`/documents/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/documents/${id}`),
  getTypes: () => api.get('/documents/types/list'),
};

// Notifications API
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/mark-read`),
  markAllRead: () => api.patch('/notifications/mark-all-read'),
  delete: (id) => api.delete(`/notifications/${id}`),
  getSummary: () => api.get('/notifications/summary'),
  sendRentDue: (data) => api.post('/notifications/send-rent-due', data),
  sendUtilityDue: (data) => api.post('/notifications/send-utility-due', data),
  sendLeaseExpiry: (data) => api.post('/notifications/send-lease-expiry', data),
  sendWelcome: (data) => api.post('/notifications/send-welcome', data),
};

export default api;