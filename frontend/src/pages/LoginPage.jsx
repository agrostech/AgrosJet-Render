import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(false);
  const [rememberRestaurant, setRememberRestaurant] = useState(false);
  
  const [adminData, setAdminData] = useState({ username: "", password: "" });
  const [restaurantData, setRestaurantData] = useState({ username: "", password: "" });

  // Zaten giriş yapılmışsa panele yönlendir
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (user) {
      // Session süresi kontrolü
      if (user.expiresAt && Date.now() > user.expiresAt) {
        localStorage.removeItem("user");
        return;
      }
      // Role göre yönlendir
      if (user.role === "courier") {
        navigate("/courier");
      } else if (user.role === "systemadmin") {
        navigate("/system");
      } else if (user.role === "restaurant") {
        navigate("/restoran");
      } else {
        navigate("/admin");
      }
    }
  }, [navigate]);

  const saveSession = (userData, remember) => {
    const sessionData = {
      ...userData,
      rememberMe: remember,
      expiresAt: remember ? null : Date.now() + (60 * 60 * 1000) // 60 dakika
    };
    localStorage.setItem("user", JSON.stringify(sessionData));
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/admin/login`, adminData);
      saveSession(res.data, rememberAdmin);
      
      if (res.data.role === "systemadmin") {
        navigate("/system");
      } else {
        navigate("/admin");
      }
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
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-[#0f172a]">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img 
              src="/agrosjet-login-logo.png" 
              alt="AgrosJet" 
              className="h-16 md:h-20"
            />
          </div>

          <Tabs defaultValue="admin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-800 border border-slate-700">
              <TabsTrigger 
                value="admin" 
                data-testid="admin-tab"
                className="font-semibold text-sm text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
              >
                Yönetici
              </TabsTrigger>
              <TabsTrigger 
                value="restaurant" 
                data-testid="restaurant-tab"
                className="font-semibold text-sm text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
              >
                Restoran
              </TabsTrigger>
            </TabsList>

            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <Label htmlFor="username" className="text-sm font-semibold text-slate-300">
                    Kullanıcı Adı
                  </Label>
                  <Input
                    id="username"
                    data-testid="admin-username-input"
                    type="text"
                    value={adminData.username}
                    onChange={(e) => setAdminData({ ...adminData, username: e.target.value })}
                    className="mt-1 h-12 border-2 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-sm font-semibold text-slate-300">
                    Şifre
                  </Label>
                  <Input
                    id="admin-password"
                    data-testid="admin-password-input"
                    type="password"
                    value={adminData.password}
                    onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                    className="mt-1 h-12 border-2 bg-slate-800 border-slate-600 text-white"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="admin-login-btn"
                  className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Giriş Yap"}
                </Button>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox 
                    id="rememberAdmin" 
                    checked={rememberAdmin}
                    onCheckedChange={setRememberAdmin}
                    data-testid="remember-admin-checkbox"
                    className="border-slate-500 data-[state=checked]:bg-orange-500"
                  />
                  <Label htmlFor="rememberAdmin" className="text-sm text-slate-400 cursor-pointer">
                    Beni Hatırla
                  </Label>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="restaurant">
              <form onSubmit={handleRestaurantLogin} className="space-y-4">
                <div>
                  <Label htmlFor="restaurant-username" className="text-sm font-semibold text-slate-300">
                    Kullanıcı Adı
                  </Label>
                  <Input
                    id="restaurant-username"
                    data-testid="restaurant-username-input"
                    type="text"
                    value={restaurantData.username}
                    onChange={(e) => setRestaurantData({ ...restaurantData, username: e.target.value })}
                    className="mt-1 h-12 border-2 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="restaurant-password" className="text-sm font-semibold text-slate-300">
                    Şifre
                  </Label>
                  <Input
                    id="restaurant-password"
                    data-testid="restaurant-password-input"
                    type="password"
                    value={restaurantData.password}
                    onChange={(e) => setRestaurantData({ ...restaurantData, password: e.target.value })}
                    className="mt-1 h-12 border-2 bg-slate-800 border-slate-600 text-white"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="restaurant-login-btn"
                  className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Giriş Yap"}
                </Button>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox 
                    id="rememberRestaurant" 
                    checked={rememberRestaurant}
                    onCheckedChange={setRememberRestaurant}
                    data-testid="remember-restaurant-checkbox"
                    className="border-slate-500 data-[state=checked]:bg-orange-500"
                  />
                  <Label htmlFor="rememberRestaurant" className="text-sm text-slate-400 cursor-pointer">
                    Beni Hatırla
                  </Label>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          {/* İleriye Taşır Sloganı */}
          <div className="mt-8 flex justify-center">
            <img 
              src="/ileriye-tasir.png" 
              alt="İleriye Taşır" 
              className="h-24"
            />
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-slate-500">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </p>
        </div>
      </div>

      {/* Right - Image (hidden on mobile) */}
      <div 
        className="hidden lg:block lg:w-1/2 bg-cover bg-center"
        style={{ 
          backgroundImage: `url('/login-bg.jpg')` 
        }}
      />
    </div>
  );
}

