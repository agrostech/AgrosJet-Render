import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: form, 2: verify, 3: success
  const [registrationToken, setRegistrationToken] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    tc_no: "",
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
    
    if (!formData.email) {
      toast.error("E-posta adresi zorunludur");
      return;
    }
    
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/courier/register`, formData);
      
      if (res.data.requires_verification) {
        setRegistrationToken(res.data.registration_token);
        toast.success("Doğrulama kodu e-posta adresinize gönderildi");
        setStep(2);
      } else {
        toast.success("Kayıt başarılı!");
        navigate("/courier-login");
      }
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kayıt başarısız");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error("6 haneli doğrulama kodunu girin");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/auth/courier/verify-email`, {
        email: formData.email,
        code: verificationCode,
        registration_token: registrationToken
      });
      toast.success("Kayıt başarılı!");
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Doğrulama başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/auth/courier/register`, formData);
      if (res.data.registration_token) {
        setRegistrationToken(res.data.registration_token);
        toast.success("Yeni doğrulama kodu gönderildi");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kod gönderilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white">
        <div className="w-full max-w-md">
          
          {/* Step 1: Registration Form */}
          {step === 1 && (
            <>
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
                  <Label htmlFor="email" className="text-sm font-semibold">E-posta *</Label>
                  <Input id="email" name="email" data-testid="register-email-input" type="email" placeholder="ornek@email.com" value={formData.email} onChange={handleChange} className="mt-1 h-12 border-2" required />
                  <p className="text-xs text-muted-foreground mt-1">Doğrulama kodu bu adrese gönderilecek</p>
                </div>
                <div>
                  <Label htmlFor="tc_no" className="text-sm font-semibold">TC Kimlik No *</Label>
                  <Input id="tc_no" name="tc_no" data-testid="register-tc-input" type="text" placeholder="11 haneli TC Kimlik No" value={formData.tc_no} onChange={(e) => setFormData({...formData, tc_no: e.target.value.replace(/\D/g, '').slice(0, 11)})} className="mt-1 h-12 border-2 font-mono" maxLength={11} required />
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
                  {loading ? "Gönderiliyor..." : "Doğrulama Kodu Gönder"}
                </Button>
              </form>

              <p className="mt-4 text-sm text-center text-muted-foreground">
                Zaten hesabınız var mı?{" "}
                <Link to="/courier-login" className="text-primary font-semibold hover:underline" data-testid="login-link">Giriş Yap</Link>
              </p>
            </>
          )}

          {/* Step 2: Email Verification */}
          {step === 2 && (
            <>
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Geri Dön
              </button>

              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-primary" />
              </div>

              <h1 className="font-heading text-2xl md:text-3xl font-bold tracking-tight mb-2">
                E-posta Doğrulama
              </h1>
              <p className="text-muted-foreground text-sm mb-6">
                <span className="font-medium text-foreground">{formData.email}</span> adresine gönderilen 6 haneli kodu girin.
              </p>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <Label htmlFor="code" className="text-sm font-semibold">Doğrulama Kodu</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="mt-1 h-14 border-2 text-center text-2xl tracking-[0.5em] font-mono"
                    maxLength={6}
                    required
                    data-testid="verify-code-input"
                  />
                </div>

                <Button type="submit" className="w-full h-12 font-semibold" disabled={loading} data-testid="verify-submit-btn">
                  {loading ? "Doğrulanıyor..." : "Kaydı Tamamla"}
                </Button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="w-full text-sm text-muted-foreground hover:text-primary"
                >
                  Kod gelmedi mi? Tekrar gönder
                </button>
              </form>
            </>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="font-heading text-2xl font-bold mb-2">Kayıt Tamamlandı!</h1>
              <p className="text-muted-foreground text-sm mb-6">
                E-posta adresiniz doğrulandı ve kaydınız tamamlandı. Şimdi giriş yapabilirsiniz.
              </p>
              <Button 
                onClick={() => navigate("/courier-login")}
                className="w-full h-12 font-semibold"
                data-testid="goto-login-btn"
              >
                Giriş Yap
              </Button>
            </div>
          )}

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
