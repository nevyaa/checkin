import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
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
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const endpoints = {
  // Auth
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    profile: '/auth/profile',
    changePassword: '/auth/change-password',
  },
  
  // Properties
  properties: {
    list: '/properties',
    create: '/properties',
    get: (id) => `/properties/${id}`,
    update: (id) => `/properties/${id}`,
    delete: (id) => `/properties/${id}`,
    stats: (id) => `/properties/${id}/stats`,
  },
  
  // Tenants
  tenants: {
    list: '/tenants',
    create: '/tenants',
    get: (id) => `/tenants/${id}`,
    update: (id) => `/tenants/${id}`,
    delete: (id) => `/tenants/${id}`,
    leases: (id) => `/tenants/${id}/leases`,
    payments: (id) => `/tenants/${id}/payments`,
  },
  
  // Leases
  leases: {
    list: '/leases',
    create: '/leases',
    get: (id) => `/leases/${id}`,
    update: (id) => `/leases/${id}`,
    terminate: (id) => `/leases/${id}/terminate`,
    payments: (id) => `/leases/${id}/payments`,
    reminders: '/leases/reminders',
  },
  
  // Payments
  payments: {
    list: '/payments',
    create: '/payments',
    get: (id) => `/payments/${id}`,
    update: (id) => `/payments/${id}`,
    markPaid: (id) => `/payments/${id}/mark-paid`,
    delete: (id) => `/payments/${id}`,
    overdue: '/payments/overdue/list',
    stats: '/payments/stats/summary',
  },
  
  // Expenses
  expenses: {
    list: '/expenses',
    create: '/expenses',
    get: (id) => `/expenses/${id}`,
    update: (id) => `/expenses/${id}`,
    delete: (id) => `/expenses/${id}`,
    categories: '/expenses/categories/list',
    stats: '/expenses/stats/summary',
    categoryStats: '/expenses/stats/by-category',
  },
  
  // Reports
  reports: {
    monthly: '/reports/monthly',
    yearly: '/reports/yearly',
    roi: '/reports/roi',
    incomeExpense: '/reports/income-expense',
    dashboard: '/reports/dashboard',
  },
  
  // Documents
  documents: {
    list: '/documents',
    upload: '/documents',
    get: (id) => `/documents/${id}`,
    update: (id) => `/documents/${id}`,
    delete: (id) => `/documents/${id}`,
    download: (id) => `/documents/${id}/download`,
    types: '/documents/types/list',
  },
  
  // Notifications
  notifications: {
    list: '/notifications',
    unreadCount: '/notifications/unread-count',
    markRead: (id) => `/notifications/${id}/read`,
    markAllRead: '/notifications/mark-all-read',
    sendRentReminder: '/notifications/send-rent-reminder',
    sendUtilityReminder: '/notifications/send-utility-reminder',
    sendCustom: '/notifications/send-custom',
    delete: (id) => `/notifications/${id}`,
    stats: '/notifications/stats',
  },
};

// Helper functions for common API operations
export const apiHelpers = {
  // Generic CRUD operations
  create: (endpoint, data) => api.post(endpoint, data),
  read: (endpoint, params) => api.get(endpoint, { params }),
  update: (endpoint, data) => api.put(endpoint, data),
  delete: (endpoint) => api.delete(endpoint),
  
  // File upload
  upload: (endpoint, formData) => api.post(endpoint, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  
  // Download file
  download: (endpoint) => api.get(endpoint, {
    responseType: 'blob',
  }),
};

export default api;