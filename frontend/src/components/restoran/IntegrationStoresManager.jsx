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
  Store
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Platform konfigürasyonları
const PLATFORM_CONFIG = {
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
      { key: "app_secret_key", label: "App Secret Key", type: "password", required: true },
      { key: "restaurant_secret_key", label: "Restaurant Secret Key", type: "password", required: true },
      { key: "webhook_api_key", label: "Webhook API Key", type: "text", required: true, placeholder: "Getir'e vereceğiniz x-api-key", description: "Getir'e vereceğiniz güvenlik anahtarı" }
    ],
    helpText: "API bilgilerinizi Getir İş Ortağı panelinden alabilirsiniz.",
    helpUrl: null,
    isWebhook: true,
    webhookInfo: {
      orderEndpoint: "/api/webhooks/getir/order",
      cancelEndpoint: "/api/webhooks/getir/cancel"
    }
  },
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
  migros: {
    name: "Migros Yemek",
    abbr: "MG",
    color: "orange",
    bgClass: "bg-orange-500",
    bgLightClass: "bg-orange-100",
    textClass: "text-orange-600",
    fields: [],
    helpText: "Bu entegrasyon henüz geliştirme aşamasındadır.",
    disabled: true
  }
};

export default function IntegrationStoresManager({ restaurantId }) {
  const [stores, setStores] = useState([]);
  const [platforms, setPlatforms] = useState({});
  const [loading, setLoading] = useState(true);
  
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
    setFormData({
      name: store.name,
      enabled: store.enabled,
      credentials: {} // Boş gönder, sadece değişenler güncellenir
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
      toast.success(res.data.message || "Bağlantı başarılı");
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bağlantı testi başarısız");
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

  // Update status (open/close)
  const handleStatusUpdate = async (storeId, isOpen) => {
    setUpdatingStatus(prev => ({ ...prev, [storeId]: true }));
    try {
      await axios.put(`${API}/integration-stores/${restaurantId}/${storeId}/status`, {
        is_open: isOpen
      });
      toast.success(`Mağaza ${isOpen ? "açıldı" : "kapatıldı"}`);
      fetchStores();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum güncellenemedi");
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [storeId]: false }));
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
            <div className="relative">
              <Input
                type={field.type === "password" && !showSecrets[field.key] ? "password" : "text"}
                value={formData.credentials[field.key] || ""}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  credentials: { ...prev.credentials, [field.key]: e.target.value }
                }))}
                placeholder={isEdit ? "Değiştirmek için yeni değer girin" : (field.placeholder || field.label)}
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
          </div>
        ))}

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

        return (
          <Card key={platformKey} className={isDisabled ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                  onClick={() => openAddModal(platformKey)}
                  disabled={isDisabled}
                  data-testid={`add-store-${platformKey}`}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Mağaza Ekle
                </Button>
              </div>
            </CardHeader>

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
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={store.is_open ? "outline" : "default"}
                                onClick={() => handleStatusUpdate(store.id, true)}
                                disabled={updatingStatus[store.id] || store.is_open}
                                className={`h-8 px-2 ${!store.is_open ? "bg-green-600 hover:bg-green-700" : ""}`}
                              >
                                <Power className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant={!store.is_open ? "outline" : "destructive"}
                                onClick={() => handleStatusUpdate(store.id, false)}
                                disabled={updatingStatus[store.id] || !store.is_open}
                                className="h-8 px-2"
                              >
                                <PowerOff className="w-3 h-3" />
                              </Button>
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

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(store.id)}
                          disabled={testing[store.id]}
                        >
                          {testing[store.id] ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                          <span className="ml-1">Test</span>
                        </Button>

                        {store.connected && platformKey !== "yemeksepeti" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSync(store.id)}
                            disabled={syncing[store.id]}
                          >
                            {syncing[store.id] ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            <span className="ml-1">Senkronize</span>
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
          </Card>
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
    </div>
  );
}
