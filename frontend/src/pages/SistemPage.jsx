import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { SlidersHorizontal, Save, Mail, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp, Building2, Download, Clock, Send, HardDrive, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageLoading, LoadingSpinner } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";

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
    from_name: "AgrosJet",
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

  // Backup Settings States
  const [backupExpanded, setBackupExpanded] = useState(false);
  const [backupSettings, setBackupSettings] = useState({
    enabled: false,
    hour: 3,
    email: ""
  });
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupSaving, setBackupSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingBackup, setSendingBackup] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const backupFileRef = useRef(null);

  // Working Hours Settings
  const [workingHoursExpanded, setWorkingHoursExpanded] = useState(false);
  const [workingHours, setWorkingHours] = useState({
    opening_time: "09:00",
    closing_time: "22:00"
  });
  const [workingHoursSaving, setWorkingHoursSaving] = useState(false);

  // Auto Dispatch Settings
  const [autoDispatchExpanded, setAutoDispatchExpanded] = useState(false);
  const [autoDispatchSettings, setAutoDispatchSettings] = useState({
    enabled: false,
    distance_tolerance: 500,
    max_wait_time: 5,
    fairness_threshold: 200,
    fairness_enabled: false,
    max_detour: 700,
    same_location_radius: 30,
    same_location_max_packages: 10,
    angle_check_enabled: true,
    angle_skip_distance: 1000,
    max_angle_diff: 90,
    detour_check_enabled: true,
    detour_skip_distance: 500
  });
  const [autoDispatchLoading, setAutoDispatchLoading] = useState(true);
  const [autoDispatchSaving, setAutoDispatchSaving] = useState(false);

  useEffect(() => {
    fetchCompanyInfo();
    fetchEmailSettings();
    fetchBackupSettings();
    fetchWorkingHours();
    fetchAutoDispatchSettings();
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
          from_name: res.data.from_name || "AgrosJet",
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
      if (!err.handled) {
        toast.error("Kaydetme başarısız");
      }
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
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Test başarısız");
      }
    } finally {
      setTestingEmail(false);
    }
  };

  // Backup functions
  const fetchBackupSettings = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/backup/company/${companyId}/schedule`);
      setBackupSettings({
        enabled: res.data.enabled || false,
        hour: res.data.hour ?? 3,
        email: res.data.email || ""
      });
    } catch (err) {
      console.error("Backup settings fetch error:", err);
    } finally {
      setBackupLoading(false);
    }
  };

  // Working Hours Functions
  const fetchWorkingHours = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/working-hours`);
      setWorkingHours({
        opening_time: res.data.opening_time || "09:00",
        closing_time: res.data.closing_time || "22:00"
      });
    } catch (err) {
      console.error("Working hours fetch error:", err);
    }
  };

  const handleWorkingHoursSave = async () => {
    setWorkingHoursSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}/working-hours`, workingHours);
      toast.success("Çalışma saatleri kaydedildi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Kaydetme başarısız");
      }
    } finally {
      setWorkingHoursSaving(false);
    }
  };

  // Auto Dispatch Functions
  const fetchAutoDispatchSettings = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/auto-dispatch/settings/${companyId}`);
      setAutoDispatchSettings({
        enabled: res.data.enabled || false,
        distance_tolerance: res.data.distance_tolerance || 500,
        max_wait_time: res.data.max_wait_time || 5,
        fairness_threshold: res.data.fairness_threshold || 200,
        fairness_enabled: res.data.fairness_enabled || false,
        max_detour: res.data.max_detour || 700,
        same_location_radius: res.data.same_location_radius || 30,
        same_location_max_packages: res.data.same_location_max_packages || 10,
        angle_check_enabled: res.data.angle_check_enabled !== false,
        angle_skip_distance: res.data.angle_skip_distance || 1000,
        max_angle_diff: res.data.max_angle_diff || 90,
        detour_check_enabled: res.data.detour_check_enabled !== false,
        detour_skip_distance: res.data.detour_skip_distance || 500
      });
    } catch (err) {
      console.error("Auto dispatch settings fetch error:", err);
    } finally {
      setAutoDispatchLoading(false);
    }
  };

  const handleAutoDispatchSave = async () => {
    setAutoDispatchSaving(true);
    try {
      await axios.put(`${API}/auto-dispatch/settings/${companyId}`, autoDispatchSettings);
      toast.success("Otomatik atama ayarları kaydedildi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Kaydetme başarısız");
      }
    } finally {
      setAutoDispatchSaving(false);
    }
  };

  const handleBackupSave = async () => {
    if (backupSettings.enabled && !backupSettings.email) {
      toast.error("Otomatik yedekleme için e-posta adresi gerekli");
      return;
    }
    
    setBackupSaving(true);
    try {
      await axios.post(`${API}/backup/company/${companyId}/schedule`, backupSettings);
      toast.success("Yedekleme ayarları kaydedildi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Kaydetme başarısız");
      }
    } finally {
      setBackupSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(`${API}/backup/company/${companyId}/export`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `yedek_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Yedek indirildi");
    } catch (err) {
      if (!err.handled) {
        toast.error("İndirme başarısız");
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleSendBackupNow = async () => {
    if (!backupSettings.email) {
      toast.error("Önce e-posta adresi kaydedin");
      return;
    }
    
    setSendingBackup(true);
    try {
      await axios.post(`${API}/backup/company/${companyId}/send-now`);
      toast.success("Yedek e-postası gönderiliyor");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gönderme başarısız");
    } finally {
      setSendingBackup(false);
    }
  };

  const handleUploadBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.zip')) {
      toast.error("Sadece ZIP dosyası yüklenebilir");
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(
        `${API}/backup/company/${companyId}/import?replace_existing=${replaceExisting}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      const result = response.data;
      const restoredCount = Object.keys(result.restored_collections || {}).length;
      
      toast.success(`Yedek yüklendi! ${restoredCount} koleksiyon geri yüklendi.`);
      
      // Sayfayı yenile
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yükleme başarısız");
    } finally {
      setUploading(false);
      if (backupFileRef.current) {
        backupFileRef.current.value = '';
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}`, companyInfo);
      toast.success("Şirket bilgileri güncellendi");
    } catch (err) {
      if (!err.handled) {
        toast.error("Kayıt başarısız");
      }
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

      {/* Çalışma Saatleri - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setWorkingHoursExpanded(!workingHoursExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
            <h3 className="font-semibold text-sm md:text-base">Çalışma Saatleri</h3>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full hidden sm:inline">
              {workingHours.opening_time} - {workingHours.closing_time}
            </span>
          </div>
          {workingHoursExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {workingHoursExpanded && (
          <div className="p-3 md:p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Şirketinizin çalışma saatlerini belirleyin. Bu saatler raporlarda varsayılan olarak kullanılacaktır.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs md:text-sm font-semibold">Açılış Saati</Label>
                <Input 
                  type="time"
                  value={workingHours.opening_time}
                  onChange={(e) => setWorkingHours({...workingHours, opening_time: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">Kapanış Saati</Label>
                <Input 
                  type="time"
                  value={workingHours.closing_time}
                  onChange={(e) => setWorkingHours({...workingHours, closing_time: e.target.value})}
                  className="mt-1 h-10 md:h-11 border-2 text-sm"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleWorkingHoursSave} 
              disabled={workingHoursSaving} 
              className="h-10 md:h-11 font-semibold text-sm"
            >
              <Save className="w-4 h-4 mr-2" />
              {workingHoursSaving ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        )}
      </div>

      {/* Otomatik Atama Ayarları - Collapsible */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setAutoDispatchExpanded(!autoDispatchExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
            <h3 className="font-semibold text-sm md:text-base">Otomatik Atama</h3>
            {autoDispatchSettings.enabled && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hidden sm:inline">
                Aktif
              </span>
            )}
          </div>
          {autoDispatchExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {autoDispatchExpanded && (
          autoDispatchLoading ? (
            <div className="py-8"><LoadingSpinner size="default" /></div>
          ) : (
            <div className="p-3 md:p-4 space-y-4 md:space-y-6">
              {/* Info Banner */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 md:p-4">
                <div className="flex gap-2 md:gap-3">
                  <Zap className="w-4 h-4 md:w-5 md:h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs md:text-sm text-orange-800">
                    <p className="font-medium mb-1">Otomatik Atama Sistemi</p>
                    <p>Hazır siparişler, kuryelere mesafe ve kapasite durumuna göre otomatik atanır.</p>
                    <p className="mt-1">Sistem her 30 saniyede bir kontrol yapar.</p>
                  </div>
                </div>
              </div>

              {/* Enable/Disable Switch */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">Otomatik Atama</p>
                  <p className="text-xs text-muted-foreground">Hazır siparişleri otomatik olarak kuryelere ata</p>
                </div>
                <Switch 
                  checked={autoDispatchSettings.enabled}
                  onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, enabled: checked }))}
                />
              </div>

              {autoDispatchSettings.enabled && (
                <div className="space-y-4 border-t pt-4">
                  {/* Distance Tolerance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mesafe Toleransı (metre)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5000"
                        value={autoDispatchSettings.distance_tolerance}
                        onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, distance_tolerance: parseInt(e.target.value) || 0 }))}
                        placeholder="500"
                      />
                      <p className="text-xs text-muted-foreground">
                        Yolda kurye ile boş kurye arasındaki tolerans mesafesi
                      </p>
                    </div>

                    {/* Max Wait Time */}
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Maksimum Bekleme Süresi (dk)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="30"
                        value={autoDispatchSettings.max_wait_time}
                        onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, max_wait_time: parseInt(e.target.value) || 5 }))}
                        placeholder="5"
                      />
                      <p className="text-xs text-muted-foreground">
                        Yolda kurye beklenirken maksimum süre
                      </p>
                    </div>
                  </div>

                  {/* Fairness Section */}
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Adalet Sistemi</p>
                        <p className="text-xs text-muted-foreground">Son 1 saatte daha az sipariş alan kuryeyi tercih et</p>
                      </div>
                      <Switch 
                        checked={autoDispatchSettings.fairness_enabled}
                        onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, fairness_enabled: checked }))}
                      />
                    </div>
                    
                    {autoDispatchSettings.fairness_enabled && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <Label className="text-sm font-medium">Adalet Mesafe Eşiği (metre)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="2000"
                          value={autoDispatchSettings.fairness_threshold}
                          onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, fairness_threshold: parseInt(e.target.value) || 200 }))}
                          placeholder="200"
                        />
                        <p className="text-xs text-muted-foreground">
                          Bu mesafe içindeki kuryeler arasında adalet kontrolü yapılır
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Max Detour - Rota Sapması */}
                  <div className="space-y-1.5 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <Label className="text-sm font-medium">Maksimum Rota Sapması (metre)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3000"
                      value={autoDispatchSettings.max_detour}
                      onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, max_detour: parseInt(e.target.value) || 700 }))}
                      placeholder="700"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pickup aşamasında siparişler birleştirilirken izin verilen maksimum rota sapması.
                      <br/>
                      <span className="text-amber-700">Önerilen: 600-800 metre</span>
                    </p>
                  </div>

                  {/* Aynı Konum Ayarları */}
                  <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-purple-800">Aynı Bina/Konum Ayarları</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Teslimat noktaları çok yakınsa (aynı bina), kurye daha fazla paket alabilir.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Aynı Konum Mesafesi (m)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="200"
                          value={autoDispatchSettings.same_location_radius}
                          onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, same_location_radius: parseInt(e.target.value) || 30 }))}
                          placeholder="30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Max Paket (Aynı Konum)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={autoDispatchSettings.same_location_max_packages}
                          onChange={(e) => setAutoDispatchSettings(prev => ({ ...prev, same_location_max_packages: parseInt(e.target.value) || 10 }))}
                          placeholder="10"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-purple-700">
                      Örn: 30m yarıçapında tüm siparişler "aynı konum" sayılır ve 10 pakete kadar alınabilir.
                    </p>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleAutoDispatchSave} 
                disabled={autoDispatchSaving} 
                className="h-10 md:h-11 font-semibold text-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {autoDispatchSaving ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          )
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
                  <p className="text-xs text-muted-foreground">Bildirimleri e-posta olarak gönder</p>
                </div>
                <Switch 
                  checked={emailSettings.enabled}
                  onCheckedChange={(checked) => setEmailSettings({...emailSettings, enabled: checked})}
                />
              </div>

              {/* Notification Types */}
              {emailSettings.enabled && (
                <div className="border rounded-lg p-3 md:p-4 space-y-3">
                  <p className="font-medium text-sm mb-3">Hangi bildirimler için e-posta gönderilsin?</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Muhasebe İşlemleri</p>
                        <p className="text-xs text-muted-foreground">Hakediş ekleme, güncelleme, silme</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_muhasebe}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_muhasebe: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Zimmet İşlemleri</p>
                        <p className="text-xs text-muted-foreground">Zimmet atama, geri alma, ürün ekleme</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_zimmet}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_zimmet: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Evrak Yüklemeleri</p>
                        <p className="text-xs text-muted-foreground">Kurye evrak yüklediğinde</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_evrak}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_evrak: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Market Siparişleri</p>
                        <p className="text-xs text-muted-foreground">Yeni JetPuan sipariş geldiğinde</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_jetpuan}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_jetpuan: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border sm:col-span-2">
                      <div>
                        <p className="text-sm font-medium">Fesih Süreçleri</p>
                        <p className="text-xs text-muted-foreground">Fesih süresi 3 gün kala ve son gün</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_fesih}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_fesih: checked})}
                      />
                    </div>
                  </div>
                </div>
              )}

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
                    placeholder="AgrosJet"
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

      {/* Yedekleme (Backup) Card - Same style as other cards */}
      <div className="border-2 border-border bg-white">
        <button 
          type="button"
          onClick={() => setBackupExpanded(!backupExpanded)}
          className="w-full p-3 md:p-4 border-b-2 border-border bg-slate-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
            <h3 className="font-semibold text-sm md:text-base">Yedekleme</h3>
            {backupSettings.enabled && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hidden sm:inline">
                Otomatik
              </span>
            )}
          </div>
          {backupExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        {backupExpanded && (
          <div className="p-3 md:p-4 space-y-4">
            {/* Manual Backup */}
            <div className="p-3 bg-slate-50 rounded-lg border">
              <h4 className="font-semibold text-sm mb-2">Manuel Yedekleme</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Tüm şirket verilerini (kuryeler, muhasebe, faturalar, zimmet vb.) ZIP olarak indirin.
              </p>
              <Button 
                onClick={handleDownloadBackup} 
                disabled={downloading}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloading ? "İndiriliyor..." : "Yedeği İndir"}
              </Button>
            </div>

            {/* Restore Backup */}
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-sm mb-2 text-amber-800">Yedek Yükle</h4>
              <p className="text-xs text-amber-700 mb-3">
                Daha önce indirdiğiniz yedek dosyasını sisteme geri yükleyin.
              </p>
              
              <div className="flex items-center gap-2 mb-3">
                <Switch
                  checked={replaceExisting}
                  onCheckedChange={setReplaceExisting}
                  id="replace-mode"
                />
                <Label htmlFor="replace-mode" className="text-xs text-amber-800">
                  Mevcut verileri değiştir (dikkatli kullanın!)
                </Label>
              </div>
              
              <input
                type="file"
                ref={backupFileRef}
                onChange={handleUploadBackup}
                accept=".zip"
                className="hidden"
              />
              <Button 
                onClick={() => backupFileRef.current?.click()}
                disabled={uploading}
                variant="outline"
                className="w-full sm:w-auto border-amber-300 hover:bg-amber-100"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Yükleniyor..." : "Yedek Dosyası Seç"}
              </Button>
              
              {replaceExisting && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Bu mod mevcut verileri siler ve yedekteki verilerle değiştirir!
                </p>
              )}
            </div>

            {/* Automatic Backup */}
            <div className="p-3 bg-slate-50 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-sm">Otomatik Yedekleme</h4>
                  <p className="text-xs text-muted-foreground">Her gün belirlenen saatte e-posta ile gönderilir</p>
                </div>
                  <Switch 
                    checked={backupSettings.enabled}
                    onCheckedChange={(checked) => setBackupSettings({...backupSettings, enabled: checked})}
                  />
                </div>

                {backupSettings.enabled && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold">Yedekleme Saati</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <select
                            value={backupSettings.hour}
                            onChange={(e) => setBackupSettings({...backupSettings, hour: parseInt(e.target.value)})}
                            className="h-10 px-3 border-2 rounded-md text-sm flex-1"
                          >
                            {Array.from({length: 24}, (_, i) => (
                              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">E-posta Adresi</Label>
                        <Input 
                          type="email"
                          value={backupSettings.email}
                          onChange={(e) => setBackupSettings({...backupSettings, email: e.target.value})}
                          className="mt-1 h-10 border-2 text-sm"
                          placeholder="admin@sirket.com"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  <Button 
                    onClick={handleBackupSave}
                    disabled={backupSaving}
                    className="h-9"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {backupSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                  </Button>
                  {backupSettings.enabled && backupSettings.email && (
                    <Button 
                      variant="outline"
                      onClick={handleSendBackupNow}
                      disabled={sendingBackup}
                      className="h-9"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingBackup ? "Gönderiliyor..." : "Şimdi Gönder"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
