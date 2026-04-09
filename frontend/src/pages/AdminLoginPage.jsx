import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Lock, ChevronLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({ username: "", password: "" });

  const loginImage = "https://customer-assets.emergentagent.com/job_dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/artifacts/zcscsfm0_agrosjetapplogin.png";

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      if (user.expiresAt && Date.now() > user.expiresAt) {
        localStorage.removeItem("user");
        return;
      }
      if (user.role === "systemadmin") navigate("/system");
      else if (user.role === "restaurant") navigate("/restoran");
      else if (user.role === "courier") navigate("/courier");
      else navigate("/admin");
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/admin/login`, formData);
      const sessionData = {
        ...res.data,
        rememberMe,
        expiresAt: rememberMe ? null : Date.now() + (60 * 60 * 1000)
      };
      localStorage.setItem("user", JSON.stringify(sessionData));
      if (res.data.role === "systemadmin") navigate("/system");
      else navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundImage: "url('https://static.prod-images.emergentagent.com/jobs/dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/images/df1ee712afbdbe4a80c6c8d13bb106900f89ddc6a7a9eff3309ca29c9ca23dea.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="w-full max-w-[1170px] flex rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
        
        {/* Left - Image Panel */}
        <div 
          className="hidden lg:flex lg:w-[50%] relative bg-cover bg-center"
          style={{ backgroundImage: `url('${loginImage}')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end p-10 w-full">
            <img 
              src="/agrosjet-login-logo.png" 
              alt="AgrosJet" 
              className="h-16 object-contain self-start mb-4"
            />
            <p className="text-white/80 text-base">Teslimatınızı ileriye taşıyın.</p>
          </div>
        </div>

        {/* Right - Form */}
        <div className="w-full lg:w-[50%] bg-white p-10 md:p-12 flex flex-col justify-center">
          {/* Geri butonu */}
          <Link to="/login" className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-8 w-fit" data-testid="back-to-selector">
            <ChevronLeft className="w-4 h-4" />
            Geri
          </Link>

          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <img src="https://customer-assets.emergentagent.com/job_dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/artifacts/kj7xrk2d_agroslogo.png" alt="AgrosJet" className="h-24" />
          </div>

          <h2 className="text-3xl font-bold text-slate-900 mb-1">Yönetici Girişi</h2>
          <p className="text-base text-slate-500 mb-8">Şirket yönetim paneline giriş yapın</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <Label htmlFor="username" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Kullanıcı Adı
              </Label>
              <div className="relative mt-2">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  id="username"
                  data-testid="admin-username-input"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="h-12 pl-11 text-base border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Şifre
              </Label>
              <div className="relative mt-2">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  id="password"
                  data-testid="admin-password-input"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-12 pl-11 text-base border-slate-200 bg-slate-50 text-slate-900 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="rememberMe" 
                checked={rememberMe}
                onCheckedChange={setRememberMe}
                data-testid="remember-admin-checkbox"
                className="border-slate-300 data-[state=checked]:bg-[#e13c10] data-[state=checked]:border-[#e13c10]"
              />
              <Label htmlFor="rememberMe" className="text-sm text-slate-500 cursor-pointer">
                Beni Hatırla
              </Label>
            </div>
            <Button 
              type="submit" 
              data-testid="admin-login-btn"
              className="w-full h-12 text-base font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white rounded-lg"
              disabled={loading}
            >
              {loading ? "Yükleniyor..." : "Giriş Yap"}
            </Button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-400">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </p>
        </div>
      </div>
    </div>
  );
}
