/**
 * Axios Configuration
 * Her istekte JWT token'ı Authorization header'ında gönderir
 * 401 alındığında otomatik logout yapar
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

// 401 yanıtlarında otomatik logout (login sayfası istekleri hariç)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || "";
      const isLoginRequest = url.includes("/auth/") || url.includes("/login");
      if (!isLoginRequest && localStorage.getItem("user")) {
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axios;
