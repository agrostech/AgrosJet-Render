import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowLeft, Mail, KeyRound, CheckCircle } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CourierForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: request, 2: verify, 3: success
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    phone: "",
    email: "",
    code: "",
    newPassword: "",
    confirmPassword: ""
  });

  const handleRequestReset = async (e) => {
    e.preventDefault();
    
    if (!formData.phone || !formData.email) {
      toast.error("Telefon ve e-posta gereklidir");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/forgot-password`, {
        phone: formData.phone,
        email: formData.email
      });
      toast.success("Sıfırlama kodu e-posta adresinize gönderildi");
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!formData.code) {
      toast.error("Sıfırlama kodu gereklidir");
      return;
    }
    
    if (formData.newPassword.length < 4) {
      toast.error("Şifre en az 4 karakter olmalıdır");
      return;
    }
    
    if (formData.newPassword !== formData.confirmPassword) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/reset-password`, {
        token: formData.code,
        new_password: formData.newPassword
      });
      toast.success("Şifreniz başarıyla güncellendi!");
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Şifre sıfırlama başarısız");
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

      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Back Link */}
        <Link 
          to="/courier-login" 
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Giriş sayfasına dön
        </Link>

        {/* Step 1: Request Reset */}
        {step === 1 && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Şifremi Unuttum</h1>
              <p className="text-slate-400 text-sm">
                Kayıtlı telefon numaranızı ve e-posta adresinizi girin. Size sıfırlama kodu göndereceğiz.
              </p>
            </div>

            <form onSubmit={handleRequestReset} className="space-y-4">
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
                  data-testid="forgot-phone-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 font-medium">
                  E-posta Adresi
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  required
                  data-testid="forgot-email-input"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
                disabled={loading}
                data-testid="forgot-submit-btn"
              >
                <Mail className="w-4 h-4 mr-2" />
                {loading ? "Gönderiliyor..." : "Sıfırlama Kodu Gönder"}
              </Button>
            </form>
          </>
        )}

        {/* Step 2: Verify Code & New Password */}
        {step === 2 && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">Şifre Sıfırlama</h1>
              <p className="text-slate-400 text-sm">
                E-posta adresinize gönderilen 6 haneli kodu girin ve yeni şifrenizi belirleyin.
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-300 font-medium">
                  Sıfırlama Kodu
                </Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="6 haneli kod"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 text-center text-xl tracking-widest font-mono"
                  maxLength={6}
                  required
                  data-testid="reset-code-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-slate-300 font-medium">
                  Yeni Şifre
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={formData.newPassword}
                  onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                  className="h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
                  required
                  data-testid="reset-password-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-300 font-medium">
                  Şifre Tekrar
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
                  required
                  data-testid="reset-confirm-input"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
                disabled={loading}
                data-testid="reset-submit-btn"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                {loading ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </Button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-sm text-slate-400 hover:text-white"
              >
                Kodu almadınız mı? Tekrar gönder
              </button>
            </form>
          </>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Şifre Güncellendi!</h1>
            <p className="text-slate-400 text-sm mb-6">
              Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
            </p>
            <Button 
              onClick={() => navigate("/courier-login")}
              className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
              data-testid="goto-login-btn"
            >
              Giriş Yap
            </Button>
          </div>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500">
          © 2026 AgrosJet. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
