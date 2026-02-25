import axios from 'axios';

// In production, call the Render backend directly. In dev, Vite proxies /api to localhost:5000.
const API_BASE = import.meta.env.PROD
  ? 'https://garage-services-api.onrender.com/api'
  : '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth APIs ──────────────────────────────────────────────
export const authApi = {
  // Customer
  customerRequestOtp: (email: string) => api.post('/auth/customer/request-otp', { email }),
  customerVerifyOtp: (email: string, otp: string) => api.post('/auth/customer/verify-otp', { email, otp }),
  // Worker
  workerRegister: (data: { email: string; fullName: string; phone: string; password: string }) => api.post('/auth/worker/register', data),
  workerVerifyOtp: (email: string, otp: string) => api.post('/auth/worker/verify-otp', { email, otp }),
  workerLogin: (email: string, password: string) => api.post('/auth/worker/login', { email, password }),
  // Manager
  managerLogin: (username: string, password: string) => api.post('/auth/manager/login', { username, password }),
  // Current user
  me: () => api.get('/auth/me'),
};

// ── Dashboard ──────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => api.get('/dashboard'),
};

// ── Bookings ───────────────────────────────────────────────
export const bookingsApi = {
  getAll: (params?: { search?: string; status?: string }) => api.get('/bookings', { params }),
  create: (data: Record<string, unknown>) => api.post('/bookings', data),
  updateStatus: (id: number, status: string) => api.patch(`/bookings/${id}/status`, { status }),
  delete: (id: number) => api.delete(`/bookings/${id}`),
  assign: (id: number, workerId: number) => api.patch(`/bookings/${id}/assign`, { workerId }),
};

// ── Workers (Manager) ──────────────────────────────────────
export const workersApi = {
  getAll: () => api.get('/workers'),
  getApproved: () => api.get('/workers/approved'),
  approve: (id: number) => api.patch(`/workers/${id}/approval`, { status: 'Approved' }),
  reject: (id: number) => api.patch(`/workers/${id}/approval`, { status: 'Rejected' }),
};

// ── Settings ───────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: Record<string, string>) => api.put('/settings', data),
};

// ── Feedback ───────────────────────────────────────────────
export const feedbackApi = {
  submit: (data: { customerName: string; email: string; rating: number; comments: string }) => api.post('/feedback', data),
  getAll: () => api.get('/feedback'),
};

// ── Notifications ───────────────────────────────────────────
export const notificationsApi = {
  getAll: (limit = 20) => api.get('/notifications', { params: { limit } }),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// Helper to get current user from localStorage
export function getStoredUser(): { id: number; email: string; fullName: string; role: string; username?: string; phone?: string } | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
