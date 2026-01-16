import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useSessionCheck() {
  const navigate = useNavigate();

  const checkSession = useCallback(async () => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      return false;
    }

    try {
      const user = JSON.parse(stored);
      
      // Backend'den oturum geçerliliğini kontrol et
      try {
        const res = await axios.get(`${API}/session/check/${user.id}`);
        if (!res.data.valid) {
          localStorage.removeItem("user");
          if (res.data.reason === "user_deleted") {
            toast.error("Hesabınız silindi. Çıkış yapılıyor...");
          } else if (res.data.reason === "session_invalidated") {
            toast.error("Oturum bilgileriniz değişti. Lütfen tekrar giriş yapın.");
          }
          navigate("/login");
          return false;
        }
      } catch (err) {
        // Backend'e ulaşılamadıysa sadece yerel kontrole devam et
        console.log("Session check failed, continuing with local check");
      }
      
      // Beni hatırla seçiliyse (expiresAt null), oturum geçerli
      if (user.rememberMe || !user.expiresAt) {
        return true;
      }

      // Süre kontrolü
      if (Date.now() > user.expiresAt) {
        localStorage.removeItem("user");
        toast.error("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
        navigate("/login");
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }, [navigate]);

  useEffect(() => {
    // İlk kontrol
    checkSession();

    // Her 30 saniyede kontrol et (daha sık kontrol)
    const interval = setInterval(checkSession, 30000);

    return () => clearInterval(interval);
  }, [checkSession]);
}

export function checkSessionValid() {
  const stored = localStorage.getItem("user");
  if (!stored) return false;

  try {
    const user = JSON.parse(stored);
    if (user.rememberMe || !user.expiresAt) return true;
    return Date.now() <= user.expiresAt;
  } catch {
    return false;
  }
}
