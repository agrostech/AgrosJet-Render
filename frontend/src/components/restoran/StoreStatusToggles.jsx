import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { RefreshCw, Store, AlertCircle, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Platform konfigürasyonları
const PLATFORMS = [
  {
    key: "trendyol",
    name: "Trendyol Yemek",
    abbr: "TY",
    bg: "bg-orange-500",
    bgLight: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-600"
  },
  {
    key: "getir",
    name: "Getir Yemek",
    abbr: "G",
    bg: "bg-purple-600",
    bgLight: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-600"
  },
  {
    key: "yemeksepeti",
    name: "Yemeksepeti",
    abbr: "YS",
    bg: "bg-red-600",
    bgLight: "bg-red-50",
    border: "border-red-200",
    text: "text-red-600"
  },
  {
    key: "migros",
    name: "Migros Yemek",
    abbr: "MG",
    bg: "bg-orange-500",
    bgLight: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-600"
  }
];

export default function StoreStatusToggles({ restaurantId }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [openPlatforms, setOpenPlatforms] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (restaurantId) {
      fetchStores();
    }
  }, [restaurantId]);

  const fetchStores = async () => {
    try {
      const res = await axios.get(`${API}/integration-stores/${restaurantId}/summary`);
      setStores(res.data.stores || []);
      
      // Mağazası olan platformları otomatik aç
      const storesByPlatform = {};
      (res.data.stores || []).forEach(s => {
        storesByPlatform[s.platform] = true;
      });
      setOpenPlatforms(storesByPlatform);
    } catch (err) {
      console.error("Mağaza listesi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (store) => {
    if (!store.connected) {
      toast.error("Önce mağaza bağlantısını test ediniz");
      navigate("/restoran/entegrasyonlar");
      return;
    }
    
    const newStatus = !store.is_open;
    
    setUpdating(prev => ({ ...prev, [store.id]: true }));
    
    try {
      await axios.put(`${API}/integration-stores/${restaurantId}/${store.id}/status`, {
        is_open: newStatus
      });
      
      setStores(prev => prev.map(s => 
        s.id === store.id ? { ...s, is_open: newStatus } : s
      ));
      
      toast.success(`${store.name} ${newStatus ? "açıldı" : "kapatıldı"}`);
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Durum güncellenemedi";
      toast.error(errMsg);
    } finally {
      setUpdating(prev => ({ ...prev, [store.id]: false }));
    }
  };

  const togglePlatform = (platformKey) => {
    setOpenPlatforms(prev => ({
      ...prev,
      [platformKey]: !prev[platformKey]
    }));
  };

  const goToSettings = () => {
    navigate("/restoran/entegrasyonlar");
  };

  // Platform bazlı mağaza grupla
  const getStoresByPlatform = (platformKey) => {
    return stores.filter(s => s.platform === platformKey);
  };

  if (loading) {
    return null;
  }

  return (
    <Card data-testid="store-status-toggles">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Platform Mağazaları</CardTitle>
          </div>
          <button
            onClick={goToSettings}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            data-testid="store-settings-link"
          >
            <Settings className="w-3 h-3" />
            Ayarlar
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {PLATFORMS.map((platform) => {
          const platformStores = getStoresByPlatform(platform.key);
          const isOpen = openPlatforms[platform.key] || false;
          const openStoreCount = platformStores.filter(s => s.is_open && s.connected).length;
          const totalStoreCount = platformStores.length;
          
          return (
            <Collapsible
              key={platform.key}
              open={isOpen}
              onOpenChange={() => togglePlatform(platform.key)}
            >
              <CollapsibleTrigger asChild>
                <div 
                  className={`flex items-center justify-between p-3 rounded-lg border ${platform.border} ${platform.bgLight} cursor-pointer hover:shadow-sm transition-all`}
                  data-testid={`platform-card-${platform.key}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${platform.bg} rounded-lg flex items-center justify-center`}>
                      <span className="text-white font-bold text-sm">{platform.abbr}</span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{platform.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {totalStoreCount === 0 ? (
                          "Mağaza yok"
                        ) : (
                          <>
                            {totalStoreCount} mağaza
                            {openStoreCount > 0 && (
                              <span className="text-green-600 ml-1">• {openStoreCount} açık</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalStoreCount > 0 && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${openStoreCount > 0 ? "border-green-500 text-green-600" : "border-slate-300 text-slate-500"}`}
                      >
                        {openStoreCount}/{totalStoreCount}
                      </Badge>
                    )}
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="mt-2 ml-4 space-y-2">
                  {platformStores.length === 0 ? (
                    <div className="p-3 text-center text-sm text-muted-foreground bg-slate-50 rounded-lg">
                      <p>Henüz mağaza eklenmedi</p>
                      <button
                        onClick={goToSettings}
                        className="text-primary hover:underline text-xs mt-1"
                      >
                        Mağaza ekle
                      </button>
                    </div>
                  ) : (
                    platformStores.map((store) => {
                      const isUpdating = updating[store.id];
                      const isDisabled = !store.connected || isUpdating;
                      
                      return (
                        <div
                          key={store.id}
                          className={`flex items-center justify-between p-3 rounded-lg border bg-white ${!store.connected ? "opacity-70" : ""}`}
                          data-testid={`store-toggle-${store.id}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" title={store.name}>
                              {store.name}
                            </p>
                            {!store.connected ? (
                              <p className="text-xs text-yellow-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Test Gerekli
                              </p>
                            ) : (
                              <p className={`text-xs ${store.is_open ? "text-green-600" : "text-slate-500"}`}>
                                {store.is_open ? "Açık" : "Kapalı"}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isUpdating ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={store.is_open}
                                onCheckedChange={() => handleToggle(store)}
                                disabled={isDisabled}
                                data-testid={`store-switch-${store.id}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
