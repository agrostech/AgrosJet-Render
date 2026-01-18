import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { SlidersHorizontal, Save, FileText, Cloud, Mail, HardDrive, Link2, Unlink, CheckCircle2, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp, Building2 } from "lucide-react";
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
  const [googleExpanded, setGoogleExpanded] = useState(true);

  // Google Integration States
  const [googleSettings, setGoogleSettings] = useState({
    client_id: "",
    client_secret: "",
    drive_folder_id: "",
    gmail_enabled: false,
    drive_enabled: false
  });
  const [googleStatus, setGoogleStatus] = useState({
    exists: false,
    drive_connected: false,
    gmail_connected: false,
    client_secret_masked: ""
  });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [testingDrive, setTestingDrive] = useState(false);
  const [testingGmail, setTestingGmail] = useState(false);

  // Get current domain for redirect URI display
  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://shiftjet.app';

  useEffect(() => {
    fetchCompanyInfo();
    fetchGoogleSettings();
    
    // Check for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive_connected') === 'true') {
      toast.success("Google Drive başarıyla bağlandı!");
      window.history.replaceState({}, '', window.location.pathname);
      fetchGoogleSettings();
    } else if (params.get('gmail_connected') === 'true') {
      toast.success("Gmail başarıyla bağlandı!");
      window.history.replaceState({}, '', window.location.pathname);
      fetchGoogleSettings();
    } else if (params.get('error')) {
      toast.error(`Bağlantı hatası: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
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
      toast.error("Şirket bilgileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchGoogleSettings = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/google/settings/${companyId}`);
      if (res.data.exists) {
        setGoogleSettings({
          client_id: res.data.client_id || "",
          client_secret: res.data.client_secret_masked || "",
          drive_folder_id: res.data.drive_folder_id || "",
          gmail_enabled: res.data.gmail_enabled || false,
          drive_enabled: res.data.drive_enabled || false
        });
        setGoogleStatus({
          exists: true,
          drive_connected: res.data.drive_connected,
          gmail_connected: res.data.gmail_connected,
          client_secret_masked: res.data.client_secret_masked
        });
      }
    } catch (err) {
      console.error("Google settings fetch error:", err);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}`, companyInfo);
      toast.success("Şirket bilgileri güncellendi");
    } catch (err) {
      toast.error("Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleSave = async (e) => {
    e.preventDefault();
    
    if (!googleSettings.client_id) {
      toast.error("Client ID gereklidir");
      return;
    }
    
    // Check if client_secret is new or unchanged
    const secretToSave = googleSettings.client_secret.startsWith("***") 
      ? googleSettings.client_secret 
      : googleSettings.client_secret;
    
    if (!googleStatus.exists && !googleSettings.client_secret) {
      toast.error("Client Secret gereklidir");
      return;
    }
    
    setGoogleSaving(true);
    try {
      await axios.post(`${API}/google/settings/${companyId}`, {
        ...googleSettings,
        client_secret: secretToSave
      });
      toast.success("Google ayarları kaydedildi");
      fetchGoogleSettings();
    } catch (err) {
      toast.error("Kaydetme başarısız");
    } finally {
      setGoogleSaving(false);
    }
  };

  const connectDrive = async () => {
    try {
      const res = await axios.get(`${API}/google/oauth/connect/${companyId}/drive`);
      window.location.href = res.data.authorization_url;
    } catch (err) {
      toast.error("Drive bağlantısı başlatılamadı");
    }
  };

  const connectGmail = async () => {
    try {
      const res = await axios.get(`${API}/google/oauth/connect/${companyId}/gmail`);
      window.location.href = res.data.authorization_url;
    } catch (err) {
      toast.error("Gmail bağlantısı başlatılamadı");
    }
  };

  const disconnectService = async (service) => {
    try {
      await axios.post(`${API}/google/oauth/disconnect/${companyId}/${service}`);
      toast.success(`${service === 'drive' ? 'Drive' : 'Gmail'} bağlantısı kesildi`);
      fetchGoogleSettings();
    } catch (err) {
      toast.error("Bağlantı kesilemedi");
    }
  };

  const testDriveConnection = async () => {
    setTestingDrive(true);
    try {
      const res = await axios.get(`${API}/google/test/drive/${companyId}`);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Drive bağlantı testi başarısız");
    } finally {
      setTestingDrive(false);
    }
  };

  const testGmailConnection = async () => {
    setTestingGmail(true);
    try {
      const res = await axios.get(`${API}/google/test/gmail/${companyId}`);
      toast.success(`${res.data.message} (${res.data.email})`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gmail bağlantı testi başarısız");
    } finally {
      setTestingGmail(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Header */}
      <div className="border-2 border-border bg-white p-3 md:p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center bg-slate-100">
            <SlidersHorizontal className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg md:text-xl">Sistem</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Sistem ayarları ve yönetimi</p>
          </div>
        </div>
      </div>

      {/* Şirket Fatura Bilgileri - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setCompanyExpanded(!companyExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            <h3 className="font-semibold text-sm md:text-base">Şirket Fatura Bilgileri</h3>
          </div>
          {companyExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {companyExpanded && (
          <form onSubmit={handleSave} className="p-3 md:p-4 space-y-3 md:space-y-4">
            <p className="text-xs md:text-sm text-muted-foreground">
              Bu bilgiler kuryelerin fatura talep mesajında kullanılır.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div>
                <Label className="text-xs md:text-sm font-semibold">Şirket Adı</Label>
                <Input 
                  value={companyInfo.name} 
                  onChange={(e) => setCompanyInfo({...companyInfo, name: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                  placeholder="Şirket adı"
                />
              </div>
              
              <div>
                <Label className="text-xs md:text-sm font-semibold">TCKN / VKN</Label>
                <Input 
                  value={companyInfo.tckn_vkn} 
                  onChange={(e) => setCompanyInfo({...companyInfo, tckn_vkn: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 font-mono text-sm"
                  placeholder="TC Kimlik No veya Vergi Kimlik No"
                />
              </div>
              
              <div>
                <Label className="text-xs md:text-sm font-semibold">Vergi Dairesi</Label>
                <Input 
                  value={companyInfo.tax_office} 
                  onChange={(e) => setCompanyInfo({...companyInfo, tax_office: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                  placeholder="Vergi dairesi adı"
                />
              </div>
              
              <div>
                <Label className="text-xs md:text-sm font-semibold">E-posta</Label>
                <Input 
                  type="email"
                  value={companyInfo.email} 
                  onChange={(e) => setCompanyInfo({...companyInfo, email: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                  placeholder="fatura@sirket.com"
                />
              </div>
            </div>
            
            <div>
              <Label className="text-xs md:text-sm font-semibold">Adres</Label>
              <Textarea 
                value={companyInfo.address} 
                onChange={(e) => setCompanyInfo({...companyInfo, address: e.target.value})}
                className="mt-1 border-2 min-h-[60px] md:min-h-[80px] text-sm"
                placeholder="Mahalle, Sokak, No, İlçe / İl"
              />
            </div>
            
            <div>
              <Label className="text-xs md:text-sm font-semibold">Logo URL (İsteğe bağlı)</Label>
              <Input 
                value={companyInfo.logo_url} 
                onChange={(e) => setCompanyInfo({...companyInfo, logo_url: e.target.value})}
                className="mt-1 h-10 md:h-11 border-2 text-sm"
                placeholder="https://example.com/logo.png"
              />
              {companyInfo.logo_url && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Önizleme:</span>
                  <img 
                    src={companyInfo.logo_url} 
                    alt="Logo" 
                    className="w-8 h-8 md:w-10 md:h-10 rounded object-cover border"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
            
            <div className="pt-3 md:pt-4 border-t border-border">
              <Button type="submit" disabled={saving} className="h-10 md:h-11 font-semibold text-sm">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Google Entegrasyonu - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setGoogleExpanded(!googleExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-blue-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900 text-sm md:text-base">Google Entegrasyonu</h3>
            {(googleStatus.drive_connected || googleStatus.gmail_connected) && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hidden sm:inline">
                {googleStatus.drive_connected && googleStatus.gmail_connected ? '2 Bağlı' : '1 Bağlı'}
              </span>
            )}
          </div>
          {googleExpanded ? (
            <ChevronUp className="w-5 h-5 text-blue-600" />
          ) : (
            <ChevronDown className="w-5 h-5 text-blue-600" />
          )}
        </button>
        
        {googleExpanded && (
          googleLoading ? (
            <div className="p-6 text-center text-muted-foreground">Yükleniyor...</div>
          ) : (
            <form onSubmit={handleGoogleSave} className="p-3 md:p-4 space-y-4 md:space-y-6">
              {/* Info Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4">
                <div className="flex gap-2 md:gap-3">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs md:text-sm text-blue-800 space-y-1">
                    <p className="font-medium">Google Cloud Console Kurulumu</p>
                    <ol className="list-decimal list-inside space-y-0.5 md:space-y-1 text-blue-700">
                      <li>
                        <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                          Google Cloud Console
                        </a>'a gidin
                      </li>
                      <li>Gmail API ve Drive API'yi etkinleştirin</li>
                      <li>OAuth 2.0 istemci kimliği oluşturun</li>
                      <li className="break-all">
                        <span className="hidden md:inline">Yönlendirme URI: </span>
                        <code className="bg-blue-100 px-1 rounded text-xs">{currentDomain}/api/google/oauth/callback</code>
                      </li>
                    </ol>
                    <p className="text-xs text-blue-600 mt-2">
                      💡 Her şirket kendi Google hesabını bağlayabilir. Domain değişse bile sistem otomatik uyum sağlar.
                    </p>
                  </div>
                </div>
              </div>

              {/* API Credentials */}
              <div className="space-y-3 md:space-y-4">
                <h4 className="font-medium text-xs md:text-sm text-slate-700">API Kimlik Bilgileri</h4>
                
                <div className="grid grid-cols-1 gap-3 md:gap-4">
                  <div>
                    <Label className="text-xs md:text-sm font-semibold">Client ID</Label>
                    <Input 
                      value={googleSettings.client_id}
                      onChange={(e) => setGoogleSettings({...googleSettings, client_id: e.target.value})}
                      className="mt-1 h-10 md:h-11 border-2 font-mono text-xs md:text-sm"
                      placeholder="xxxx.apps.googleusercontent.com"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs md:text-sm font-semibold">Client Secret</Label>
                    <div className="relative mt-1">
                      <Input 
                        type={showClientSecret ? "text" : "password"}
                        value={googleSettings.client_secret}
                        onChange={(e) => setGoogleSettings({...googleSettings, client_secret: e.target.value})}
                        className="h-10 md:h-11 border-2 font-mono text-xs md:text-sm pr-10"
                        placeholder={googleStatus.exists ? "Değiştirmek için yeni girin" : "GOCSPX-xxxx"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowClientSecret(!showClientSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-xs md:text-sm font-semibold">Drive Klasör ID (İsteğe bağlı)</Label>
                    <Input 
                      value={googleSettings.drive_folder_id}
                      onChange={(e) => setGoogleSettings({...googleSettings, drive_folder_id: e.target.value})}
                      className="mt-1 h-10 md:h-11 border-2 font-mono text-xs md:text-sm"
                      placeholder="Dosyaların yükleneceği klasör ID"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Boş bırakılırsa Drive kök dizinine yüklenir
                    </p>
                  </div>
                </div>
              </div>

              {/* Services */}
              <div className="space-y-3 md:space-y-4 pt-3 md:pt-4 border-t border-border">
                <h4 className="font-medium text-xs md:text-sm text-slate-700">Servisler</h4>
                
                {/* Google Drive */}
                <div className="border-2 border-border rounded-lg p-3 md:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <HardDrive className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Google Drive</p>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">Evrak/fatura otomatik yükleme</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-10 sm:ml-0">
                      <Switch 
                        checked={googleSettings.drive_enabled}
                        onCheckedChange={(checked) => setGoogleSettings({...googleSettings, drive_enabled: checked})}
                        disabled={!googleStatus.drive_connected}
                      />
                      <span className="text-xs md:text-sm text-muted-foreground">
                        {googleSettings.drive_enabled ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {googleStatus.drive_connected ? (
                      <>
                        <div className="flex items-center gap-1 text-xs md:text-sm text-green-600 bg-green-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Bağlı</span>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={testDriveConnection}
                          disabled={testingDrive}
                          className="h-7 md:h-8 text-xs md:text-sm"
                        >
                          {testingDrive ? "Test..." : "Test Et"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="h-7 md:h-8 text-xs md:text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => disconnectService('drive')}
                        >
                          <Unlink className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                          Kes
                        </Button>
                      </>
                    ) : (
                      <Button 
                        type="button" 
                        variant="outline"
                        size="sm"
                        onClick={connectDrive}
                        disabled={!googleSettings.client_id || !googleStatus.exists}
                        className="h-8 text-xs md:text-sm"
                      >
                        <Link2 className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                        Drive'a Bağlan
                      </Button>
                    )}
                  </div>
                </div>

                {/* Gmail */}
                <div className="border-2 border-border rounded-lg p-3 md:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 md:w-5 md:h-5 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm md:text-base">Gmail</p>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">E-posta bildirimleri gönder</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-10 sm:ml-0">
                      <Switch 
                        checked={googleSettings.gmail_enabled}
                        onCheckedChange={(checked) => setGoogleSettings({...googleSettings, gmail_enabled: checked})}
                        disabled={!googleStatus.gmail_connected}
                      />
                      <span className="text-xs md:text-sm text-muted-foreground">
                        {googleSettings.gmail_enabled ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {googleStatus.gmail_connected ? (
                      <>
                        <div className="flex items-center gap-1 text-xs md:text-sm text-green-600 bg-green-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                          <span>Bağlı</span>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={testGmailConnection}
                          disabled={testingGmail}
                          className="h-7 md:h-8 text-xs md:text-sm"
                        >
                          {testingGmail ? "Test..." : "Test Et"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="h-7 md:h-8 text-xs md:text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => disconnectService('gmail')}
                        >
                          <Unlink className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                          Kes
                        </Button>
                      </>
                    ) : (
                      <Button 
                        type="button" 
                        variant="outline"
                        size="sm"
                        onClick={connectGmail}
                        disabled={!googleSettings.client_id || !googleStatus.exists}
                        className="h-8 text-xs md:text-sm"
                      >
                        <Link2 className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                        Gmail'e Bağlan
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-3 md:pt-4 border-t border-border">
                <Button type="submit" disabled={googleSaving} className="h-10 md:h-11 font-semibold bg-blue-600 hover:bg-blue-700 text-sm">
                  <Save className="w-4 h-4 mr-2" />
                  {googleSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Önce kaydedin, ardından servislere bağlanın.
                </p>
              </div>
            </form>
          )
        )}
      </div>
    </div>
  );
}
