import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Store, AlertCircle, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Platform renkleri
const PLATFORM_COLORS = {
  trendyol: {
    bg: "bg-orange-500",
    bgLight: "bg-orange-100",
    text: "text-orange-600",
    border: "border-orange-200"
  },
  getir: {
    bg: "bg-purple-600",
    bgLight: "bg-purple-100", 
    text: "text-purple-600",
    border: "border-purple-200"
  },
  yemeksepeti: {
    bg: "bg-red-600",
    bgLight: "bg-red-100",
    text: "text-red-600",
    border: "border-red-200"
  },
  migros: {
    bg: "bg-orange-500",
    bgLight: "bg-orange-100",
    text: "text-orange-600",
    border: "border-orange-200"
  }
};

// Platform kısaltmaları
const PLATFORM_ABBR = {
  trendyol: "TY",
  getir: "G",
  yemeksepeti: "YS",
  migros: "MG"
};

export default function StoreStatusToggles({ restaurantId }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
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
    } catch (err) {
      console.error("Mağaza listesi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (storeId, currentStatus, platform) => {
    const newStatus = !currentStatus;
    
    setUpdating(prev => ({ ...prev, [storeId]: true }));
    
    try {
      await axios.put(`${API}/integration-stores/${restaurantId}/${storeId}/status`, {
        is_open: newStatus
      });
      
      // Local state güncelle
      setStores(prev => prev.map(s => 
        s.id === storeId ? { ...s, is_open: newStatus } : s
      ));
      
      const platformName = stores.find(s => s.id === storeId)?.name || platform;
      toast.success(`${platformName} ${newStatus ? "açıldı" : "kapatıldı"}`);
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Durum güncellenemedi";
      toast.error(errMsg);
    } finally {
      setUpdating(prev => ({ ...prev, [storeId]: false }));
    }
  };

  const goToSettings = () => {
    navigate("/restoran/entegrasyonlar");
  };

  // Mağaza yoksa gösterme
  if (loading) {
    return null;
  }

  if (stores.length === 0) {
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
          >
            <Settings className="w-3 h-3" />
            Ayarlar
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {stores.map((store) => {
            const colors = PLATFORM_COLORS[store.platform] || PLATFORM_COLORS.migros;
            const abbr = PLATFORM_ABBR[store.platform] || store.platform.substring(0, 2).toUpperCase();
            const isUpdating = updating[store.id];
            
            return (
              <div
                key={store.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${colors.border} ${colors.bgLight} transition-all`}
                data-testid={`store-toggle-${store.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white font-bold text-xs">{abbr}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={store.name}>
                      {store.name}
                    </p>
                    <p className={`text-xs ${store.is_open ? "text-green-600" : "text-slate-500"}`}>
                      {store.is_open ? "Açık" : "Kapalı"}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isUpdating ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={store.is_open}
                      onCheckedChange={() => handleToggle(store.id, store.is_open, store.platform)}
                      disabled={isUpdating}
                      data-testid={`store-switch-${store.id}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {stores.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertCircle className="w-5 h-5 mx-auto mb-2" />
            <p>Bağlı mağaza bulunamadı.</p>
            <button
              onClick={goToSettings}
              className="text-primary hover:underline mt-1"
            >
              Entegrasyon ekle
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
