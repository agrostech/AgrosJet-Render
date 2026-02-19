import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Store,
  Truck
} from "lucide-react";
import IntegrationStoresManager from "@/components/restoran/IntegrationStoresManager";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantEntegrasyonlar({ restaurantId }) {
  const [adisyoData, setAdisyoData] = useState(null);
  const [sepettakipData, setSepettakipData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Adisyo Modal states
  const [showAdisyoModal, setShowAdisyoModal] = useState(false);
  const [adisyoForm, setAdisyoForm] = useState({ api_key: "", api_secret: "", branch_id: "" });
  const [showSecrets, setShowSecrets] = useState({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // SepetTakip Modal states
  const [showSepettakipModal, setShowSepettakipModal] = useState(false);
  const [sepettakipForm, setSepettakipForm] = useState({ restaurant_id: "", password: "" });
  const [testingSepettakip, setTestingSepettakip] = useState(false);
  const [savingSepettakip, setSavingSepettakip] = useState(false);

  useEffect(() => {
    if (restaurantId) {
      fetchAdisyoData();
      fetchSepettakipData();
    }
  }, [restaurantId]);

  const fetchAdisyoData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurant-integrations/${restaurantId}/adisyo`);
      setAdisyoData(res.data.adisyo);
    } catch (err) {
      console.error("Adisyo verisi yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSepettakipData = async () => {
    try {
      const res = await axios.get(`${API}/restaurant-integrations/${restaurantId}/sepettakip`);
      setSepettakipData(res.data.sepettakip);
    } catch (err) {
      console.error("SepetTakip verisi yüklenemedi:", err);
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
      fetchAdisyoData();
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
      fetchAdisyoData();
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
      fetchAdisyoData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // SepetTakip handlers
  const openSepettakipModal = () => {
    setSepettakipForm({
      restaurant_id: sepettakipData?.restaurant_id || "",
      password: ""
    });
    setShowSecrets({});
    setShowSepettakipModal(true);
  };

  const handleSaveSepettakip = async () => {
    if (!sepettakipForm.restaurant_id) {
      toast.error("Restoran ID gerekli");
      return;
    }
    
    setSavingSepettakip(true);
    try {
      await axios.put(`${API}/restaurant-integrations/${restaurantId}/sepettakip`, {
        restaurant_id: sepettakipForm.restaurant_id,
        password: sepettakipForm.password || undefined
      });
      toast.success("SepetTakip ayarları kaydedildi");
      setShowSepettakipModal(false);
      fetchSepettakipData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSavingSepettakip(false);
    }
  };

  const handleTestSepettakip = async () => {
    setTestingSepettakip(true);
    try {
      await axios.post(`${API}/restaurant-integrations/${restaurantId}/sepettakip/test`);
      toast.success("SepetTakip bağlantısı başarılı");
      fetchSepettakipData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
    } finally {
      setTestingSepettakip(false);
    }
  };

  const handleDisconnectSepettakip = async () => {
    if (!confirm("SepetTakip entegrasyonunu kaldırmak istediğinize emin misiniz?")) return;
    
    try {
      await axios.delete(`${API}/restaurant-integrations/${restaurantId}/sepettakip`);
      toast.success("SepetTakip entegrasyonu kaldırıldı");
      fetchSepettakipData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  return (
    <div className="space-y-6" data-testid="restaurant-entegrasyonlar">
      {/* Yemek Platformları - Çoklu Mağaza Desteği */}
      <IntegrationStoresManager restaurantId={restaurantId} />

      {/* Diğer Entegrasyonlar - Adisyo POS (Tek Mağaza) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            <CardTitle className="text-lg">POS Entegrasyonları</CardTitle>
          </div>
          <CardDescription>
            POS ve restoran yönetim sistemleri (tek mağaza)
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

          {/* SepetTakip Kurye */}
          <div className="p-4 rounded-lg border mt-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="font-bold text-sm text-orange-600">ST</span>
                </div>
                <div>
                  <h3 className="font-medium">SepetTakip Kurye</h3>
                  <p className="text-xs text-muted-foreground">
                    Yemeksepeti, Getir, Trendyol siparişlerini otomatik kurye sistemine aktar
                  </p>
                </div>
              </div>
              {sepettakipData?.enabled ? (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Aktif
                </Badge>
              ) : sepettakipData?.has_credentials ? (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  <XCircle className="w-3 h-3 mr-1" />
                  Pasif
                </Badge>
              ) : null}
            </div>
            
            {sepettakipData?.has_credentials && (
              <div className="mt-3 p-2 bg-orange-50 rounded text-xs text-muted-foreground">
                <span className="font-medium">Restoran ID:</span> {sepettakipData.restaurant_id}
              </div>
            )}
            
            <div className="mt-3 flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={openSepettakipModal}
                className="flex-1"
              >
                <Settings className="w-4 h-4 mr-1" />
                {sepettakipData?.has_credentials ? "Düzenle" : "Yapılandır"}
              </Button>
              
              {sepettakipData?.has_credentials && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleTestSepettakip}
                    disabled={testingSepettakip}
                  >
                    {testingSepettakip ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    <span className="ml-1">Test</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleDisconnectSepettakip}
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

      {/* SepetTakip Modal */}
      <Dialog open={showSepettakipModal} onOpenChange={setShowSepettakipModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>SepetTakip Kurye Entegrasyonu</DialogTitle>
            <DialogDescription>
              SepetTakip'ten aldığınız restoran bilgilerinizi girin
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Restoran ID</Label>
              <Input
                value={sepettakipForm.restaurant_id}
                onChange={(e) => setSepettakipForm(prev => ({ ...prev, restaurant_id: e.target.value }))}
                placeholder="SepetTakip Restoran ID (örn: 934)"
              />
              <p className="text-xs text-muted-foreground">
                SepetTakip tarafından verilen restoran numaranız
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Şifre</Label>
              <div className="relative">
                <Input
                  type={showSecrets.sepettakip_password ? "text" : "password"}
                  value={sepettakipForm.password}
                  onChange={(e) => setSepettakipForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={sepettakipData?.has_credentials ? "Değiştirmek için yeni şifre girin" : "Şifre"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecrets(prev => ({ ...prev, sepettakip_password: !prev.sepettakip_password }))}
                >
                  {showSecrets.sepettakip_password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">
                <strong>Not:</strong> Bu bilgileri SepetTakip ekibinden talep edebilirsiniz. 
                Entegrasyon aktif olduktan sonra yemek platformlarından gelen siparişler 
                otomatik olarak kurye sistemine aktarılacaktır.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSepettakipModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveSepettakip} disabled={savingSepettakip}>
              {savingSepettakip ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
