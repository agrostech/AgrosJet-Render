import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function useSessionCheck() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = () => {
      const stored = localStorage.getItem("user");
      if (!stored) {
        return false;
      }

      try {
        const user = JSON.parse(stored);
        
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
    };

    // İlk kontrol
    checkSession();

    // Her dakika kontrol et
    const interval = setInterval(checkSession, 60000);

    return () => clearInterval(interval);
  }, [navigate]);
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
