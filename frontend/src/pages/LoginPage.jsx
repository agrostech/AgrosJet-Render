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
  const [rememberCourier, setRememberCourier] = useState(false);
  const [rememberAdmin, setRememberAdmin] = useState(false);
  const [rememberRestaurant, setRememberRestaurant] = useState(false);
  
  const [courierData, setCourierData] = useState({ phone: "", password: "" });
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

  const handleCourierLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/courier/login`, courierData);
      // Set company_id from first company
      const userData = {
        ...res.data,
        company_id: res.data.companies?.[0]?.id || null
      };
      saveSession(userData, rememberCourier);
      navigate("/courier");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
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
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-2 text-white">
            AgrosJet
          </h1>
          <p className="text-slate-400 text-sm mb-8">
            AgrosJet yönetim sistemine hoş geldiniz. Lütfen giriş yapınız.
          </p>

          <Tabs defaultValue="courier" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-800 border border-slate-700">
              <TabsTrigger 
                value="courier" 
                data-testid="courier-tab"
                className="font-semibold text-sm text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
              >
                Kurye
              </TabsTrigger>
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

            <TabsContent value="courier">
              <form onSubmit={handleCourierLogin} className="space-y-4">
                <div>
                  <Label htmlFor="phone" className="text-sm font-semibold">
                    Telefon No
                  </Label>
                  <Input
                    id="phone"
                    data-testid="courier-phone-input"
                    type="tel"
                    placeholder="05XXXXXXXXX"
                    value={courierData.phone}
                    onChange={(e) => setCourierData({ ...courierData, phone: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="courier-password" className="text-sm font-semibold">
                    Şifre
                  </Label>
                  <Input
                    id="courier-password"
                    data-testid="courier-password-input"
                    type="password"
                    value={courierData.password}
                    onChange={(e) => setCourierData({ ...courierData, password: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="courier-login-btn"
                  className="w-full h-12 font-semibold"
                  disabled={loading}
                >
                  {loading ? "Yükleniyor..." : "Giriş Yap"}
                </Button>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox 
                    id="rememberCourier" 
                    checked={rememberCourier}
                    onCheckedChange={setRememberCourier}
                    data-testid="remember-courier-checkbox"
                  />
                  <Label htmlFor="rememberCourier" className="text-sm text-muted-foreground cursor-pointer">
                    Beni Hatırla
                  </Label>
                </div>
              </form>
              <p className="mt-4 text-sm text-center text-muted-foreground">
                Hesabınız yok mu?{" "}
                <Link 
                  to="/register" 
                  className="text-primary font-semibold hover:underline" 
                  data-testid="register-link"
                >
                  Kayıt Ol
                </Link>
              </p>
            </TabsContent>

            <TabsContent value="admin">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <Label htmlFor="username" className="text-sm font-semibold">
                    Kullanıcı Adı
                  </Label>
                  <Input
                    id="username"
                    data-testid="admin-username-input"
                    type="text"
                    value={adminData.username}
                    onChange={(e) => setAdminData({ ...adminData, username: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="admin-password" className="text-sm font-semibold">
                    Şifre
                  </Label>
                  <Input
                    id="admin-password"
                    data-testid="admin-password-input"
                    type="password"
                    value={adminData.password}
                    onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="admin-login-btn"
                  className="w-full h-12 font-semibold"
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
                  />
                  <Label htmlFor="rememberAdmin" className="text-sm text-muted-foreground cursor-pointer">
                    Beni Hatırla
                  </Label>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="restaurant">
              <form onSubmit={handleRestaurantLogin} className="space-y-4">
                <div>
                  <Label htmlFor="restaurant-username" className="text-sm font-semibold">
                    Kullanıcı Adı
                  </Label>
                  <Input
                    id="restaurant-username"
                    data-testid="restaurant-username-input"
                    type="text"
                    value={restaurantData.username}
                    onChange={(e) => setRestaurantData({ ...restaurantData, username: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="restaurant-password" className="text-sm font-semibold">
                    Şifre
                  </Label>
                  <Input
                    id="restaurant-password"
                    data-testid="restaurant-password-input"
                    type="password"
                    value={restaurantData.password}
                    onChange={(e) => setRestaurantData({ ...restaurantData, password: e.target.value })}
                    className="mt-1 h-12 border-2"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  data-testid="restaurant-login-btn"
                  className="w-full h-12 font-semibold"
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
                  />
                  <Label htmlFor="rememberRestaurant" className="text-sm text-muted-foreground cursor-pointer">
                    Beni Hatırla
                  </Label>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </p>
        </div>
      </div>

      {/* Right - Image (hidden on mobile) */}
      <div 
        className="hidden lg:block lg:w-1/2 bg-cover bg-center"
        style={{ 
          backgroundImage: `url('https://customer-assets.emergentagent.com/job_courier-dashboard-7/artifacts/ktc5mfpb_shiftjetlogin.png')` 
        }}
      >
        <div className="w-full h-full bg-black/50 flex items-end p-12">
          <div className="text-white">
            <h2 className="font-heading text-4xl font-bold mb-2">
              AgrosJet
            </h2>
            <p className="text-white/80">
              Kurye Yönetim Sistemi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

