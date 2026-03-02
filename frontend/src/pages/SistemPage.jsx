import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { SlidersHorizontal, Save, Mail, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp, Building2, Clock, Zap } from "lucide-react";
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
    notify_fesih: true,
    // Otomatik atama bildirimleri
    notify_shift_violation: false,
    notify_auto_cancel: false
  });
  const [emailStatus, setEmailStatus] = useState({ exists: false });
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  // Working Hours Settings (Sabit - Değiştirilemez)
  const [workingHoursExpanded, setWorkingHoursExpanded] = useState(false);
  const workingHours = {
    opening_time: "06:00",
    closing_time: "06:00"
  };

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
    detour_skip_distance: 500,
    auto_cancel_enabled: false,
    auto_cancel_timeout: 5
  });
  const [autoDispatchLoading, setAutoDispatchLoading] = useState(true);
  const [autoDispatchSaving, setAutoDispatchSaving] = useState(false);

  // Optimize edilmiş varsayılan ayarlar
  const OPTIMIZED_DISPATCH_SETTINGS = {
    enabled: true,
    distance_tolerance: 1000,
    max_wait_time: 5,
    fairness_threshold: 500,
    fairness_enabled: true,
    max_detour: 1000,
    same_location_radius: 30,
    same_location_max_packages: 5,
    angle_check_enabled: true,
    angle_skip_distance: 1500,
    max_angle_diff: 40,
    detour_check_enabled: true,
    detour_skip_distance: 500,
    auto_cancel_enabled: true,
    auto_cancel_timeout: 3
  };

  // Input değişikliği handler - serbest giriş
  const handleDispatchInputChange = (field, value) => {
    const numValue = value === '' || value === '-' ? value : parseInt(value);
    setAutoDispatchSettings(prev => ({ ...prev, [field]: numValue }));
  };

  // Input blur handler - boş bırakılırsa 0 yap
  const handleDispatchInputBlur = (field) => {
    setAutoDispatchSettings(prev => ({
      ...prev,
      [field]: prev[field] === '' || prev[field] === '-' ? 0 : prev[field]
    }));
  };

  // Optimize ayarlara geri dön
  const restoreOptimizedSettings = () => {
    setAutoDispatchSettings(OPTIMIZED_DISPATCH_SETTINGS);
    toast.success("Optimize ayarlar yüklendi");
  };

  useEffect(() => {
    fetchCompanyInfo();
    fetchEmailSettings();
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
          notify_fesih: res.data.notify_fesih !== false,
          notify_shift_violation: res.data.notify_shift_violation || false,
          notify_auto_cancel: res.data.notify_auto_cancel || false
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
        detour_skip_distance: res.data.detour_skip_distance || 500,
        auto_cancel_enabled: res.data.auto_cancel_enabled || false,
        auto_cancel_timeout: res.data.auto_cancel_timeout || 5
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

      {/* Çalışma Saatleri - Collapsible (Sabit) */}
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
              Şirket çalışma saatleri sabit olarak ayarlanmıştır.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs md:text-sm font-semibold">Açılış Saati</Label>
                <Input 
                  type="time"
                  value={workingHours.opening_time}
                  disabled
                  className="mt-1 h-10 md:h-11 border-2 text-sm bg-slate-50 cursor-not-allowed"
                />
              </div>
              <div>
                <Label className="text-xs md:text-sm font-semibold">Kapanış Saati</Label>
                <Input 
                  type="time"
                  value={workingHours.closing_time}
                  disabled
                  className="mt-1 h-10 md:h-11 border-2 text-sm bg-slate-50 cursor-not-allowed"
                />
              </div>
            </div>
            
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              💡 24 saat çalışma - 06:00'dan ertesi gün 06:00'a kadar
            </p>
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
            <div className="p-4 md:p-6 space-y-6">
              {/* Ana Toggle */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                    <Zap className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Otomatik Atama</p>
                    <p className="text-xs text-muted-foreground">Her 10 saniyede kontrol edilir</p>
                  </div>
                </div>
                <Switch 
                  checked={autoDispatchSettings.enabled}
                  onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, enabled: checked }))}
                />
              </div>

              {autoDispatchSettings.enabled && (
                <div className="space-y-5">
                  
                  {/* BÖLÜM 1: Temel Ayarlar */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Temel Ayarlar</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                          </div>
                          <Label className="text-sm font-medium">Mesafe Toleransı</Label>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max="5000"
                          value={autoDispatchSettings.distance_tolerance}
                          onChange={(e) => handleDispatchInputChange('distance_tolerance', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('distance_tolerance')}
                          className="h-10"
                        />
                        <p className="text-xs text-muted-foreground">
                          Yolda kurye ile boş kurye arasındaki mesafe toleransı (metre)
                        </p>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <Label className="text-sm font-medium">Maks. Bekleme Süresi</Label>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          max="30"
                          value={autoDispatchSettings.max_wait_time}
                          onChange={(e) => handleDispatchInputChange('max_wait_time', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('max_wait_time')}
                          className="h-10"
                        />
                        <p className="text-xs text-muted-foreground">
                          Yolda kurye beklenirken maksimum süre (dakika)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* BÖLÜM 2: Rota Optimizasyonu */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rota Optimizasyonu</h4>
                    
                    {/* Açı Kontrolü */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-sm">Açı Kontrolü</p>
                            <p className="text-xs text-muted-foreground">Farklı yönlerdeki paketleri ayır</p>
                          </div>
                        </div>
                        <Switch 
                          checked={autoDispatchSettings.angle_check_enabled}
                          onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, angle_check_enabled: checked }))}
                        />
                      </div>
                      
                      {autoDispatchSettings.angle_check_enabled && (
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">Maks. Açı Farkı (°)</Label>
                            <Input
                              type="number"
                              min="30"
                              max="180"
                              value={autoDispatchSettings.max_angle_diff}
                              onChange={(e) => handleDispatchInputChange('max_angle_diff', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('max_angle_diff')}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">İstisna Mesafesi (m)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="3000"
                              value={autoDispatchSettings.angle_skip_distance}
                              onChange={(e) => handleDispatchInputChange('angle_skip_distance', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('angle_skip_distance')}
                              className="h-9"
                            />
                          </div>
                          <p className="col-span-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                            💡 {autoDispatchSettings.angle_skip_distance}m içindeki paketler için açı kontrolü atlanır
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Detour Kontrolü */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-sm">Rota Sapması Kontrolü</p>
                            <p className="text-xs text-muted-foreground">Fazla sapma olan paketleri ayır</p>
                          </div>
                        </div>
                        <Switch 
                          checked={autoDispatchSettings.detour_check_enabled}
                          onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, detour_check_enabled: checked }))}
                        />
                      </div>
                      
                      {autoDispatchSettings.detour_check_enabled && (
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">Maks. Sapma (m)</Label>
                            <Input
                              type="number"
                              min="-3000"
                              max="3000"
                              value={autoDispatchSettings.max_detour}
                              onChange={(e) => handleDispatchInputChange('max_detour', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('max_detour')}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">İstisna Mesafesi (m)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="2000"
                              value={autoDispatchSettings.detour_skip_distance}
                              onChange={(e) => handleDispatchInputChange('detour_skip_distance', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('detour_skip_distance')}
                              className="h-9"
                            />
                          </div>
                          <p className="col-span-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                            💡 {autoDispatchSettings.max_detour < 0 
                              ? `En az ${Math.abs(autoDispatchSettings.max_detour)}m tasarruf yoksa paketler ayrı gönderilir.`
                              : `${autoDispatchSettings.max_detour}m'ye kadar ekstra sapma kabul edilir.`} {autoDispatchSettings.detour_skip_distance}m içindeki paketler için kontrol atlanır.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BÖLÜM 3: Kapasite Yönetimi */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kapasite Yönetimi</h4>
                    
                    {/* Aynı Konum */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                          <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-sm">Aynı Bina Optimizasyonu</p>
                          <p className="text-xs text-muted-foreground">Yakın teslimatlar için kapasite artışı</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Yakınlık Mesafesi (m)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="200"
                            value={autoDispatchSettings.same_location_radius}
                            onChange={(e) => handleDispatchInputChange('same_location_radius', e.target.value)}
                            onBlur={() => handleDispatchInputBlur('same_location_radius')}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-600">Maks. Paket</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={autoDispatchSettings.same_location_max_packages}
                            onChange={(e) => handleDispatchInputChange('same_location_max_packages', e.target.value)}
                            onBlur={() => handleDispatchInputBlur('same_location_max_packages')}
                            className="h-9"
                          />
                        </div>
                        <p className="col-span-2 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                          💡 {autoDispatchSettings.same_location_radius}m içindeki siparişler aynı bina sayılır, {autoDispatchSettings.same_location_max_packages} pakete kadar alınabilir
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* BÖLÜM 4: Adalet Sistemi */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adalet Sistemi</h4>
                    
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-sm">Kurye Dengesi</p>
                            <p className="text-xs text-muted-foreground">Az sipariş alan kuryeyi tercih et</p>
                          </div>
                        </div>
                        <Switch 
                          checked={autoDispatchSettings.fairness_enabled}
                          onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, fairness_enabled: checked }))}
                        />
                      </div>
                      
                      {autoDispatchSettings.fairness_enabled && (
                        <div className="pt-3 border-t border-slate-100">
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">Adalet Mesafe Eşiği (m)</Label>
                            <Input
                              type="number"
                              min="0"
                              max="2000"
                              value={autoDispatchSettings.fairness_threshold}
                              onChange={(e) => handleDispatchInputChange('fairness_threshold', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('fairness_threshold')}
                              className="h-9"
                            />
                          </div>
                          <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-3">
                            💡 {autoDispatchSettings.fairness_threshold}m içindeki kuryeler arasında son 1 saatteki sipariş sayısına göre seçim yapılır
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BÖLÜM 5: Otomatik İptal */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Otomatik İptal</h4>
                    
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-sm">Onaylanmayan Paket İptali</p>
                            <p className="text-xs text-muted-foreground">Süresinde onaylanmayan atamaları iptal et</p>
                          </div>
                        </div>
                        <Switch 
                          checked={autoDispatchSettings.auto_cancel_enabled}
                          onCheckedChange={(checked) => setAutoDispatchSettings(prev => ({ ...prev, auto_cancel_enabled: checked }))}
                        />
                      </div>
                      
                      {autoDispatchSettings.auto_cancel_enabled && (
                        <div className="pt-3 border-t border-slate-100">
                          <div className="space-y-2">
                            <Label className="text-xs text-slate-600">İptal Süresi (dakika)</Label>
                            <Input
                              type="number"
                              min="1"
                              max="30"
                              value={autoDispatchSettings.auto_cancel_timeout}
                              onChange={(e) => handleDispatchInputChange('auto_cancel_timeout', e.target.value)}
                              onBlur={() => handleDispatchInputBlur('auto_cancel_timeout')}
                              className="h-9"
                            />
                          </div>
                          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
                            ⚠️ Kurye {autoDispatchSettings.auto_cancel_timeout} dakika içinde paketi onaylamazsa atama iptal edilir ve ihlal kaydı oluşturulur
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button"
                  variant="outline"
                  onClick={restoreOptimizedSettings}
                  className="flex-1 h-11"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Optimize Ayarları Yükle
                </Button>
                <Button 
                  onClick={handleAutoDispatchSave} 
                  disabled={autoDispatchSaving} 
                  className="flex-1 h-11 font-semibold"
                >
                  {autoDispatchSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
              </div>
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

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Fesih Süreçleri</p>
                        <p className="text-xs text-muted-foreground">Fesih süresi 3 gün kala ve son gün</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_fesih}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_fesih: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Vardiya İhlalleri</p>
                        <p className="text-xs text-muted-foreground">İhlal oluştuğunda mail gönder</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_shift_violation}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_shift_violation: checked})}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded border">
                      <div>
                        <p className="text-sm font-medium">Otomatik İptal</p>
                        <p className="text-xs text-muted-foreground">Atama iptal edildiğinde mail gönder</p>
                      </div>
                      <Switch 
                        checked={emailSettings.notify_auto_cancel}
                        onCheckedChange={(checked) => setEmailSettings({...emailSettings, notify_auto_cancel: checked})}
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
    </div>
  );
}
