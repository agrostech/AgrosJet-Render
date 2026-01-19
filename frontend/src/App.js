import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import CourierDashboard from "@/pages/CourierDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import SystemDashboard from "@/pages/SystemDashboard";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

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
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/courier/*" element={<CourierDashboard />} />
          <Route path="/admin/*" element={<AdminDashboard />} />
          <Route path="/system/*" element={<SystemDashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
      <PWAInstallPrompt />
    </div>
  );
}

export default App;
