import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import CourierLoginPage from "@/pages/CourierLoginPage";
import CourierDashboard from "@/pages/CourierDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import SystemDashboard from "@/pages/SystemDashboard";
import RestaurantDashboard from "@/pages/restoran/RestaurantDashboard";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
// Initialize axios interceptors for permission headers
import "@/utils/axiosConfig";

function App() {
  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('SW registered:', registration);
          })
          .catch(error => {
            console.log('SW registration failed:', error);
          });
      });
    }
  }, []);

  return (
    <div className="app-container">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/courier-login" element={<CourierLoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/courier/*" element={<CourierRedirect />} />
          <Route path="/kurye/:courierId/*" element={<CourierDashboard />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/system/*" element={<SystemDashboard />} />
          <Route path="/restoran/*" element={<RestaurantDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
      <PWAInstallPrompt />
    </div>
  );
}

export default App;
