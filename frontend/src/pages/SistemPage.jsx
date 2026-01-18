import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { SlidersHorizontal, Save, Mail, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SistemPage({ companyId }) {
  const [companyInfo, setCompanyInfo] = useState({
    name: "",
    logo_url: "",
    tckn_vkn: "",
    address: "",
    tax_office: "",
    email: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyExpanded, setCompanyExpanded] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);

  // Email (SMTP) Settings States
  const [emailSettings, setEmailSettings] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    from_email: "",
    from_name: "ShiftJet",
    enabled: true,
    // Bildirim türleri
    notify_muhasebe: true,
    notify_zimmet: true,
    notify_evrak: true,
    notify_jetpuan: true,
    notify_fesih: true
  });
  const [emailStatus, setEmailStatus] = useState({ exists: false });
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  useEffect(() => {
    fetchCompanyInfo();
    fetchEmailSettings();
  }, [companyId]);

  const fetchCompanyInfo = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyInfo({
        name: res.data.name || "",
        logo_url: res.data.logo_url || "",
        tckn_vkn: res.data.tckn_vkn || "",
        address: res.data.address || "",
        tax_office: res.data.tax_office || "",
        email: res.data.email || ""
      });
    } catch (err) {
      console.error("Şirket bilgileri yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailSettings = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/email/settings/${companyId}`);
      if (res.data.exists) {
        setEmailSettings({
          smtp_host: res.data.smtp_host || "",
          smtp_port: res.data.smtp_port || 587,
          smtp_user: res.data.smtp_user || "",
          smtp_password: res.data.smtp_password_masked || "",
          from_email: res.data.from_email || "",
          from_name: res.data.from_name || "ShiftJet",
          enabled: res.data.enabled !== false,
          notify_muhasebe: res.data.notify_muhasebe !== false,
          notify_zimmet: res.data.notify_zimmet !== false,
          notify_evrak: res.data.notify_evrak !== false,
          notify_jetpuan: res.data.notify_jetpuan !== false,
          notify_fesih: res.data.notify_fesih !== false
        });
        setEmailStatus({ exists: true });
      }
    } catch (err) {
      console.error("Email settings fetch error:", err);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailSave = async (e) => {
    e.preventDefault();
    
    if (!emailSettings.smtp_host || !emailSettings.smtp_user) {
      toast.error("SMTP sunucu ve kullanıcı adı gereklidir");
      return;
    }
    
    if (!emailStatus.exists && !emailSettings.smtp_password) {
      toast.error("SMTP şifresi gereklidir");
      return;
    }
    
    setEmailSaving(true);
    try {
      await axios.post(`${API}/email/settings/${companyId}`, emailSettings);
      toast.success("E-posta ayarları kaydedildi");
      fetchEmailSettings();
    } catch (err) {
      toast.error("Kaydetme başarısız");
    } finally {
      setEmailSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await axios.post(`${API}/email/test/${companyId}`);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Test başarısız");
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}`, companyInfo);
      toast.success("Şirket bilgileri güncellendi");
    } catch (err) {
      toast.error("Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4 md:space-y-6" data-testid="sistem-page">
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="w-5 h-5 md:w-6 md:h-6 text-primary" />
        <h2 className="font-heading text-lg md:text-xl font-bold tracking-tight">Sistem Ayarları</h2>
      </div>

      {/* Şirket Fatura Bilgileri - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setCompanyExpanded(!companyExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
            <h3 className="font-semibold text-sm md:text-base">Şirket Fatura Bilgileri</h3>
          </div>
          {companyExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {companyExpanded && (
          <form onSubmit={handleSave} className="p-3 md:p-4 space-y-4 md:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <Label className="text-xs md:text-sm font-semibold">Şirket Adı</Label>
                <Input 
                  value={companyInfo.name} 
                  onChange={(e) => setCompanyInfo({...companyInfo, name: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">Logo URL</Label>
                <Input 
                  value={companyInfo.logo_url} 
                  onChange={(e) => setCompanyInfo({...companyInfo, logo_url: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">TCKN / VKN</Label>
                <Input 
                  value={companyInfo.tckn_vkn} 
                  onChange={(e) => setCompanyInfo({...companyInfo, tckn_vkn: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                  placeholder="Vergi veya kimlik numarası"
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">Vergi Dairesi</Label>
                <Input 
                  value={companyInfo.tax_office} 
                  onChange={(e) => setCompanyInfo({...companyInfo, tax_office: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">E-posta</Label>
                <Input 
                  type="email"
                  value={companyInfo.email} 
                  onChange={(e) => setCompanyInfo({...companyInfo, email: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs md:text-sm font-semibold">Adres</Label>
                <Textarea 
                  value={companyInfo.address} 
                  onChange={(e) => setCompanyInfo({...companyInfo, address: e.target.value})}
                  className="mt-1 border-2 min-h-[80px] text-sm"
                />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="h-10 md:h-11 font-semibold text-sm">
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        )}
      </div>

      {/* E-posta (SMTP) Ayarları - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setEmailExpanded(!emailExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
            <h3 className="font-semibold text-sm md:text-base">E-posta Bildirimleri (SMTP)</h3>
            {emailStatus.exists && emailSettings.enabled && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hidden sm:inline">
                Aktif
              </span>
            )}
          </div>
          {emailExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {emailExpanded && (
          emailLoading ? (
            <div className="py-8"><LoadingSpinner size="default" /></div>
          ) : (
            <form onSubmit={handleEmailSave} className="p-3 md:p-4 space-y-4 md:space-y-6">
              {/* Info Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4">
                <div className="flex gap-2 md:gap-3">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs md:text-sm text-amber-800">
                    <p className="font-medium mb-1">E-posta bildirimleri nereye gönderilir?</p>
                    <p>Tüm bildirimler (hakediş, zimmet, evrak, fesih vb.) <strong>Süper Admin</strong> e-posta adresine gönderilir.</p>
                    <p className="mt-1 text-amber-600">Süper admin e-posta adresini Profil sayfasından güncelleyebilirsiniz.</p>
                  </div>
                </div>
              </div>

              {/* Enable/Disable Switch */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">E-posta Bildirimleri</p>
                  <p className="text-xs text-muted-foreground">Tüm bildirimler e-posta olarak gönderilsin</p>
                </div>
                <Switch 
                  checked={emailSettings.enabled}
                  onCheckedChange={(checked) => setEmailSettings({...emailSettings, enabled: checked})}
                />
              </div>

              {/* SMTP Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <Label className="text-xs md:text-sm font-semibold">SMTP Sunucu *</Label>
                  <Input 
                    value={emailSettings.smtp_host} 
                    onChange={(e) => setEmailSettings({...emailSettings, smtp_host: e.target.value})}
                    className="mt-1 h-10 md:h-11 border-2 text-sm"
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <Label className="text-xs md:text-sm font-semibold">Port</Label>
                  <Input 
                    type="number"
                    value={emailSettings.smtp_port} 
                    onChange={(e) => setEmailSettings({...emailSettings, smtp_port: parseInt(e.target.value) || 587})}
                    className="mt-1 h-10 md:h-11 border-2 text-sm"
                    placeholder="587"
                  />
                </div>
                <div>
                  <Label className="text-xs md:text-sm font-semibold">SMTP Kullanıcı Adı *</Label>
                  <Input 
                    value={emailSettings.smtp_user} 
                    onChange={(e) => setEmailSettings({...emailSettings, smtp_user: e.target.value})}
                    className="mt-1 h-10 md:h-11 border-2 text-sm"
                    placeholder="email@sirket.com"
                  />
                </div>
                <div>
                  <Label className="text-xs md:text-sm font-semibold">SMTP Şifresi *</Label>
                  <div className="relative mt-1">
                    <Input 
                      type={showSmtpPassword ? "text" : "password"}
                      value={emailSettings.smtp_password} 
                      onChange={(e) => setEmailSettings({...emailSettings, smtp_password: e.target.value})}
                      className="h-10 md:h-11 border-2 pr-10 text-sm"
                      placeholder={emailStatus.exists ? "••••••••" : "Şifre girin"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                      onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    >
                      {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Gmail için App Password kullanın</p>
                </div>
                <div>
                  <Label className="text-xs md:text-sm font-semibold">Gönderici E-posta</Label>
                  <Input 
                    value={emailSettings.from_email} 
                    onChange={(e) => setEmailSettings({...emailSettings, from_email: e.target.value})}
                    className="mt-1 h-10 md:h-11 border-2 text-sm"
                    placeholder="Boş bırakılırsa SMTP kullanıcısı kullanılır"
                  />
                </div>
                <div>
                  <Label className="text-xs md:text-sm font-semibold">Gönderici Adı</Label>
                  <Input 
                    value={emailSettings.from_name} 
                    onChange={(e) => setEmailSettings({...emailSettings, from_name: e.target.value})}
                    className="mt-1 h-10 md:h-11 border-2 text-sm"
                    placeholder="ShiftJet"
                  />
                </div>
              </div>

              {/* Test & Save */}
              <div className="pt-3 md:pt-4 border-t border-border flex flex-wrap gap-2">
                <Button type="submit" disabled={emailSaving} className="h-10 md:h-11 font-semibold text-sm">
                  <Save className="w-4 h-4 mr-2" />
                  {emailSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
                {emailStatus.exists && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleTestEmail}
                    disabled={testingEmail}
                    className="h-10 md:h-11 text-sm"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {testingEmail ? "Gönderiliyor..." : "Test E-postası Gönder"}
                  </Button>
                )}
              </div>
            </form>
          )
        )}
      </div>
    </div>
  );
}
