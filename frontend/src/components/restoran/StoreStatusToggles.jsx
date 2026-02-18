import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { RefreshCw, ChevronDown, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORMS = [
  { key: "yemeksepeti", name: "Yemeksepeti", color: "#E31E52" },
  { key: "trendyol", name: "Trendyol Yemek", color: "#F27A1A" },
  { key: "getir", name: "Getir Yemek", color: "#5D3EBC" },
  { key: "migros", name: "Migros Yemek", color: "#F27A1A" }
];

export default function StoreStatusToggles({ restaurantId }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [openPlatforms, setOpenPlatforms] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (restaurantId) fetchStores();
  }, [restaurantId]);

  const fetchStores = async () => {
    try {
      const res = await axios.get(`${API}/integration-stores/${restaurantId}/summary`);
      const storeData = res.data.stores || [];
      setStores(storeData);
      
      // Mağazası olan platformları aç
      const open = {};
      storeData.forEach(s => { open[s.platform] = true; });
      setOpenPlatforms(open);
    } catch (err) {
      console.error("Mağaza listesi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (store) => {
    if (!store.connected) {
      toast.error("Önce bağlantıyı test edin");
      navigate("/restoran/entegrasyonlar");
      return;
    }
    
    setUpdating(prev => ({ ...prev, [store.id]: true }));
    
    try {
      const newStatus = !store.is_open;
      await axios.put(`${API}/integration-stores/${restaurantId}/${store.id}/status`, {
        is_open: newStatus
      });
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_open: newStatus } : s));
      toast.success(`${store.name} ${newStatus ? "açıldı" : "kapatıldı"}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Hata oluştu");
    } finally {
      setUpdating(prev => ({ ...prev, [store.id]: false }));
    }
  };

  const getStoresByPlatform = (key) => stores.filter(s => s.platform === key);

  if (loading) return null;

  return (
    <div className="bg-white border rounded-xl p-4" data-testid="store-status-toggles">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-700">Entegrasyon Yönetimi</span>
        <button
          onClick={() => navigate("/restoran/entegrasyonlar")}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {PLATFORMS.map((platform) => {
          const platformStores = getStoresByPlatform(platform.key);
          const isOpen = openPlatforms[platform.key];
          const openCount = platformStores.filter(s => s.is_open && s.connected).length;

          return (
            <Collapsible
              key={platform.key}
              open={isOpen}
              onOpenChange={() => setOpenPlatforms(prev => ({ ...prev, [platform.key]: !prev[platform.key] }))}
            >
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between py-2 px-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: platform.color }}
                    />
                    <span className="text-xs text-slate-600">{platform.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {platformStores.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {openCount}/{platformStores.length}
                      </span>
                    )}
                    <ChevronDown 
                      className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} 
                    />
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="pl-4 space-y-1 pb-1 pt-1">
                  {platformStores.length === 0 ? (
                    <p className="text-[10px] text-slate-400 py-1">Mağaza yok</p>
                  ) : (
                    platformStores.map((store) => (
                      <div
                        key={store.id}
                        className="flex items-center justify-between py-1"
                        data-testid={`store-toggle-${store.id}`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-xs truncate ${store.connected ? "text-slate-700" : "text-slate-400"}`}>
                            {store.name}
                          </span>
                          {!store.connected && (
                            <span className="text-[9px] text-amber-500 bg-amber-50 px-1 rounded flex-shrink-0">
                              Test
                            </span>
                          )}
                        </div>
                        {updating[store.id] ? (
                          <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                        ) : (
                          <Switch
                            checked={store.is_open}
                            onCheckedChange={() => handleToggle(store)}
                            disabled={!store.connected}
                            className="scale-[0.65]"
                            data-testid={`store-switch-${store.id}`}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
