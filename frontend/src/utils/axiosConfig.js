/**
 * Axios Configuration with Permission Headers
 * Automatically adds X-Admin-Id header to all requests
 */
import axios from 'axios';
import { toast } from 'sonner';

// Track shown toasts to prevent duplicates
let lastErrorMessage = '';
let lastErrorTime = 0;

const showErrorToast = (message) => {
  const now = Date.now();
  // Aynı mesajı 2 saniye içinde tekrar gösterme
  if (message === lastErrorMessage && now - lastErrorTime < 2000) {
    return;
  }
  lastErrorMessage = message;
  lastErrorTime = now;
  toast.error(message);
};

// Create axios instance
const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL,
});

// Add request interceptor to include X-Admin-Id header
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
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle permission errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      
      if (status === 403) {
        // Yetki hatası - sadece tek bir mesaj göster
        const message = detail || 'Bu işlem için yetkiniz yok';
        showErrorToast(message);
        // Error'a flag ekle - component'te tekrar toast göstermesin
        error.permissionError = true;
      } else if (status === 401) {
        const message = detail || 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın';
        showErrorToast(message);
        error.authError = true;
      }
    }
    return Promise.reject(error);
  }
);

// Also configure default axios to add the header and handle errors
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
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for default axios
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      
      if (status === 403) {
        const message = detail || 'Bu işlem için yetkiniz yok';
        showErrorToast(message);
        error.permissionError = true;
      } else if (status === 401) {
        const message = detail || 'Oturum süreniz dolmuş, lütfen tekrar giriş yapın';
        showErrorToast(message);
        error.authError = true;
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
