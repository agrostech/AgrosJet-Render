import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(false);
  const [rememberRestaurant, setRememberRestaurant] = useState(false);
  
  const [adminData, setAdminData] = useState({ username: "", password: "" });
  const [restaurantData, setRestaurantData] = useState({ username: "", password: "" });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      if (user.expiresAt && Date.now() > user.expiresAt) {
        localStorage.removeItem("user");
        return;
      }
      if (user.role === "courier") navigate("/courier");
      else if (user.role === "systemadmin") navigate("/system");
      else if (user.role === "restaurant") navigate("/restoran");
      else navigate("/admin");
    }
  }, [navigate]);

  const saveSession = (userData, remember) => {
    const sessionData = {
      ...userData,
      rememberMe: remember,
      expiresAt: remember ? null : Date.now() + (60 * 60 * 1000)
    };
    localStorage.setItem("user", JSON.stringify(sessionData));
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/admin/login`, adminData);
      saveSession(res.data, rememberAdmin);
      if (res.data.role === "systemadmin") navigate("/system");
      else navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/restaurant-users/login`, restaurantData);
      saveSession(res.data, rememberRestaurant);
      navigate("/restoran");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "radial-gradient(ellipse at 30% 30%, rgba(203, 213, 225, 0.6) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(148, 163, 184, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(225, 60, 16, 0.08) 0%, transparent 40%), radial-gradient(ellipse at 90% 20%, rgba(225, 60, 16, 0.06) 0%, transparent 35%), linear-gradient(160deg, #e2e8f0 0%, #cbd5e1 25%, #94a3b8 50%, #cbd5e1 75%, #e2e8f0 100%)" }}>
      {/* Centered Card */}
      <div className="w-full max-w-[900px] flex rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
        
        {/* Left - Image Panel (hidden on mobile) */}
        <div 
          className="hidden lg:flex lg:w-[45%] relative bg-cover bg-center"
          style={{ backgroundImage: `url('https://customer-assets.emergentagent.com/job_dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/artifacts/zcscsfm0_agrosjetapplogin.png')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="relative z-10 flex flex-col justify-end p-8 w-full">
            <img 
              src="/agrosjet-login-logo.png" 
              alt="AgrosJet" 
              className="h-14 object-contain self-start mb-3"
            />
            <p className="text-white/80 text-sm">Teslimatınızı ileriye taşıyın.</p>
          </div>
        </div>

        {/* Right - Form Panel */}
        <div className="w-full lg:w-[55%] bg-white p-8 md:p-10 flex flex-col justify-center">
          {/* Mobile logo */}
          <div className="flex justify-center mb-6 lg:hidden">
            <img src="https://customer-assets.emergentagent.com/job_dfe6f827-18c8-44fa-9707-d7a9c2d6e4a6/artifacts/kj7xrk2d_agroslogo.png" alt="AgrosJet" className="h-20" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Hoş geldiniz</h2>
          <p className="text-sm text-slate-500 mb-6">Panele giriş yapın</p>

          <Tabs defaultValue="admin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-5 bg-slate-100 border border-slate-200">
              <TabsTrigger 
                value="admin" 
                data-testid="admin-tab"
                className="font-semibold text-sm text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                Yönetici
              </TabsTrigger>
              <TabsTrigger 
                value="restaurant" 
                data-testid="restaurant-tab"
                className="font-semibold text-sm text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
              >
                Restoran
              </TabsTrigger>
            </TabsList>

            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <Label htmlFor="username" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Kullanıcı Adı
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="username"
                      data-testid="admin-username-input"
                      type="text"
                      value={adminData.username}
                      onChange={(e) => setAdminData({ ...adminData, username: e.target.value })}
                      className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Şifre
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="admin-password"
                      data-testid="admin-password-input"
                      type="password"
                      value={adminData.password}
                      onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                      className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="rememberAdmin" 
                      checked={rememberAdmin}
                      onCheckedChange={setRememberAdmin}
                      data-testid="remember-admin-checkbox"
                      className="border-slate-300 data-[state=checked]:bg-[#e13c10] data-[state=checked]:border-[#e13c10]"
                    />
                    <Label htmlFor="rememberAdmin" className="text-sm text-slate-500 cursor-pointer">
                      Beni Hatırla
                    </Label>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  data-testid="admin-login-btn"
                  className="w-full h-11 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white rounded-lg"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Giriş Yap"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="restaurant">
              <form onSubmit={handleRestaurantLogin} className="space-y-4">
                <div>
                  <Label htmlFor="restaurant-username" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Kullanıcı Adı
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="restaurant-username"
                      data-testid="restaurant-username-input"
                      type="text"
                      value={restaurantData.username}
                      onChange={(e) => setRestaurantData({ ...restaurantData, username: e.target.value })}
                      className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="restaurant-password" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Şifre
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="restaurant-password"
                      data-testid="restaurant-password-input"
                      type="password"
                      value={restaurantData.password}
                      onChange={(e) => setRestaurantData({ ...restaurantData, password: e.target.value })}
                      className="h-11 pl-10 border-slate-200 bg-slate-50 text-slate-900 focus:border-[#e13c10] focus:ring-[#e13c10]/20"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="rememberRestaurant" 
                      checked={rememberRestaurant}
                      onCheckedChange={setRememberRestaurant}
                      data-testid="remember-restaurant-checkbox"
                      className="border-slate-300 data-[state=checked]:bg-[#e13c10] data-[state=checked]:border-[#e13c10]"
                    />
                    <Label htmlFor="rememberRestaurant" className="text-sm text-slate-500 cursor-pointer">
                      Beni Hatırla
                    </Label>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  data-testid="restaurant-login-btn"
                  className="w-full h-11 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white rounded-lg"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Giriş Yap"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-slate-400">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </p>
        </div>
      </div>
    </div>
  );
}
