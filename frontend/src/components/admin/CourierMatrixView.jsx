import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { 
  Search, 
  Check, 
  X, 
  Banknote, 
  CreditCard, 
  Globe,
  UtensilsCrossed,
  Package,
  Coffee,
  Clock,
  RefreshCw,
  User
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CourierMatrixView({ companyId, onCourierClick }) {
  const [data, setData] = useState({ couriers: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState({});

  useEffect(() => {
    if (companyId) {
      fetchMatrix();
    }
  }, [companyId]);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers/matrix`);
      setData(res.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filtrelenmiş kuryeler
  const filteredCouriers = useMemo(() => {
    if (!search.trim()) return data.couriers;
    const term = search.toLowerCase();
    return data.couriers.filter(c => 
      c.name?.toLowerCase().includes(term) ||
      c.phone?.includes(term) ||
      c.plate?.toLowerCase().includes(term)
    );
  }, [data.couriers, search]);

  // Hücre değerini güncelle (ödeme yöntemleri için)
  const handlePaymentMethodToggle = async (courierId, methodKey, currentValue) => {
    const cellKey = `${courierId}-payment-${methodKey}`;
    setUpdating(prev => ({ ...prev, [cellKey]: true }));
    
    const newValue = !currentValue;
    
    // Optimistic update
    setData(prev => ({
      ...prev,
      couriers: prev.couriers.map(c => {
        if (c.id !== courierId) return c;
        return { 
          ...c, 
          payment_methods: { ...c.payment_methods, [methodKey]: newValue } 
        };
      })
    }));
    
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/matrix/bulk-update`, [{
        courier_id: courierId,
        setting_type: "payment_method",
        setting_key: methodKey,
        value: newValue
      }]);
    } catch (err) {
      // Revert on error
      setData(prev => ({
        ...prev,
        couriers: prev.couriers.map(c => {
          if (c.id !== courierId) return c;
          return { 
            ...c, 
            payment_methods: { ...c.payment_methods, [methodKey]: currentValue } 
          };
        })
      }));
      toast.error("Güncelleme başarısız");
    } finally {
      setUpdating(prev => ({ ...prev, [cellKey]: false }));
    }
  };

  // Sayısal değer güncelleme (max paket, mola limiti)
  const handleNumericUpdate = async (courierId, settingType, currentValue, newValue) => {
    if (newValue === currentValue) return;
    
    const cellKey = `${courierId}-${settingType}`;
    setUpdating(prev => ({ ...prev, [cellKey]: true }));
    
    // Optimistic update
    const fieldName = settingType === "max_packages" ? "max_packages" : "daily_break_limit";
    setData(prev => ({
      ...prev,
      couriers: prev.couriers.map(c => {
        if (c.id !== courierId) return c;
        return { ...c, [fieldName]: newValue };
      })
    }));
    
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/matrix/bulk-update`, [{
        courier_id: courierId,
        setting_type: settingType,
        setting_key: fieldName,
        value: newValue
      }]);
    } catch (err) {
      // Revert on error
      setData(prev => ({
        ...prev,
        couriers: prev.couriers.map(c => {
          if (c.id !== courierId) return c;
          return { ...c, [fieldName]: currentValue };
        })
      }));
      toast.error("Güncelleme başarısız");
    } finally {
      setUpdating(prev => ({ ...prev, [cellKey]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="default" />
      </div>
    );
  }

  // Ödeme yöntemleri sütunları
  const paymentCols = [
    { key: "cash", label: "Nakit", icon: Banknote },
    { key: "card", label: "Kart", icon: CreditCard },
    { key: "online", label: "Online", icon: Globe },
    { key: "meal_card", label: "Y.Kartı", icon: UtensilsCrossed },
    { key: "online_meal_card", label: "Onl.Y.K.", icon: Globe }
  ];

  // Ücretlendirme türü label
  const getPricingLabel = (type) => {
    switch (type) {
      case "per_km": return "KM";
      case "hourly": return "Saatlik";
      case "tiered": return "Kademeli";
      default: return "Pkt Başı";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Kurye ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filteredCouriers.length} kurye</span>
          <Button variant="outline" size="sm" onClick={fetchMatrix}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs bg-slate-50 p-2 rounded border">
        <span className="font-medium text-slate-600">Renk Kodları:</span>
        <div className="flex items-center gap-1">
          <Check className="w-4 h-4 text-green-600" />
          <span>Aktif</span>
        </div>
        <div className="flex items-center gap-1">
          <X className="w-4 h-4 text-red-400" />
          <span>Pasif</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="border rounded-lg overflow-auto max-h-[600px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            {/* Grup Başlıkları */}
            <tr className="bg-slate-100">
              <th className="sticky left-0 z-20 bg-slate-100 p-2 text-left font-semibold border-r-2 border-slate-300 min-w-[140px]">
                Kurye
              </th>
              <th colSpan={2} className="p-2 text-center font-semibold bg-amber-100 border-r-2 border-slate-300">
                <div className="flex items-center justify-center gap-1">
                  <Package className="w-3 h-3" />
                  Ücretlendirme
                </div>
              </th>
              <th colSpan={5} className="p-2 text-center font-semibold bg-green-100 border-r-2 border-slate-300">
                <div className="flex items-center justify-center gap-1">
                  <Banknote className="w-3 h-3" />
                  Ödeme Yöntemleri
                </div>
              </th>
              <th className="p-2 text-center font-semibold bg-blue-100 border-r-2 border-slate-300">
                <div className="flex items-center justify-center gap-1">
                  <Package className="w-3 h-3" />
                  Max
                </div>
              </th>
              <th className="p-2 text-center font-semibold bg-purple-100">
                <div className="flex items-center justify-center gap-1">
                  <Coffee className="w-3 h-3" />
                  Mola
                </div>
              </th>
            </tr>
            
            {/* Alt Başlıklar */}
            <tr className="bg-white border-b-2 border-slate-300">
              <th className="sticky left-0 z-20 bg-white p-2 text-left text-[10px] text-muted-foreground border-r-2 border-slate-300">
                İsim
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-amber-50 border-r border-slate-300">
                Tür
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-amber-50 border-r-2 border-slate-300">
                Saat ₺
              </th>
              {paymentCols.map((col, i) => (
                <th 
                  key={`pay-${col.key}`} 
                  className={`p-1.5 text-center text-[10px] text-muted-foreground bg-green-50 ${i === paymentCols.length - 1 ? 'border-r-2 border-slate-300' : 'border-r border-slate-300'}`}
                >
                  {col.label}
                </th>
              ))}
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-blue-50 border-r-2 border-slate-300">
                Paket
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-purple-50">
                Dk
              </th>
            </tr>
          </thead>
          
          <tbody>
            {filteredCouriers.map(courier => {
              return (
                <tr key={courier.id} className="border-b border-slate-300 hover:bg-slate-50/50">
                  {/* Kurye İsmi */}
                  <td 
                    className="sticky left-0 z-10 bg-white p-2 font-medium border-r-2 border-slate-300 cursor-pointer hover:text-primary"
                    onClick={() => onCourierClick?.(courier)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[120px]">{courier.name}</span>
                      {courier.plate && (
                        <span className="text-[9px] px-1 bg-slate-200 text-slate-600 rounded">{courier.plate}</span>
                      )}
                    </div>
                  </td>
                  
                  {/* Ücretlendirme Türü */}
                  <td className="p-1 text-center border-r border-slate-300">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                      courier.pricing_type === "per_km" 
                        ? "bg-purple-100 text-purple-700" 
                        : courier.pricing_type === "hourly"
                        ? "bg-blue-100 text-blue-700"
                        : courier.pricing_type === "tiered"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {getPricingLabel(courier.pricing_type)}
                    </span>
                  </td>
                  
                  {/* Saatlik Ücret */}
                  <td className="p-1 text-center border-r-2 border-slate-300">
                    <span className="text-[11px] font-medium">
                      {courier.hourly_rate ? `${courier.hourly_rate}₺` : "-"}
                    </span>
                  </td>
                  
                  {/* Ödeme Yöntemleri */}
                  {paymentCols.map((col, i) => {
                    const value = courier.payment_methods?.[col.key] ?? true;
                    const cellKey = `${courier.id}-payment-${col.key}`;
                    const isUpdatingCell = updating[cellKey];
                    
                    return (
                      <td 
                        key={`pay-${col.key}`}
                        className={`p-1 text-center cursor-pointer transition-colors ${i === paymentCols.length - 1 ? 'border-r-2 border-slate-300' : 'border-r border-slate-300'}`}
                        onClick={() => !isUpdatingCell && handlePaymentMethodToggle(courier.id, col.key, value)}
                      >
                        {isUpdatingCell ? (
                          <RefreshCw className="w-3 h-3 animate-spin mx-auto text-slate-400" />
                        ) : value ? (
                          <Check className="w-4 h-4 mx-auto text-green-600" />
                        ) : (
                          <X className="w-4 h-4 mx-auto text-red-400" />
                        )}
                      </td>
                    );
                  })}
                  
                  {/* Max Paket */}
                  <td className="p-1 text-center border-r-2 border-slate-300">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={courier.max_packages || 5}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value) || 5;
                        if (newVal >= 1 && newVal <= 20) {
                          handleNumericUpdate(courier.id, "max_packages", courier.max_packages || 5, newVal);
                        }
                      }}
                      className="w-10 h-6 text-center text-[11px] border rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                  
                  {/* Mola Limiti */}
                  <td className="p-1 text-center">
                    <input
                      type="number"
                      min="0"
                      max="480"
                      step="5"
                      value={courier.daily_break_limit || 30}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value) || 30;
                        if (newVal >= 0 && newVal <= 480) {
                          handleNumericUpdate(courier.id, "break_limit", courier.daily_break_limit || 30, newVal);
                        }
                      }}
                      className="w-12 h-6 text-center text-[11px] border rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
