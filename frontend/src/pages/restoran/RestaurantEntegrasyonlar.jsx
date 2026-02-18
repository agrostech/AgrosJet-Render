import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { 
  RefreshCw, 
  Link2, 
  Unlink, 
  CheckCircle2, 
  XCircle, 
  Settings,
  Eye,
  EyeOff,
  Utensils,
  Store,
  ExternalLink,
  Power,
  PowerOff
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantEntegrasyonlar({ restaurantId }) {
  const [adisyoData, setAdisyoData] = useState(null);
  const [trendyolData, setTrendyolData] = useState(null);
  const [getirData, setGetirData] = useState(null);
  const [yemeksepetiData, setYemeksepetiData] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showAdisyoModal, setShowAdisyoModal] = useState(false);
  const [showTrendyolModal, setShowTrendyolModal] = useState(false);
  const [showGetirModal, setShowGetirModal] = useState(false);
  const [showYemeksepetiModal, setShowYemeksepetiModal] = useState(false);
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  
  // Form states
  const [adisyoForm, setAdisyoForm] = useState({ api_key: "", api_secret: "", branch_id: "" });
  const [trendyolForm, setTrendyolForm] = useState({ 
    api_key: "", 
    api_secret: "", 
    supplier_id: "", 
    store_id: "",
    enabled: false 
  });
  const [getirForm, setGetirForm] = useState({
    app_secret_key: "",
    restaurant_secret_key: "",
    enabled: false
  });
  const [yemeksepetiForm, setYemeksepetiForm] = useState({
    client_id: "",
    client_secret: "",
    chain_id: "",
    vendor_id: "",
    enabled: false
  });
  const [platformForm, setPlatformForm] = useState({ api_key: "", api_secret: "", store_id: "", enabled: false });
  const [showSecrets, setShowSecrets] = useState({});
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [closeTimeOff, setCloseTimeOff] = useState("15");

  useEffect(() => {
    if (restaurantId) {
      fetchIntegrations();
    }
  }, [restaurantId]);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const [adisyoRes, trendyolRes, getirRes, yemeksepetiRes, platformsRes] = await Promise.all([
        axios.get(`${API}/restaurant-integrations/${restaurantId}/adisyo`),
        axios.get(`${API}/restaurant-integrations/${restaurantId}/trendyol`),
        axios.get(`${API}/restaurant-integrations/${restaurantId}/getir`),
        axios.get(`${API}/restaurant-integrations/${restaurantId}/yemeksepeti`),
        axios.get(`${API}/restaurant-integrations/${restaurantId}/platforms`)
      ]);
      
      setAdisyoData(adisyoRes.data.adisyo);
      setTrendyolData(trendyolRes.data.trendyol);
      setGetirData(getirRes.data.getir);
      setYemeksepetiData(yemeksepetiRes.data.yemeksepeti);
      setPlatforms(platformsRes.data.platforms || []);
    } catch (err) {
      console.error("Entegrasyonlar yüklenemedi:", err);
      toast.error("Entegrasyonlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Adisyo handlers
  const openAdisyoModal = () => {
    setAdisyoForm({
      api_key: "",
      api_secret: "",
      branch_id: adisyoData?.branch_id || ""
    });
    setShowSecrets({});
    setShowAdisyoModal(true);
  };

  const handleSaveAdisyo = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (adisyoForm.api_key) payload.api_key = adisyoForm.api_key;
      if (adisyoForm.api_secret) payload.api_secret = adisyoForm.api_secret;
      if (adisyoForm.branch_id !== undefined) payload.branch_id = adisyoForm.branch_id;
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/adisyo`, payload);
      toast.success("Adisyo ayarları kaydedildi");
      setShowAdisyoModal(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTestAdisyo = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/restaurant-integrations/${restaurantId}/adisyo/test`);
      toast.success("Adisyo bağlantısı başarılı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnectAdisyo = async () => {
    if (!confirm("Adisyo entegrasyonunu kaldırmak istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-integrations/${restaurantId}/adisyo`);
      toast.success("Adisyo entegrasyonu kaldırıldı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Trendyol handlers
  const openTrendyolModal = () => {
    setTrendyolForm({
      api_key: "",
      api_secret: "",
      supplier_id: trendyolData?.supplier_id || "",
      store_id: trendyolData?.store_id || "",
      enabled: trendyolData?.enabled || false
    });
    setShowSecrets({});
    setShowTrendyolModal(true);
  };

  const handleSaveTrendyol = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: trendyolForm.enabled
      };
      if (trendyolForm.api_key) payload.api_key = trendyolForm.api_key;
      if (trendyolForm.api_secret) payload.api_secret = trendyolForm.api_secret;
      if (trendyolForm.supplier_id !== undefined) payload.supplier_id = trendyolForm.supplier_id;
      if (trendyolForm.store_id !== undefined) payload.store_id = trendyolForm.store_id;
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/trendyol`, payload);
      toast.success("Trendyol ayarları kaydedildi");
      setShowTrendyolModal(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTestTrendyol = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/restaurant-integrations/${restaurantId}/trendyol/test`);
      toast.success("Trendyol bağlantısı başarılı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
    } finally {
      setTesting(false);
    }
  };

  const handleSyncTrendyol = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/restaurant-integrations/${restaurantId}/trendyol/sync`);
      const { synced, updated, skipped } = res.data;
      toast.success(`Senkronizasyon tamamlandı: ${synced} yeni, ${updated} güncellendi`);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Senkronizasyon başarısız");
    } finally {
      setSyncing(false);
    }
  };

  const handleTrendyolWorkingStatus = async (isOpen) => {
    setUpdatingStatus(true);
    try {
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/trendyol/working-status`, {
        is_open: isOpen
      });
      toast.success(`Restoran ${isOpen ? "açıldı" : "kapatıldı"}`);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDisconnectTrendyol = async () => {
    if (!confirm("Trendyol entegrasyonunu kaldırmak istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-integrations/${restaurantId}/trendyol`);
      toast.success("Trendyol entegrasyonu kaldırıldı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Getir handlers
  const openGetirModal = () => {
    setGetirForm({
      app_secret_key: "",
      restaurant_secret_key: "",
      enabled: getirData?.enabled || false
    });
    setShowSecrets({});
    setShowGetirModal(true);
  };

  const handleSaveGetir = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: getirForm.enabled
      };
      if (getirForm.app_secret_key) payload.app_secret_key = getirForm.app_secret_key;
      if (getirForm.restaurant_secret_key) payload.restaurant_secret_key = getirForm.restaurant_secret_key;
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/getir`, payload);
      toast.success("Getir ayarları kaydedildi");
      setShowGetirModal(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTestGetir = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/restaurant-integrations/${restaurantId}/getir/test`);
      toast.success("Getir bağlantısı başarılı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
    } finally {
      setTesting(false);
    }
  };

  const handleSyncGetir = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/restaurant-integrations/${restaurantId}/getir/sync`);
      const { synced, updated, skipped } = res.data;
      toast.success(`Senkronizasyon tamamlandı: ${synced} yeni, ${updated} güncellendi`);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Senkronizasyon başarısız");
    } finally {
      setSyncing(false);
    }
  };

  const handleGetirWorkingStatus = async (isOpen) => {
    setUpdatingStatus(true);
    try {
      const payload = { is_open: isOpen };
      if (!isOpen && closeTimeOff) {
        payload.time_off_amount = parseInt(closeTimeOff);
      }
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/getir/working-status`, payload);
      toast.success(`Restoran ${isOpen ? "açıldı" : "kapatıldı"}`);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDisconnectGetir = async () => {
    if (!confirm("Getir entegrasyonunu kaldırmak istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-integrations/${restaurantId}/getir`);
      toast.success("Getir entegrasyonu kaldırıldı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Yemeksepeti handlers
  const openYemeksepetiModal = () => {
    setYemeksepetiForm({
      client_id: "",
      client_secret: "",
      chain_id: yemeksepetiData?.chain_id || "",
      vendor_id: yemeksepetiData?.vendor_id || "",
      enabled: yemeksepetiData?.enabled || false
    });
    setShowSecrets({});
    setShowYemeksepetiModal(true);
  };

  const handleSaveYemeksepeti = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: yemeksepetiForm.enabled
      };
      if (yemeksepetiForm.client_id) payload.client_id = yemeksepetiForm.client_id;
      if (yemeksepetiForm.client_secret) payload.client_secret = yemeksepetiForm.client_secret;
      if (yemeksepetiForm.chain_id !== undefined) payload.chain_id = yemeksepetiForm.chain_id;
      if (yemeksepetiForm.vendor_id !== undefined) payload.vendor_id = yemeksepetiForm.vendor_id;
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/yemeksepeti`, payload);
      toast.success("Yemeksepeti ayarları kaydedildi");
      setShowYemeksepetiModal(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleTestYemeksepeti = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/restaurant-integrations/${restaurantId}/yemeksepeti/test`);
      toast.success("Yemeksepeti bağlantısı başarılı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnectYemeksepeti = async () => {
    if (!confirm("Yemeksepeti entegrasyonunu kaldırmak istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-integrations/${restaurantId}/yemeksepeti`);
      toast.success("Yemeksepeti entegrasyonu kaldırıldı");
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const copyWebhookUrl = () => {
    if (yemeksepetiData?.webhook_url) {
      navigator.clipboard.writeText(yemeksepetiData.webhook_url);
      toast.success("Webhook URL kopyalandı");
    }
  };

  // Platform handlers
  const openPlatformModal = (platform) => {
    setSelectedPlatform(platform);
    setPlatformForm({
      api_key: "",
      api_secret: "",
      store_id: "",
      enabled: platform.enabled || false
    });
    setShowSecrets({});
    setShowPlatformModal(true);
  };

  const handleSavePlatform = async () => {
    if (!selectedPlatform) return;
    
    setSaving(true);
    try {
      const payload = {
        enabled: platformForm.enabled
      };
      if (platformForm.api_key) payload.api_key = platformForm.api_key;
      if (platformForm.api_secret) payload.api_secret = platformForm.api_secret;
      if (platformForm.store_id !== undefined) payload.store_id = platformForm.store_id;
      
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/platforms/${selectedPlatform.id}`, payload);
      toast.success(`${selectedPlatform.name} ayarları kaydedildi`);
      setShowPlatformModal(false);
      fetchIntegrations();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="restaurant-entegrasyonlar">
      <div>
        <h1 className="text-2xl font-bold">Entegrasyonlar</h1>
        <p className="text-sm text-muted-foreground">Sipariş platformları ve POS entegrasyonları</p>
      </div>

      {/* Trendyol Yemek Entegrasyonu */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TY</span>
            </div>
            <div>
              <CardTitle className="text-lg">Trendyol Yemek</CardTitle>
              <CardDescription className="text-xs">
                Trendyol Go by Uber Eats entegrasyonu
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="font-bold text-sm text-orange-600">TY</span>
                </div>
                <div>
                  <h3 className="font-medium">Trendyol Yemek Entegrasyonu</h3>
                  <p className="text-xs text-muted-foreground">Trendyol'dan otomatik sipariş çekme</p>
                </div>
              </div>
              {trendyolData?.connected ? (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Bağlı
                </Badge>
              ) : trendyolData?.has_credentials ? (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  Bağlantı Yok
                </Badge>
              ) : null}
            </div>
            
            {trendyolData?.has_credentials && (
              <div className="mt-3 p-2 bg-slate-50 rounded text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium">API Key:</span> {trendyolData.api_key}
                </div>
                <div>
                  <span className="font-medium">Supplier ID:</span> {trendyolData.supplier_id || "-"}
                  {trendyolData.store_id && (
                    <span className="ml-3"><span className="font-medium">Store ID:</span> {trendyolData.store_id}</span>
                  )}
                </div>
                {trendyolData.last_sync && (
                  <div>
                    <span className="font-medium">Son Senkronizasyon:</span>{" "}
                    {new Date(trendyolData.last_sync).toLocaleString("tr-TR")}
                  </div>
                )}
              </div>
            )}
            
            {/* Restoran Açık/Kapalı Durumu */}
            {trendyolData?.connected && (
              <div className="mt-3 flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium">Restoran Durumu (Trendyol)</p>
                  <p className="text-xs text-muted-foreground">
                    {trendyolData.is_open ? "Restoran şu anda açık" : "Restoran şu anda kapalı"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={trendyolData.is_open ? "outline" : "default"}
                    onClick={() => handleTrendyolWorkingStatus(true)}
                    disabled={updatingStatus || trendyolData.is_open}
                    className={trendyolData.is_open ? "" : "bg-green-600 hover:bg-green-700"}
                  >
                    <Power className="w-4 h-4 mr-1" />
                    Aç
                  </Button>
                  <Button
                    size="sm"
                    variant={!trendyolData.is_open ? "outline" : "destructive"}
                    onClick={() => handleTrendyolWorkingStatus(false)}
                    disabled={updatingStatus || !trendyolData.is_open}
                  >
                    <PowerOff className="w-4 h-4 mr-1" />
                    Kapat
                  </Button>
                </div>
              </div>
            )}
            
            <div className="mt-3 flex gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline"
                onClick={openTrendyolModal}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-1" />
                {trendyolData?.has_credentials ? "Düzenle" : "Yapılandır"}
              </Button>
              
              {trendyolData?.has_credentials && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleTestTrendyol}
                    disabled={testing}
                  >
                    {testing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    <span className="ml-1">Test</span>
                  </Button>
                  
                  {trendyolData.connected && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleSyncTrendyol}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span className="ml-1">Senkronize Et</span>
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleDisconnectTrendyol}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Getir Yemek Entegrasyonu */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            <div>
              <CardTitle className="text-lg">Getir Yemek</CardTitle>
              <CardDescription className="text-xs">
                GetirYemek sipariş entegrasyonu
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="font-bold text-sm text-purple-600">G</span>
                </div>
                <div>
                  <h3 className="font-medium">Getir Yemek Entegrasyonu</h3>
                  <p className="text-xs text-muted-foreground">Getir'den otomatik sipariş çekme</p>
                </div>
              </div>
              {getirData?.connected ? (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Bağlı
                </Badge>
              ) : getirData?.has_credentials ? (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  Bağlantı Yok
                </Badge>
              ) : null}
            </div>
            
            {getirData?.has_credentials && (
              <div className="mt-3 p-2 bg-slate-50 rounded text-xs text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium">App Secret Key:</span> {getirData.app_secret_key}
                </div>
                {getirData.last_sync && (
                  <div>
                    <span className="font-medium">Son Senkronizasyon:</span>{" "}
                    {new Date(getirData.last_sync).toLocaleString("tr-TR")}
                  </div>
                )}
              </div>
            )}
            
            {/* Restoran Açık/Kapalı Durumu */}
            {getirData?.connected && (
              <div className="mt-3 flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                <div>
                  <p className="text-sm font-medium">Restoran Durumu (Getir)</p>
                  <p className="text-xs text-muted-foreground">
                    {getirData.is_open ? "Restoran şu anda açık" : "Restoran şu anda kapalı"}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {!getirData.is_open && (
                    <Select value={closeTimeOff} onValueChange={setCloseTimeOff}>
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 dk</SelectItem>
                        <SelectItem value="30">30 dk</SelectItem>
                        <SelectItem value="45">45 dk</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    variant={getirData.is_open ? "outline" : "default"}
                    onClick={() => handleGetirWorkingStatus(true)}
                    disabled={updatingStatus || getirData.is_open}
                    className={getirData.is_open ? "" : "bg-green-600 hover:bg-green-700"}
                  >
                    <Power className="w-4 h-4 mr-1" />
                    Aç
                  </Button>
                  <Button
                    size="sm"
                    variant={!getirData.is_open ? "outline" : "destructive"}
                    onClick={() => handleGetirWorkingStatus(false)}
                    disabled={updatingStatus || !getirData.is_open}
                  >
                    <PowerOff className="w-4 h-4 mr-1" />
                    Kapat
                  </Button>
                </div>
              </div>
            )}
            
            <div className="mt-3 flex gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline"
                onClick={openGetirModal}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-1" />
                {getirData?.has_credentials ? "Düzenle" : "Yapılandır"}
              </Button>
              
              {getirData?.has_credentials && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleTestGetir}
                    disabled={testing}
                  >
                    {testing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    <span className="ml-1">Test</span>
                  </Button>
                  
                  {getirData.connected && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleSyncGetir}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span className="ml-1">Senkronize Et</span>
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleDisconnectGetir}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diğer Yemek Platformları (Placeholder) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            <CardTitle className="text-lg">Diğer Yemek Platformları</CardTitle>
          </div>
          <CardDescription>
            Yakında eklenecek entegrasyonlar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {platforms.filter(p => p.id !== "trendyol" && p.id !== "getir").map((platform) => (
              <div
                key={platform.id}
                className="p-4 rounded-lg border hover:border-primary/50 transition-colors opacity-60"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                      <ExternalLink className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">{platform.name}</h3>
                      <p className="text-xs text-muted-foreground">{platform.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">Yakında</Badge>
                </div>
                
                <div className="mt-3">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => openPlatformModal(platform)}
                    className="w-full"
                    disabled
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    Ayarlar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Diğer Entegrasyonlar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            <CardTitle className="text-lg">Diğer Entegrasyonlar</CardTitle>
          </div>
          <CardDescription>
            POS ve restoran yönetim sistemleri
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Adisyo POS */}
          <div className="p-4 rounded-lg border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <span className="font-bold text-sm text-slate-600">AD</span>
                </div>
                <div>
                  <h3 className="font-medium">AdisyoPos Entegrasyonu</h3>
                  <p className="text-xs text-muted-foreground">Adisyo POS sisteminden otomatik sipariş çekme</p>
                </div>
              </div>
              {adisyoData?.connected ? (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Bağlı
                </Badge>
              ) : adisyoData?.has_credentials ? (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  Bağlantı Yok
                </Badge>
              ) : null}
            </div>
            
            {adisyoData?.has_credentials && (
              <div className="mt-3 p-2 bg-slate-50 rounded text-xs text-muted-foreground">
                <span className="font-medium">API Key:</span> {adisyoData.api_key}
                {adisyoData.branch_id && (
                  <span className="ml-3"><span className="font-medium">Branch ID:</span> {adisyoData.branch_id}</span>
                )}
              </div>
            )}
            
            <div className="mt-3 flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={openAdisyoModal}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-1" />
                {adisyoData?.has_credentials ? "Düzenle" : "Yapılandır"}
              </Button>
              
              {adisyoData?.has_credentials && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleTestAdisyo}
                    disabled={testing}
                  >
                    {testing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    <span className="ml-1">Test</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleDisconnectAdisyo}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adisyo Modal */}
      <Dialog open={showAdisyoModal} onOpenChange={setShowAdisyoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adisyo Entegrasyonu</DialogTitle>
            <DialogDescription>
              Adisyo POS sisteminizden sipariş çekmek için API bilgilerinizi girin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showSecrets.api_key ? "text" : "password"}
                  value={adisyoForm.api_key}
                  onChange={(e) => setAdisyoForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={adisyoData?.has_credentials ? "Değiştirmek için yeni key girin" : "API Key"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, api_key: !prev.api_key }))}
                >
                  {showSecrets.api_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>API Secret</Label>
              <div className="relative">
                <Input
                  type={showSecrets.api_secret ? "text" : "password"}
                  value={adisyoForm.api_secret}
                  onChange={(e) => setAdisyoForm(prev => ({ ...prev, api_secret: e.target.value }))}
                  placeholder={adisyoData?.has_credentials ? "Değiştirmek için yeni secret girin" : "API Secret"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, api_secret: !prev.api_secret }))}
                >
                  {showSecrets.api_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Branch ID (Opsiyonel)</Label>
              <Input
                value={adisyoForm.branch_id}
                onChange={(e) => setAdisyoForm(prev => ({ ...prev, branch_id: e.target.value }))}
                placeholder="Şube ID"
              />
              <p className="text-xs text-muted-foreground">
                Birden fazla şubeniz varsa şube ID'si belirtin
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdisyoModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveAdisyo} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trendyol Modal */}
      <Dialog open={showTrendyolModal} onOpenChange={setShowTrendyolModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trendyol Yemek Entegrasyonu</DialogTitle>
            <DialogDescription>
              Trendyol Go by Uber Eats'den sipariş çekmek için API bilgilerinizi girin.
              Bu bilgileri partner.trendyol.com panelinden alabilirsiniz.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Entegrasyon Durumu</Label>
                <p className="text-xs text-muted-foreground">Bu entegrasyonu aktif et</p>
              </div>
              <Switch
                checked={trendyolForm.enabled}
                onCheckedChange={(checked) => setTrendyolForm(prev => ({ ...prev, enabled: checked }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>API Key <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showSecrets.ty_api_key ? "text" : "password"}
                  value={trendyolForm.api_key}
                  onChange={(e) => setTrendyolForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={trendyolData?.has_credentials ? "Değiştirmek için yeni key girin" : "API Key"}
                  disabled={!trendyolForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, ty_api_key: !prev.ty_api_key }))}
                >
                  {showSecrets.ty_api_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>API Secret <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showSecrets.ty_api_secret ? "text" : "password"}
                  value={trendyolForm.api_secret}
                  onChange={(e) => setTrendyolForm(prev => ({ ...prev, api_secret: e.target.value }))}
                  placeholder={trendyolData?.has_credentials ? "Değiştirmek için yeni secret girin" : "API Secret"}
                  disabled={!trendyolForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, ty_api_secret: !prev.ty_api_secret }))}
                >
                  {showSecrets.ty_api_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Supplier ID (Satıcı ID) <span className="text-red-500">*</span></Label>
              <Input
                value={trendyolForm.supplier_id}
                onChange={(e) => setTrendyolForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                placeholder="Örn: 107385"
                disabled={!trendyolForm.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Trendyol satıcı panelinizden alabilirsiniz
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Store ID (Mağaza ID)</Label>
              <Input
                value={trendyolForm.store_id}
                onChange={(e) => setTrendyolForm(prev => ({ ...prev, store_id: e.target.value }))}
                placeholder="Örn: 330 (opsiyonel)"
                disabled={!trendyolForm.enabled}
              />
              <p className="text-xs text-muted-foreground">
                Birden fazla şubeniz varsa şube ID'si belirtin
              </p>
            </div>
            
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs text-orange-800">
                <strong>Bilgi:</strong> API bilgilerinizi <a href="https://partner.trendyol.com" target="_blank" rel="noopener noreferrer" className="underline">partner.trendyol.com</a> adresinden 
                "Hesap Bilgilerim → Entegrasyon Bilgileri" bölümünden alabilirsiniz.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTrendyolModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveTrendyol} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Getir Modal */}
      <Dialog open={showGetirModal} onOpenChange={setShowGetirModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Getir Yemek Entegrasyonu</DialogTitle>
            <DialogDescription>
              GetirYemek'ten sipariş çekmek için API bilgilerinizi girin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Entegrasyon Durumu</Label>
                <p className="text-xs text-muted-foreground">Bu entegrasyonu aktif et</p>
              </div>
              <Switch
                checked={getirForm.enabled}
                onCheckedChange={(checked) => setGetirForm(prev => ({ ...prev, enabled: checked }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>App Secret Key <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showSecrets.gt_app_secret ? "text" : "password"}
                  value={getirForm.app_secret_key}
                  onChange={(e) => setGetirForm(prev => ({ ...prev, app_secret_key: e.target.value }))}
                  placeholder={getirData?.has_credentials ? "Değiştirmek için yeni key girin" : "App Secret Key"}
                  disabled={!getirForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, gt_app_secret: !prev.gt_app_secret }))}
                >
                  {showSecrets.gt_app_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Restaurant Secret Key <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  type={showSecrets.gt_rest_secret ? "text" : "password"}
                  value={getirForm.restaurant_secret_key}
                  onChange={(e) => setGetirForm(prev => ({ ...prev, restaurant_secret_key: e.target.value }))}
                  placeholder={getirData?.has_credentials ? "Değiştirmek için yeni key girin" : "Restaurant Secret Key"}
                  disabled={!getirForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, gt_rest_secret: !prev.gt_rest_secret }))}
                >
                  {showSecrets.gt_rest_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-800">
                <strong>Bilgi:</strong> API bilgilerinizi Getir İş Ortağı panelinden alabilirsiniz. 
                Token otomatik olarak yönetilir (1 saat geçerli, otomatik yenilenir).
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGetirModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveGetir} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform Modal (Placeholder) */}
      <Dialog open={showPlatformModal} onOpenChange={setShowPlatformModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedPlatform?.name} Entegrasyonu</DialogTitle>
            <DialogDescription>
              {selectedPlatform?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 border rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Bu platform entegrasyonu henüz geliştirme aşamasındadır.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlatformModal(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
