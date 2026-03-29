/**
 * Axios Configuration
 * Her istekte JWT token'ı Authorization header'ında gönderir
 */
import axios from 'axios';

// Her istekten önce token ekle
axios.interceptors.request.use((config) => {
  const stored = localStorage.getItem("user");
  if (stored) {
    try {
      const user = JSON.parse(stored);
      if (user?.token) {
        config.headers.Authorization = `Bearer ${user.token}`;
      }
    } catch {}
  }
  return config;
});

export default axios;
