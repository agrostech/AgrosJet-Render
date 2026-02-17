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
  RefreshCw, 
  Link2, 
  Unlink, 
  CheckCircle2, 
  XCircle, 
  Settings,
  Eye,
  EyeOff,
  Utensils,
  Store
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Platform logoları ve renkleri
const PLATFORM_STYLES = {
  yemeksepeti: { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700", icon: "🍔" },
  trendyol: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: "🛒" },
  getir: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", icon: "🚀" },
  migros: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", icon: "🛍️" }
};

export default function RestaurantEntegrasyonlar({ restaurantId }) {
  const [adisyoData, setAdisyoData] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showAdisyoModal, setShowAdisyoModal] = useState(false);
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  
  // Form states
  const [adisyoForm, setAdisyoForm] = useState({ api_key: "", api_secret: "", branch_id: "" });
  const [platformForm, setPlatformForm] = useState({ api_key: "", api_secret: "", store_id: "", enabled: false });
  const [showSecrets, setShowSecrets] = useState({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (restaurantId) {
      fetchIntegrations();
    }
  }, [restaurantId]);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const [adisyoRes, platformsRes] = await Promise.all([
        axios.get(`${API}/restaurant-integrations/${restaurantId}/adisyo`),
        axios.get(`${API}/restaurant-integrations/${restaurantId}/platforms`)
      ]);
      
      setAdisyoData(adisyoRes.data.adisyo);
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
        <h1 className="text-2xl font-bold text-slate-900">Entegrasyonlar</h1>
        <p className="text-sm text-muted-foreground">Sipariş platformları ve POS entegrasyonları</p>
      </div>

      {/* Yemek Platformu Entegrasyonları */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Yemek Platformu Entegrasyonları</CardTitle>
          </div>
          <CardDescription>
            Online yemek siparişi platformlarından otomatik sipariş çekme
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {platforms.map((platform) => {
              const style = PLATFORM_STYLES[platform.id] || { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", icon: "📦" };
              
              return (
                <div
                  key={platform.id}
                  className={`p-4 rounded-lg border-2 ${style.border} ${style.bg} transition-all hover:shadow-md`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{style.icon}</span>
                      <div>
                        <h3 className={`font-semibold ${style.text}`}>{platform.name}</h3>
                        <p className="text-xs text-muted-foreground">{platform.description}</p>
                      </div>
                    </div>
                    {platform.connected ? (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Bağlı
                      </Badge>
                    ) : platform.enabled ? (
                      <Badge variant="secondary">
                        Yapılandırılmamış
                      </Badge>
                    ) : null}
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => openPlatformModal(platform)}
                      className="flex-1"
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Ayarlar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Platform entegrasyonları için API dökümanları incelendikten sonra detaylandırılacaktır.
          </p>
        </CardContent>
      </Card>

      {/* Diğer Entegrasyonlar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Diğer Entegrasyonlar</CardTitle>
          </div>
          <CardDescription>
            POS ve restoran yönetim sistemleri
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Adisyo POS */}
          <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">AD</span>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-700">AdisyoPos Entegrasyonu</h3>
                  <p className="text-xs text-blue-600">Adisyo POS sisteminden otomatik sipariş çekme</p>
                </div>
              </div>
              {adisyoData?.connected ? (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Bağlı
                </Badge>
              ) : adisyoData?.has_credentials ? (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                  <XCircle className="w-3 h-3 mr-1" />
                  Bağlantı Yok
                </Badge>
              ) : null}
            </div>
            
            {adisyoData?.has_credentials && (
              <div className="mt-3 p-2 bg-white/50 rounded text-xs text-blue-700">
                <span className="font-medium">API Key:</span> {adisyoData.api_key}
                {adisyoData.branch_id && (
                  <span className="ml-3"><span className="font-medium">Branch ID:</span> {adisyoData.branch_id}</span>
                )}
              </div>
            )}
            
            <div className="mt-4 flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={openAdisyoModal}
                className="flex-1 bg-white hover:bg-blue-50"
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
                    className="bg-white hover:bg-blue-50"
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
                    className="bg-white hover:bg-red-50 text-red-600 hover:text-red-700"
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
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">AD</span>
              </div>
              Adisyo Entegrasyonu
            </DialogTitle>
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

      {/* Platform Modal */}
      <Dialog open={showPlatformModal} onOpenChange={setShowPlatformModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{PLATFORM_STYLES[selectedPlatform?.id]?.icon || "📦"}</span>
              {selectedPlatform?.name} Entegrasyonu
            </DialogTitle>
            <DialogDescription>
              {selectedPlatform?.description}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label>Entegrasyon Durumu</Label>
                <p className="text-xs text-muted-foreground">Bu entegrasyonu aktif et</p>
              </div>
              <Switch
                checked={platformForm.enabled}
                onCheckedChange={(checked) => setPlatformForm(prev => ({ ...prev, enabled: checked }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showSecrets.platform_api_key ? "text" : "password"}
                  value={platformForm.api_key}
                  onChange={(e) => setPlatformForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="API Key"
                  disabled={!platformForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, platform_api_key: !prev.platform_api_key }))}
                >
                  {showSecrets.platform_api_key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>API Secret</Label>
              <div className="relative">
                <Input
                  type={showSecrets.platform_api_secret ? "text" : "password"}
                  value={platformForm.api_secret}
                  onChange={(e) => setPlatformForm(prev => ({ ...prev, api_secret: e.target.value }))}
                  placeholder="API Secret"
                  disabled={!platformForm.enabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, platform_api_secret: !prev.platform_api_secret }))}
                >
                  {showSecrets.platform_api_secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Mağaza ID (Opsiyonel)</Label>
              <Input
                value={platformForm.store_id}
                onChange={(e) => setPlatformForm(prev => ({ ...prev, store_id: e.target.value }))}
                placeholder="Mağaza/Restoran ID"
                disabled={!platformForm.enabled}
              />
            </div>
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                Bu platform entegrasyonu henüz geliştirme aşamasındadır. 
                API dökümanları incelendikten sonra aktif edilecektir.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlatformModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSavePlatform} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
