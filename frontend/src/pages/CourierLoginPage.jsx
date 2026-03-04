import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { ArrowLeft, Mail, CheckCircle, KeyRound } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

export default function CourierLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // login, register, verify, success, forgot, reset, reset-success
  const [rememberMe, setRememberMe] = useState(false);
  
  // Login form
  const [loginData, setLoginData] = useState({
    phone: "",
    password: ""
  });
  
  // Register form
  const [registerData, setRegisterData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    iban: "",
    plate: "",
    password: ""
  });
  
  // Verification (register)
  const [registrationToken, setRegistrationToken] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  
  // Forgot password
  const [forgotData, setForgotData] = useState({
    phone: "",
    email: ""
  });
  
  // Reset password
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      setLoginData(prev => ({ ...prev, phone: savedPhone }));
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
      localStorage.setItem("courierPhone", loginData.phone);
    } else {
      localStorage.removeItem("courierPhone");
    }
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/auth/courier/login`, {
        phone: loginData.phone,
        password: loginData.password
      });
      
      saveSession(res.data, rememberMe);
      toast.success("Giriş başarılı!");
      
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

  // Register handler
  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!registerData.email) {
      toast.error("E-posta adresi zorunludur");
      return;
    }
    
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/courier/register`, registerData);
      
      if (res.data.requires_verification) {
        setRegistrationToken(res.data.registration_token);
        toast.success("Doğrulama kodu e-posta adresinize gönderildi");
        setMode("verify");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kayıt başarısız");
    } finally {
      setLoading(false);
    }
  };

  // Verify handler
  const handleVerify = async (e) => {
    e.preventDefault();
    
    if (!verificationCode || verificationCode.length !== 6) {
      toast.error("6 haneli doğrulama kodunu girin");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/verify-email`, {
        email: registerData.email,
        code: verificationCode,
        registration_token: registrationToken
      });
      toast.success("Kayıt başarılı!");
      setMode("success");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Doğrulama başarısız");
    } finally {
      setLoading(false);
    }
  };

  // Resend code
  const handleResendCode = async () => {
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/courier/register`, registerData);
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

  // Forgot password handler
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    
    if (!forgotData.phone || !forgotData.email) {
      toast.error("Telefon ve e-posta gereklidir");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/forgot-password`, {
        phone: forgotData.phone,
        email: forgotData.email
      });
      toast.success("Sıfırlama kodu e-posta adresinize gönderildi");
      setMode("reset");
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  // Reset password handler
  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!resetCode) {
      toast.error("Sıfırlama kodu gereklidir");
      return;
    }
    
    if (newPassword.length < 4) {
      toast.error("Şifre en az 4 karakter olmalıdır");
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/reset-password`, {
        token: resetCode,
        new_password: newPassword
      });
      toast.success("Şifreniz başarıyla güncellendi!");
      setMode("reset-success");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Şifre sıfırlama başarısız");
    } finally {
      setLoading(false);
    }
  };

  // Resend forgot code
  const handleResendForgotCode = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/api/auth/courier/forgot-password`, {
        phone: forgotData.phone,
        email: forgotData.email
      });
      toast.success("Yeni sıfırlama kodu gönderildi");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kod gönderilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6">
      {/* Logo - Kayıt modunda gizle */}
      {mode !== "register" && (
        <div className="mb-8">
          <img 
            src="/agrosjet-login-logo.png" 
            alt="AgrosJet" 
            className="h-16 md:h-20"
          />
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm">
        
        {/* ==================== LOGIN MODE ==================== */}
        {mode === "login" && (
          <>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-300 font-medium">
                  Telefon No
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="05XXXXXXXXX"
                  value={loginData.phone}
                  onChange={(e) => setLoginData({ ...loginData, phone: e.target.value })}
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
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  className="h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
                  required
                  data-testid="courier-password-input"
                />
              </div>

              <div className="flex items-center justify-between">
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
                <button 
                  type="button"
                  onClick={() => {
                    setForgotData({ phone: loginData.phone, email: "" });
                    setMode("forgot");
                  }}
                  className="text-sm text-orange-500 hover:underline"
                  data-testid="forgot-password-link"
                >
                  Şifremi unuttum?
                </button>
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

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-400 mb-3">Hesabınız yok mu?</p>
              <Button 
                variant="outline"
                onClick={() => setMode("register")}
                className="w-full h-11 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
                data-testid="goto-register-btn"
              >
                Yeni Kurye Kaydı
              </Button>
            </div>
          </>
        )}

        {/* ==================== REGISTER MODE ==================== */}
        {mode === "register" && (
          <>
            <button
              onClick={() => setMode("login")}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Giriş sayfasına dön
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Kurye Kaydı</h2>
            <p className="text-slate-400 text-sm mb-6">Bilgilerinizi doldurun</p>

            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <Label className="text-slate-300 text-sm">İsim Soyisim *</Label>
                <Input
                  type="text"
                  placeholder="Adı Soyadı"
                  value={registerData.name}
                  onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  required
                  data-testid="register-name-input"
                />
              </div>
              
              <div>
                <Label className="text-slate-300 text-sm">Telefon No *</Label>
                <Input
                  type="tel"
                  placeholder="05XXXXXXXXX"
                  value={registerData.phone}
                  onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                  className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  maxLength={11}
                  required
                  data-testid="register-phone-input"
                />
              </div>
              
              <div>
                <Label className="text-slate-300 text-sm">E-posta *</Label>
                <Input
                  type="email"
                  placeholder="ornek@email.com"
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  required
                  data-testid="register-email-input"
                />
                <p className="text-xs text-slate-500 mt-1">Doğrulama kodu bu adrese gelecek</p>
              </div>
              
              <div>
                <Label className="text-slate-300 text-sm">Adres *</Label>
                <Input
                  type="text"
                  placeholder="Adresiniz"
                  value={registerData.address}
                  onChange={(e) => setRegisterData({ ...registerData, address: e.target.value })}
                  className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  required
                  data-testid="register-address-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-sm">IBAN *</Label>
                  <Input
                    type="text"
                    placeholder="TR..."
                    value={registerData.iban}
                    onChange={(e) => setRegisterData({ ...registerData, iban: e.target.value })}
                    className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 font-mono text-sm"
                    required
                    data-testid="register-iban-input"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Plaka *</Label>
                  <Input
                    type="text"
                    placeholder="34ABC01"
                    value={registerData.plate}
                    onChange={(e) => setRegisterData({ ...registerData, plate: e.target.value })}
                    className="mt-1 h-11 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500 font-mono"
                    required
                    data-testid="register-plate-input"
                  />
                </div>
              </div>
              
              <div>
                <Label className="text-slate-300 text-sm">Şifre *</Label>
                <Input
                  type="password"
                  value={registerData.password}
                  onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                  className="mt-1 h-11 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
                  required
                  data-testid="register-password-input"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white mt-4"
                disabled={loading}
                data-testid="register-submit-btn"
              >
                {loading ? "Gönderiliyor..." : "Doğrulama Kodu Gönder"}
              </Button>
            </form>
          </>
        )}

        {/* ==================== VERIFY MODE (Register) ==================== */}
        {mode === "verify" && (
          <>
            <button
              onClick={() => setMode("register")}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Geri Dön
            </button>

            <div className="w-14 h-14 bg-orange-500/20 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-7 h-7 text-orange-500" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1">E-posta Doğrulama</h2>
            <p className="text-slate-400 text-sm mb-6">
              <span className="text-white font-medium">{registerData.email}</span> adresine gönderilen 6 haneli kodu girin.
            </p>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Input
                  type="text"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-14 bg-slate-800 border-slate-600 text-white text-center text-2xl tracking-[0.5em] font-mono focus:border-orange-500"
                  maxLength={6}
                  required
                  data-testid="verify-code-input"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
                disabled={loading}
                data-testid="verify-submit-btn"
              >
                {loading ? "Doğrulanıyor..." : "Kaydı Tamamla"}
              </Button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="w-full text-sm text-slate-400 hover:text-orange-500"
              >
                Kod gelmedi mi? Tekrar gönder
              </button>
            </form>
          </>
        )}

        {/* ==================== SUCCESS MODE (Register) ==================== */}
        {mode === "success" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Kayıt Tamamlandı!</h2>
            <p className="text-slate-400 text-sm mb-6">
              E-posta adresiniz doğrulandı. Artık giriş yapabilirsiniz.
            </p>
            <Button 
              onClick={() => {
                setLoginData({ phone: registerData.phone, password: "" });
                setMode("login");
              }}
              className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
              data-testid="goto-login-btn"
            >
              Giriş Yap
            </Button>
          </div>
        )}

        {/* ==================== FORGOT PASSWORD MODE ==================== */}
        {mode === "forgot" && (
          <>
            <button
              onClick={() => setMode("login")}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Giriş sayfasına dön
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Şifremi Unuttum</h2>
            <p className="text-slate-400 text-sm mb-6">
              Kayıtlı telefon numaranızı ve e-posta adresinizi girin.
            </p>

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <Label className="text-slate-300 text-sm">Telefon No</Label>
                <Input
                  type="tel"
                  placeholder="05XXXXXXXXX"
                  value={forgotData.phone}
                  onChange={(e) => setForgotData({ ...forgotData, phone: e.target.value })}
                  className="mt-1 h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
                  required
                  data-testid="forgot-phone-input"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-sm">E-posta Adresi</Label>
                <Input
                  type="email"
                  placeholder="ornek@email.com"
                  value={forgotData.email}
                  onChange={(e) => setForgotData({ ...forgotData, email: e.target.value })}
                  className="mt-1 h-12 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:border-orange-500"
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

        {/* ==================== RESET PASSWORD MODE ==================== */}
        {mode === "reset" && (
          <>
            <button
              onClick={() => setMode("forgot")}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Geri Dön
            </button>

            <div className="w-14 h-14 bg-orange-500/20 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-7 h-7 text-orange-500" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Şifre Sıfırlama</h2>
            <p className="text-slate-400 text-sm mb-6">
              E-posta adresinize gönderilen 6 haneli kodu girin ve yeni şifrenizi belirleyin.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label className="text-slate-300 text-sm">Sıfırlama Kodu</Label>
                <Input
                  type="text"
                  placeholder="000000"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="mt-1 h-14 bg-slate-800 border-slate-600 text-white text-center text-2xl tracking-[0.5em] font-mono focus:border-orange-500"
                  maxLength={6}
                  required
                  data-testid="reset-code-input"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-sm">Yeni Şifre</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
                  required
                  data-testid="reset-password-input"
                />
              </div>

              <div>
                <Label className="text-slate-300 text-sm">Şifre Tekrar</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 h-12 bg-slate-800 border-slate-600 text-white focus:border-orange-500"
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
                onClick={handleResendForgotCode}
                disabled={loading}
                className="w-full text-sm text-slate-400 hover:text-orange-500"
              >
                Kodu almadınız mı? Tekrar gönder
              </button>
            </form>
          </>
        )}

        {/* ==================== RESET SUCCESS MODE ==================== */}
        {mode === "reset-success" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Şifre Güncellendi!</h2>
            <p className="text-slate-400 text-sm mb-6">
              Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.
            </p>
            <Button 
              onClick={() => {
                setLoginData({ phone: forgotData.phone, password: "" });
                setMode("login");
              }}
              className="w-full h-12 font-semibold bg-[#e13c10] hover:bg-[#c53510] text-white"
              data-testid="goto-login-btn"
            >
              Giriş Yap
            </Button>
          </div>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          © 2026 AgrosJet. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
