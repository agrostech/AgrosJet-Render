import { useState, useEffect } from "react";
import { useNavigate, Link, useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { companyId } = useParams();
  const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    iban: "",
    plate: "",
    password: "",
  });

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    }
  }, [companyId]);

  const fetchCompany = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompany(res.data);
    } catch (err) {
      toast.error("Şirket bulunamadı");
      navigate("/login");
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/auth/courier/register`, {
        ...formData,
        company_id: companyId
      });
      toast.success("Kayıt başarılı! Onay bekleniyor.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kayıt başarısız");
    } finally {
      setLoading(false);
    }
  };

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          {/* Logo */}
          {company.logo_url ? (
            <img 
              src={company.logo_url} 
              alt={company.name} 
              className="h-16 mb-6 object-contain"
              data-testid="company-logo"
            />
          ) : (
            <div className="h-16 mb-6 flex items-center">
              <span className="font-heading text-2xl font-bold uppercase tracking-tight text-primary">
                {company.name}
              </span>
            </div>
          )}

          <h1 className="font-heading text-3xl md:text-4xl font-bold uppercase tracking-tight mb-2">
            KURYE KAYIT
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            {company.name} için kurye olarak kayıt olun
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="uppercase text-xs font-bold tracking-wider">
                İsim Soyisim
              </Label>
              <Input
                id="name"
                name="name"
                data-testid="register-name-input"
                type="text"
                placeholder="Adı Soyadı"
                value={formData.name}
                onChange={handleChange}
                className="mt-1 h-12 border-2"
                required
              />
            </div>

            <div>
              <Label htmlFor="phone" className="uppercase text-xs font-bold tracking-wider">
                Telefon No
              </Label>
              <Input
                id="phone"
                name="phone"
                data-testid="register-phone-input"
                type="tel"
                placeholder="05XX XXX XX XX"
                value={formData.phone}
                onChange={handleChange}
                className="mt-1 h-12 border-2"
                required
              />
            </div>

            <div>
              <Label htmlFor="address" className="uppercase text-xs font-bold tracking-wider">
                Adres
              </Label>
              <Input
                id="address"
                name="address"
                data-testid="register-address-input"
                type="text"
                placeholder="Adresiniz"
                value={formData.address}
                onChange={handleChange}
                className="mt-1 h-12 border-2"
                required
              />
            </div>

            <div>
              <Label htmlFor="iban" className="uppercase text-xs font-bold tracking-wider">
                IBAN
              </Label>
              <Input
                id="iban"
                name="iban"
                data-testid="register-iban-input"
                type="text"
                placeholder="TR..."
                value={formData.iban}
                onChange={handleChange}
                className="mt-1 h-12 border-2 font-mono"
                required
              />
            </div>

            <div>
              <Label htmlFor="plate" className="uppercase text-xs font-bold tracking-wider">
                Plaka
              </Label>
              <Input
                id="plate"
                name="plate"
                data-testid="register-plate-input"
                type="text"
                placeholder="34 ABC 123"
                value={formData.plate}
                onChange={handleChange}
                className="mt-1 h-12 border-2 font-mono uppercase"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="uppercase text-xs font-bold tracking-wider">
                Şifre
              </Label>
              <Input
                id="password"
                name="password"
                data-testid="register-password-input"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="mt-1 h-12 border-2"
                required
              />
            </div>

            <Button
              type="submit"
              data-testid="register-submit-btn"
              className="w-full h-12 uppercase font-bold tracking-wider"
              disabled={loading}
            >
              {loading ? "YÜKLENİYOR..." : "KAYIT OL"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-center text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline" data-testid="login-link">
              Giriş Yap
            </Link>
          </p>
        </div>
      </div>

      {/* Right - Image (hidden on mobile) */}
      <div
        className="hidden lg:block lg:w-1/2 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1586626277605-7720525d251a?crop=entropy&cs=srgb&fm=jpg&q=85')`,
        }}
      >
        <div className="w-full h-full bg-primary/60 flex items-end p-12">
          <div className="text-white">
            <h2 className="font-heading text-4xl font-bold uppercase mb-2">
              EKİBİMİZE KATILIN
            </h2>
            <p className="text-white/80">
              Kurye olarak çalışmaya başlayın
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
