/**
 * Axios Configuration with Permission Headers
 * Global toast deduplication to prevent multiple error messages
 */
import axios from 'axios';
import { toast } from 'sonner';

// Global deduplication using window object
if (typeof window !== 'undefined') {
  window.__toastState = window.__toastState || {
    lastMessage: '',
    lastTime: 0,
    activeMessages: new Set()
  };
}

const showErrorToast = (message) => {
  if (typeof window === 'undefined') return;
  
  const state = window.__toastState;
  const now = Date.now();
  
  // Aynı mesaj 3 saniye içinde tekrar gösterilmesin
  if (state.activeMessages.has(message)) {
    return;
  }
  
  // Son mesaj aynıysa ve 3 saniye geçmediyse gösterme
  if (message === state.lastMessage && now - state.lastTime < 3000) {
    return;
  }
  
  state.lastMessage = message;
  state.lastTime = now;
  state.activeMessages.add(message);
  
  // Toast göster
  toast.error(message, { duration: 4000 });
  
  // 3 saniye sonra mesajı aktif listeden kaldır
  setTimeout(() => {
    state.activeMessages.delete(message);
  }, 3000);
};

// Create axios instance
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
});

// Request interceptor - add X-Admin-Id header
axiosInstance.interceptors.request.use(
  (config) => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.id) {
          config.headers['X-Admin-Id'] = user.id;
        }
      }
    } catch (e) {
      console.error('Error setting admin ID header:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401/403 errors with single toast
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      
      if (status === 403 || status === 401) {
        const message = detail || (status === 403 ? 'Bu işlem için yetkiniz yok' : 'Oturum hatası');
        showErrorToast(message);
        error.handled = true;
        error.permissionError = status === 403;
        error.authError = status === 401;
      }
    }
    return Promise.reject(error);
  }
);

// Configure default axios instance too
axios.interceptors.request.use(
  (config) => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.id) {
          config.headers = config.headers || {};
          config.headers['X-Admin-Id'] = user.id;
        }
      }
    } catch (e) {
      console.error('Error setting admin ID header:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      
      if (status === 403 || status === 401) {
        const message = detail || (status === 403 ? 'Bu işlem için yetkiniz yok' : 'Oturum hatası');
        showErrorToast(message);
        error.handled = true;
        error.permissionError = status === 403;
        error.authError = status === 401;
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
