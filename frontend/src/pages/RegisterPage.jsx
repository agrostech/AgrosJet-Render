import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    iban: "",
    plate: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/courier/register`, formData);
      toast.success("Kayıt başarılı! Giriş yapabilirsiniz.");
      navigate("/courier-login");
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kayıt başarısız");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight mb-2">
            AgrosJet Kayıt
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            AgrosJet sistemine kurye olarak kayıt olun
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-semibold">İsim Soyisim *</Label>
              <Input id="name" name="name" data-testid="register-name-input" type="text" placeholder="Adı Soyadı" value={formData.name} onChange={handleChange} className="mt-1 h-12 border-2" required />
            </div>
            <div>
              <Label htmlFor="phone" className="text-sm font-semibold">Telefon No *</Label>
              <Input id="phone" name="phone" data-testid="register-phone-input" type="tel" placeholder="05XXXXXXXXX" value={formData.phone} onChange={handleChange} className="mt-1 h-12 border-2" maxLength={11} required />
            </div>
            <div>
              <Label htmlFor="email" className="text-sm font-semibold">E-posta (Şifre sıfırlama için)</Label>
              <Input id="email" name="email" data-testid="register-email-input" type="email" placeholder="ornek@email.com" value={formData.email} onChange={handleChange} className="mt-1 h-12 border-2" />
            </div>
            <div>
              <Label htmlFor="address" className="text-sm font-semibold">Adres *</Label>
              <Input id="address" name="address" data-testid="register-address-input" type="text" placeholder="Adresiniz" value={formData.address} onChange={handleChange} className="mt-1 h-12 border-2" required />
            </div>
            <div>
              <Label htmlFor="iban" className="text-sm font-semibold">İban *</Label>
              <Input id="iban" name="iban" data-testid="register-iban-input" type="text" placeholder="TR..." value={formData.iban} onChange={handleChange} className="mt-1 h-12 border-2 font-mono" required />
            </div>
            <div>
              <Label htmlFor="plate" className="text-sm font-semibold">Plaka *</Label>
              <Input id="plate" name="plate" data-testid="register-plate-input" type="text" placeholder="34ABC123" value={formData.plate} onChange={handleChange} className="mt-1 h-12 border-2 font-mono" required />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm font-semibold">Şifre *</Label>
              <Input id="password" name="password" data-testid="register-password-input" type="password" value={formData.password} onChange={handleChange} className="mt-1 h-12 border-2" required />
            </div>
            <Button type="submit" data-testid="register-submit-btn" className="w-full h-12 font-semibold" disabled={loading}>
              {loading ? "Yükleniyor..." : "Kayıt Ol"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-center text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link to="/courier-login" className="text-primary font-semibold hover:underline" data-testid="login-link">Giriş Yap</Link>
          </p>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.
          </p>
        </div>
      </div>
      <div className="hidden lg:block lg:w-1/2 bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1586626277605-7720525d251a?crop=entropy&cs=srgb&fm=jpg&q=85')` }}>
        <div className="w-full h-full bg-primary/60 flex items-end p-12">
          <div className="text-white">
            <h2 className="font-heading text-4xl font-bold mb-2">AgrosJet</h2>
            <p className="text-white/80">Kurye Yönetim Sistemi</p>
          </div>
        </div>
      </div>
    </div>
  );
}
