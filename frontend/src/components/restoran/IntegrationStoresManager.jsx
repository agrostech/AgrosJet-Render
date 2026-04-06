import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  RefreshCw, 
  Link2, 
  Unlink, 
  CheckCircle2, 
  XCircle, 
  Settings,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Store,
  ChevronDown,
  ChevronRight
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Platform konfigürasyonları (sıralama: Yemeksepeti, Trendyol, Getir, Migros)
const PLATFORM_CONFIG = {
  yemeksepeti: {
    name: "Yemeksepeti",
    abbr: "YS",
    color: "red",
    bgClass: "bg-red-600",
    bgLightClass: "bg-red-100",
    textClass: "text-red-600",
    fields: [
      { key: "client_id", label: "Client ID", type: "password", required: true },
      { key: "client_secret", label: "Client Secret", type: "password", required: true },
      { key: "chain_id", label: "Chain ID", type: "text", required: true, placeholder: "Zincir ID" },
      { key: "vendor_id", label: "Vendor ID", type: "text", required: true, placeholder: "Mağaza ID" }
    ],
    helpText: "Bu bilgileri Yemeksepeti Account Manager'dan temin ediniz. Webhook tabanlı çalışır.",
    helpUrl: null,
    isWebhook: true
  },
  trendyol: {
    name: "Trendyol Yemek",
    abbr: "TY",
    color: "orange",
    bgClass: "bg-orange-500",
    bgLightClass: "bg-orange-100",
    textClass: "text-orange-600",
    fields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "api_secret", label: "API Secret", type: "password", required: true },
      { key: "supplier_id", label: "Supplier ID (Satıcı ID)", type: "text", required: true, placeholder: "Örn: 107385" },
      { key: "store_id", label: "Store ID (Mağaza ID)", type: "text", required: false, placeholder: "Örn: 330 (opsiyonel)" }
    ],
    helpText: "API bilgilerinizi partner.trendyol.com adresinden alabilirsiniz.",
    helpUrl: "https://partner.trendyol.com"
  },
  getir: {
    name: "Getir Yemek",
    abbr: "G",
    color: "purple",
    bgClass: "bg-purple-600",
    bgLightClass: "bg-purple-100",
    textClass: "text-purple-600",
    fields: [
      { key: "restaurant_secret_key", label: "Restaurant Secret Key", type: "password", required: true, placeholder: "a04f73c8e4caf7f5..." },
      { key: "restaurant_id", label: "Getir Restaurant ID", type: "text", required: false, placeholder: "699817751a105bfd0b93ef38", description: "Getir tarafından verilen restoran ID (opsiyonel)" }
    ],
    helpText: "API bilgilerinizi Getir entegrasyon e-postasından alabilirsiniz.",
    helpUrl: null,
    isWebhook: false,
    isPolling: true,
    statusInfo: {
      "30saniye": "Sipariş 30 saniye içinde onaylanmalıdır",
      "1dakika": "verify → prepare → deliver arasında en az 1 dakika beklenmeli"
    }
  },
  migros: {
    name: "Migros Yemek",
    abbr: "MG",
    color: "orange",
    bgClass: "bg-orange-500",
    bgLightClass: "bg-orange-100",
    textClass: "text-orange-600",
    fields: [
      { key: "api_key", label: "API Key (XApiKey)", type: "password", required: true, placeholder: "Migros API Key" },
      { key: "store_id", label: "Store ID", type: "text", required: true, placeholder: "Restoran ID (örn: 23000000101833)" },
      { key: "store_group_id", label: "Zincir ID (Store Group)", type: "text", required: false, placeholder: "Store Group ID (örn: 1054)" }
    ],
    helpText: "API bilgilerini Migros Yemek Restoran Paneli üzerinden, Pos Entegrasyonu ekranından temin edebilirsiniz.",
    helpUrl: null,
    isWebhook: false
  }
};

export default function IntegrationStoresManager({ restaurantId }) {
  const [stores, setStores] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedPlatforms, setExpandedPlatforms] = useState({});
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({ name: "", enabled: true, credentials: {} });
  const [showSecrets, setShowSecrets] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [syncing, setSyncing] = useState({});
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [statusCooldown, setStatusCooldown] = useState({});
  const [migrosCloseDialog, setMigrosCloseDialog] = useState({ show: false, storeId: null }); // Rate limit için cooldown

  useEffect(() => {
    if (restaurantId) {
      fetchStores();
    }
  }, [restaurantId]);

  const fetchStores = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/integration-stores/${restaurantId}`);
      setStores(res.data.stores || []);
      setPlatforms(res.data.platforms || {});
    } catch (err) {
      console.error("Mağazalar yüklenemedi:", err);
      toast.error("Mağazalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Add new store
  const openAddModal = (platform) => {
    const config = PLATFORM_CONFIG[platform];
    setSelectedPlatform(platform);
    setFormData({
      name: config.name,
      enabled: true,
      credentials: {}
    });
    setShowSecrets({});
    setShowAddModal(true);
  };

  const handleAddStore = async () => {
    if (!selectedPlatform) return;
    
    setSaving(true);
    try {
      await axios.post(`${API}/integration-stores/${restaurantId}`, {
        platform: selectedPlatform,
        name: formData.name,
        enabled: formData.enabled,
        credentials: formData.credentials
      });
      
      toast.success("Mağaza eklendi");
      setShowAddModal(false);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Mağaza eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  // Edit store
  const openEditModal = (store) => {
    setSelectedStore(store);
    setSelectedPlatform(store.platform);
    // Mevcut credentials'ları form'a yükle (maskeli olsa bile göster)
    const existingCreds = store.credentials || {};
    setFormData({
      name: store.name,
      enabled: store.enabled,
      credentials: { ...existingCreds }
    });
    setShowSecrets({});
    setShowEditModal(true);
  };

  const handleEditStore = async () => {
    if (!selectedStore) return;
    
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        enabled: formData.enabled
      };
      
      // Sadece dolu credentials'ları gönder
      const filledCreds = {};
      Object.entries(formData.credentials).forEach(([key, value]) => {
        if (value) filledCreds[key] = value;
      });
      if (Object.keys(filledCreds).length > 0) {
        payload.credentials = filledCreds;
      }
      
      await axios.put(`${API}/integration-stores/${restaurantId}/${selectedStore.id}`, payload);
      
      toast.success("Mağaza güncellendi");
      setShowEditModal(false);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  // Delete store
  const openDeleteDialog = (store) => {
    setSelectedStore(store);
    setShowDeleteDialog(true);
  };

  const handleDeleteStore = async () => {
    if (!selectedStore) return;
    
    try {
      await axios.delete(`${API}/integration-stores/${restaurantId}/${selectedStore.id}`);
      toast.success("Mağaza silindi");
      setShowDeleteDialog(false);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Silme başarısız");
    }
  };

  // Test connection
  const handleTest = async (storeId) => {
    setTesting(prev => ({ ...prev, [storeId]: true }));
    try {
      const res = await axios.post(`${API}/integration-stores/${restaurantId}/${storeId}/test`);
      if (res.data.success) {
        toast.success(res.data.message || "Bağlantı başarılı");
      } else {
        toast.error(res.data.error || "Bağlantı testi başarısız");
      }
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Bağlantı testi başarısız");
    } finally {
      setTesting(prev => ({ ...prev, [storeId]: false }));
    }
  };

  // Sync orders
  const handleSync = async (storeId) => {
    setSyncing(prev => ({ ...prev, [storeId]: true }));
    try {
      const res = await axios.post(`${API}/integration-stores/${restaurantId}/${storeId}/sync`);
      const { synced, updated } = res.data;
      toast.success(`Senkronizasyon tamamlandı: ${synced} yeni, ${updated} güncellendi`);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Senkronizasyon başarısız");
    } finally {
      setSyncing(prev => ({ ...prev, [storeId]: false }));
    }
  };

  // Update status (open/close) with rate limit
  const handleStatusUpdate = async (storeId, isOpen, storeOffOption = null) => {
    // Rate limit kontrolü - 60 saniye içinde 1 kez
    const store = stores.find(s => s.id === storeId);
    const isGetir = store?.platform === "getir";
    
    if (isGetir && statusCooldown[storeId]) {
      const remaining = Math.ceil((statusCooldown[storeId] - Date.now()) / 1000);
      if (remaining > 0) {
        toast.error(`Getir rate limit: ${remaining} saniye sonra tekrar deneyiniz.`);
        return;
      }
    }
    
    setUpdatingStatus(prev => ({ ...prev, [storeId]: true }));
    try {
      const body = { is_open: isOpen };
      if (storeOffOption) body.store_off_option = storeOffOption;
      
      await axios.put(`${API}/integration-stores/${restaurantId}/${storeId}/status`, body);
      toast.success(`Mağaza ${isOpen ? "açıldı" : "kapatıldı"}`);
      
      // Getir için 60 saniyelik cooldown başlat
      if (isGetir) {
        setStatusCooldown(prev => ({ ...prev, [storeId]: Date.now() + 60000 }));
      }
      
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [storeId]: false }));
      setMigrosCloseDialog({ show: false, storeId: null });
    }
  };

  // Group stores by platform
  const storesByPlatform = stores.reduce((acc, store) => {
    if (!acc[store.platform]) acc[store.platform] = [];
    acc[store.platform].push(store);
    return acc;
  }, {});

  // Render form fields
  const renderFormFields = (platform, isEdit = false) => {
    const config = PLATFORM_CONFIG[platform];
    if (!config) return null;

    const baseUrl = process.env.REACT_APP_BACKEND_URL;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Mağaza Adı</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Örn: Kadıköy Şubesi"
          />
        </div>

        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div>
            <Label>Entegrasyon Durumu</Label>
            <p className="text-xs text-muted-foreground">Bu entegrasyonu aktif et</p>
          </div>
          <Switch
            checked={formData.enabled}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
          />
        </div>

        {config.fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label>
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </Label>
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
            {field.type === "checkbox" ? (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={field.key}
                  checked={formData.credentials[field.key] || false}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    credentials: { ...prev.credentials, [field.key]: e.target.checked }
                  }))}
                  disabled={!formData.enabled}
                  className="w-4 h-4"
                />
                <Label htmlFor={field.key} className="text-sm font-normal cursor-pointer">
                  {field.placeholder || "Aktif"}
                </Label>
              </div>
            ) : (
              <div className="relative">
                <Input
                  type={field.type === "password" && !showSecrets[field.key] ? "password" : "text"}
                  value={formData.credentials[field.key] || ""}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    credentials: { ...prev.credentials, [field.key]: e.target.value }
                  }))}
                  onFocus={(e) => {
                    // Maskeli değer (****) varsa temizle
                    if (e.target.value && e.target.value.startsWith("****")) {
                      setFormData(prev => ({
                        ...prev,
                        credentials: { ...prev.credentials, [field.key]: "" }
                      }));
                    }
                  }}
                  placeholder={isEdit && formData.credentials[field.key]?.startsWith?.("****") 
                    ? "Değiştirmek için tıklayın" 
                    : (field.placeholder || field.label)}
                  disabled={!formData.enabled}
                />
                {field.type === "password" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  >
                    {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Webhook URL'leri göster */}
        {config.isWebhook && config.webhookInfo && (
          <div className="p-4 bg-slate-50 border rounded-lg space-y-3">
            <div>
              <Label className="text-sm font-semibold">Webhook Bilgileri (Otomatik Yapılandırılmış)</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Bu bilgiler platform entegrasyonu için kullanılmaktadır.
              </p>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-slate-700">Sipariş Webhook:</p>
                <code className="block text-xs bg-white p-2 rounded border break-all">
                  {baseUrl}{config.webhookInfo.orderEndpoint}
                </code>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-700">İptal Webhook:</p>
                <code className="block text-xs bg-white p-2 rounded border break-all">
                  {baseUrl}{config.webhookInfo.cancelEndpoint}
                </code>
              </div>
              {config.webhookInfo.statusEndpoint && (
                <div>
                  <p className="text-xs font-medium text-slate-700">Durum Webhook:</p>
                  <code className="block text-xs bg-white p-2 rounded border break-all">
                    {baseUrl}{config.webhookInfo.statusEndpoint}
                  </code>
                </div>
              )}
              {config.webhookInfo.apiKey && (
                <div>
                  <p className="text-xs font-medium text-slate-700">x-api-key:</p>
                  <code className="block text-xs bg-white p-2 rounded border break-all font-mono">
                    {config.webhookInfo.apiKey}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}

        {config.helpText && (
          <div className={`p-3 ${config.bgLightClass} border rounded-lg`}>
            <p className={`text-xs ${config.textClass}`}>
              <strong>Bilgi:</strong> {config.helpText}
              {config.helpUrl && (
                <a href={config.helpUrl} target="_blank" rel="noopener noreferrer" className="underline ml-1">
                  Panele Git
                </a>
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="integration-stores-manager">
      <div>
        <h1 className="text-2xl font-bold">Entegrasyonlar</h1>
        <p className="text-sm text-muted-foreground">
          Platform mağazalarınızı yönetin. Her platform için birden fazla mağaza ekleyebilirsiniz.
        </p>
      </div>

      {/* Platform Cards */}
      {Object.entries(PLATFORM_CONFIG).map(([platformKey, config]) => {
        const platformStores = storesByPlatform[platformKey] || [];
        const isDisabled = config.disabled;
        const isExpanded = expandedPlatforms[platformKey] || false;

        return (
          <Collapsible 
            key={platformKey} 
            open={isExpanded}
            onOpenChange={(open) => setExpandedPlatforms(prev => ({ ...prev, [platformKey]: open }))}
          >
            <Card className={isDisabled ? "opacity-60" : ""}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div className={`w-8 h-8 ${config.bgClass} rounded-lg flex items-center justify-center`}>
                        <span className="text-white font-bold text-sm">{config.abbr}</span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">{config.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {platformStores.length > 0 
                            ? `${platformStores.length} mağaza tanımlı`
                            : isDisabled ? "Yakında" : "Henüz mağaza eklenmedi"
                          }
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); openAddModal(platformKey); }}
                      disabled={isDisabled}
                      data-testid={`add-store-${platformKey}`}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Mağaza Ekle
                    </Button>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                {platformStores.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {platformStores.map((store) => (
                        <div
                          key={store.id}
                          className={`p-4 rounded-lg border ${config.bgLightClass} transition-all`}
                          data-testid={`store-card-${store.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 ${config.bgClass} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                <Store className="w-5 h-5 text-white" />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-medium truncate">{store.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  {store.connected ? (
                                    <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Bağlı
                                    </Badge>
                                  ) : store.credentials && Object.values(store.credentials).some(v => v) ? (
                                    <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
                                      <XCircle className="w-3 h-3 mr-1" />
                                      Test Gerekli
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-slate-300 text-slate-500 text-xs">
                                      Yapılandırılmamış
                                    </Badge>
                                  )}
                                  {store.enabled && store.connected && (
                                    <Badge 
                                      variant={store.is_open ? "default" : "secondary"}
                                      className={`text-xs ${store.is_open ? "bg-green-500" : "bg-slate-400"}`}
                                    >
                                      {store.is_open ? "Açık" : "Kapalı"}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Open/Close Buttons */}
                              {store.connected && (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant={store.is_open ? "outline" : "default"}
                                      onClick={() => handleStatusUpdate(store.id, true)}
                                      disabled={updatingStatus[store.id] || store.is_open || (store.platform === "getir" && statusCooldown[store.id] > Date.now())}
                                      className={`h-8 px-2 ${!store.is_open ? "bg-green-600 hover:bg-green-700" : ""}`}
                                    >
                                      <Power className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={!store.is_open ? "outline" : "destructive"}
                                      onClick={() => {
                                        if (store.platform === "migros") {
                                          setMigrosCloseDialog({ show: true, storeId: store.id });
                                        } else {
                                          handleStatusUpdate(store.id, false);
                                        }
                                      }}
                                      disabled={updatingStatus[store.id] || !store.is_open || (store.platform === "getir" && statusCooldown[store.id] > Date.now())}
                                      className="h-8 px-2"
                                    >
                                      <PowerOff className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  {store.platform === "getir" && (
                                    <span className="text-[10px] text-muted-foreground">
                                      60sn içinde 1 kez değiştirilebilir
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                      {/* Actions */}
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditModal(store)}
                        >
                          <Settings className="w-4 h-4 mr-1" />
                          Düzenle
                        </Button>

                        {store.credentials && Object.values(store.credentials).some(v => v) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTest(store.id)}
                            disabled={testing[store.id]}
                            data-testid={`test-store-${store.id}`}
                          >
                            {testing[store.id] ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Link2 className="w-4 h-4" />
                            )}
                            <span className="ml-1">Test</span>
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteDialog(store)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Add Store Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedPlatform && PLATFORM_CONFIG[selectedPlatform]?.name} Mağazası Ekle
            </DialogTitle>
            <DialogDescription>
              Yeni bir {selectedPlatform && PLATFORM_CONFIG[selectedPlatform]?.name} mağazası ekleyin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {selectedPlatform && renderFormFields(selectedPlatform)}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              İptal
            </Button>
            <Button onClick={handleAddStore} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Store Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mağaza Düzenle</DialogTitle>
            <DialogDescription>
              {selectedStore?.name} mağazasını düzenleyin.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {selectedPlatform && renderFormFields(selectedPlatform, true)}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              İptal
            </Button>
            <Button onClick={handleEditStore} disabled={saving}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mağazayı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              "{selectedStore?.name}" mağazasını silmek istediğinize emin misiniz? 
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStore}
              className="bg-red-600 hover:bg-red-700"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Migros Geçici Kapatma Dialog */}
      <AlertDialog open={migrosCloseDialog.show} onOpenChange={(open) => !open && setMigrosCloseDialog({ show: false, storeId: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Migros Geçici Kapatma</AlertDialogTitle>
            <AlertDialogDescription>
              Restoranı ne kadar süreliğine kapatmak istiyorsunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 py-2" data-testid="migros-close-options">
            <Button
              variant="outline"
              className="justify-start"
              disabled={updatingStatus[migrosCloseDialog.storeId]}
              onClick={() => handleStatusUpdate(migrosCloseDialog.storeId, false, "ONE_HOUR")}
              data-testid="migros-close-1h"
            >
              1 Saat
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={updatingStatus[migrosCloseDialog.storeId]}
              onClick={() => handleStatusUpdate(migrosCloseDialog.storeId, false, "FOUR_HOUR")}
              data-testid="migros-close-4h"
            >
              4 Saat
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              disabled={updatingStatus[migrosCloseDialog.storeId]}
              onClick={() => handleStatusUpdate(migrosCloseDialog.storeId, false, "NEXT_WORK_HOUR")}
              data-testid="migros-close-next-work"
            >
              Sonraki Mesai Başlangıcına Kadar
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
