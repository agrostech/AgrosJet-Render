import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [courierData, setCourierData] = useState({ phone: "", password: "" });
  const [adminData, setAdminData] = useState({ username: "", password: "" });

  const handleCourierLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/courier/login`, courierData);
      localStorage.setItem("user", JSON.stringify(res.data));
      toast.success("Giriş başarılı");
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
      localStorage.setItem("user", JSON.stringify(res.data));
      toast.success("Giriş başarılı");
      
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

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-2">
            ShiftJet
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            ShiftJet yönetim sistemine hoş geldiniz. Lütfen giriş yapınız.
          </p>

          <Tabs defaultValue="courier" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary">
              <TabsTrigger 
                value="courier" 
                data-testid="courier-tab"
                className="font-semibold text-sm"
              >
                Kurye
              </TabsTrigger>
              <TabsTrigger 
                value="admin" 
                data-testid="admin-tab"
                className="font-semibold text-sm"
              >
                Yönetici
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
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right - Image (hidden on mobile) */}
      <div 
        className="hidden lg:block lg:w-1/2 bg-cover bg-center"
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1586626277605-7720525d251a?crop=entropy&cs=srgb&fm=jpg&q=85')` 
        }}
      >
        <div className="w-full h-full bg-primary/60 flex items-end p-12">
          <div className="text-white">
            <h2 className="font-heading text-4xl font-bold mb-2">
              ShiftJet
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
