/**
 * Axios Configuration with Permission Headers
 * Automatically adds X-Admin-Id header to all requests
 */
import axios from 'axios';

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

// Add response interceptor to handle 403 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403) {
      const message = error.response.data?.detail || 'Bu işlem için yetkiniz yok';
      // You can dispatch a toast here if needed
      console.warn('Permission denied:', message);
    }
    return Promise.reject(error);
  }
);

// Also configure default axios to add the header
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

export default axiosInstance;
