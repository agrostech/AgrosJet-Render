import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import CourierLoginPage from "@/pages/CourierLoginPage";
import CourierForgotPasswordPage from "@/pages/CourierForgotPasswordPage";
import CourierDashboard from "@/pages/CourierDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import SystemDashboard from "@/pages/SystemDashboard";
import RestaurantDashboard from "@/pages/restoran/RestaurantDashboard";
import CourierKVKKPage from "@/pages/courier/CourierKVKKPage";
import CourierDeleteAccountPage from "@/pages/courier/CourierDeleteAccountPage";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
// Initialize axios interceptors for permission headers
import "@/utils/axiosConfig";

// Eski /courier URL'sini yeni formata yönlendir
function CourierRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const session = localStorage.getItem("user");
    if (session) {
      const userData = JSON.parse(session);
      if (userData.role === "courier" && userData.id) {
        navigate(`/kurye/${userData.id}`, { replace: true });
        return;
      }
    }
    navigate("/courier-login", { replace: true });
  }, [navigate]);
  return null;
}

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
          <Route path="/courier-forgot-password" element={<CourierForgotPasswordPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/kurye/kvkk" element={<CourierKVKKPage companyName="AgrosJet" />} />
          <Route path="/kurye/hesap-sil" element={<CourierDeleteAccountPage />} />
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
