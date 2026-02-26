import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CourierLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({
    phone: "",
    password: ""
  });

  // Daha önce giriş yapılmışsa panele yönlendir
  useEffect(() => {
    const session = localStorage.getItem("user");
    if (session) {
      const userData = JSON.parse(session);
      if (userData.role === "courier" && userData.id) {
        navigate(`/kurye/${userData.id}`);
      }
    }
    
    // Hatırlanan telefon
    const savedPhone = localStorage.getItem("courierPhone");
    if (savedPhone) {
      setFormData(prev => ({ ...prev, phone: savedPhone }));
      setRememberMe(true);
    }
  }, [navigate]);

  const saveSession = (data, remember) => {
    const sessionData = {
      ...data,
      company_id: data.companies?.[0]?.id || null,
      rememberMe: remember,
      expiresAt: remember ? null : Date.now() + (60 * 60 * 1000)
    };
    localStorage.setItem("user", JSON.stringify(sessionData));
    if (remember) {
      localStorage.setItem("courierPhone", formData.phone);
    } else {
      localStorage.removeItem("courierPhone");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/courier/login`, {
        phone: formData.phone,
        password: formData.password
      });
      
      saveSession(res.data, rememberMe);
      toast.success("Giriş başarılı!");
      
      // Native app'e bildir (AgrosJet App)
      if (window.isAgrosJetApp && window.AgrosJetNative) {
        window.AgrosJetNative.notifyLogin();
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SET_COURIER_ID',
          data: res.data.id
        }));
      }
      
      navigate(`/kurye/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8">
        <img 
          src="/agrosjet-login-logo.png" 
          alt="AgrosJet" 
          className="h-16 md:h-20"
        />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-300 font-medium">
              Telefon No
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="05XXXXXXXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
              required
              data-testid="courier-phone-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300 font-medium">
              Şifre
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
              required
              data-testid="courier-password-input"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox 
              id="remember" 
              checked={rememberMe}
              onCheckedChange={setRememberMe}
              className="border-slate-500 data-[state=checked]:bg-[#e13c10] data-[state=checked]:border-[#e13c10]"
              data-testid="remember-checkbox"
            />
            <Label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer">
              Beni Hatırla
            </Label>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white text-base"
            disabled={loading}
            data-testid="courier-login-btn"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500">
          © 2026 AgrosJet. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
