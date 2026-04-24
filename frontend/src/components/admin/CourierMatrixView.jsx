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
  User,
  Save,
  Plus,
  Minus,
  Shield
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CourierMatrixView({ companyId, onCourierClick, refreshTrigger }) {
  const [data, setData] = useState({ couriers: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState({});
  const [editedValues, setEditedValues] = useState({}); // { "courierId-field": value }

  useEffect(() => {
    if (companyId) {
      fetchMatrix();
    }
  }, [companyId, refreshTrigger]);

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

  // Yetki toggle
  const handlePermissionToggle = async (courierId, permKey, currentValue) => {
    const cellKey = `${courierId}-perm-${permKey}`;
    setUpdating(prev => ({ ...prev, [cellKey]: true }));
    
    const newValue = !currentValue;
    
    // Optimistic update
    setData(prev => ({
      ...prev,
      couriers: prev.couriers.map(c => {
        if (c.id !== courierId) return c;
        return { ...c, permissions: { ...c.permissions, [permKey]: newValue } };
      })
    }));
    
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/matrix/bulk-update`, [{
        courier_id: courierId,
        setting_type: "permission",
        setting_key: permKey,
        value: newValue
      }]);
    } catch (err) {
      // Revert
      setData(prev => ({
        ...prev,
        couriers: prev.couriers.map(c => {
          if (c.id !== courierId) return c;
          return { ...c, permissions: { ...c.permissions, [permKey]: currentValue } };
        })
      }));
      toast.error("Güncelleme başarısız");
    } finally {
      setUpdating(prev => ({ ...prev, [cellKey]: false }));
    }
  };


  // Sayısal değer değişikliğini local state'e kaydet
  const handleNumericChange = (courierId, field, value) => {
    const key = `${courierId}-${field}`;
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  // Sayısal değer kaydetme (max paket, mola limiti)
  const handleNumericSave = async (courierId, settingType, originalValue) => {
    const key = `${courierId}-${settingType === "max_packages" ? "max_packages" : "daily_break_limit"}`;
    const newValue = editedValues[key];
    
    if (newValue === undefined || parseInt(newValue) === originalValue) {
      // Değişiklik yok, edited state'i temizle
      setEditedValues(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      return;
    }
    
    const cellKey = `${courierId}-${settingType}`;
    setUpdating(prev => ({ ...prev, [cellKey]: true }));
    
    const fieldName = settingType === "max_packages" ? "max_packages" : "daily_break_limit";
    const numValue = parseInt(newValue);
    
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/matrix/bulk-update`, [{
        courier_id: courierId,
        setting_type: settingType,
        setting_key: fieldName,
        value: numValue
      }]);
      
      // Başarılı - data'yı güncelle ve edited state'i temizle
      setData(prev => ({
        ...prev,
        couriers: prev.couriers.map(c => {
          if (c.id !== courierId) return c;
          return { ...c, [fieldName]: numValue };
        })
      }));
      setEditedValues(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      toast.success("Kaydedildi");
    } catch (err) {
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
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Kurye ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{filteredCouriers.length} kurye</span>
          <Button variant="outline" size="sm" onClick={fetchMatrix} className="h-9 w-9 p-0 sm:h-auto sm:w-auto sm:px-3">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs bg-slate-50 p-2 rounded border">
        <span className="font-medium text-slate-600">Renk:</span>
        <div className="flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-green-600" />
          <span>Aktif</span>
        </div>
        <div className="flex items-center gap-1">
          <X className="w-3.5 h-3.5 text-red-400" />
          <span>Pasif</span>
        </div>
      </div>

      {/* Mobil: Kart görünümü */}
      <div className="sm:hidden space-y-2">
        {filteredCouriers.map((courier) => (
          <CourierMatrixCard 
            key={courier.id} 
            courier={courier}
            paymentCols={paymentCols}
            updating={updating}
            editedValues={editedValues}
            onPaymentMethodToggle={handlePaymentMethodToggle}
            onPermissionToggle={handlePermissionToggle}
            onNumericChange={handleNumericChange}
            onNumericSave={handleNumericSave}
            onCourierClick={onCourierClick}
            getPricingLabel={getPricingLabel}
          />
        ))}
      </div>

      {/* Masaüstü: Tablo */}
      <div className="hidden sm:block border rounded-lg overflow-auto max-h-[600px]">
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
              <th className="p-2 text-center font-semibold bg-purple-100 border-r-2 border-slate-300">
                <div className="flex items-center justify-center gap-1">
                  <Coffee className="w-3 h-3" />
                  Mola
                </div>
              </th>
              <th colSpan={3} className="p-2 text-center font-semibold bg-indigo-100">
                <div className="flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" />
                  Yetkiler
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
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-purple-50 border-r-2 border-slate-300">
                Dk
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-indigo-50 border-r border-slate-300">
                H.Değil
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-indigo-50 border-r border-slate-300">
                Havuz
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-indigo-50">
                Konum
              </th>
            </tr>
          </thead>
          
          <tbody>
            {filteredCouriers.map((courier, rowIndex) => {
              const isEvenRow = rowIndex % 2 === 0;
              const rowBgClass = isEvenRow ? "bg-white" : "bg-slate-50";
              
              return (
                <tr key={courier.id} className={`border-b border-slate-300 hover:bg-blue-50/50 ${rowBgClass}`}>
                  {/* Kurye İsmi */}
                  <td 
                    className={`sticky left-0 z-10 ${rowBgClass} p-2 font-medium border-r-2 border-slate-300 cursor-pointer hover:text-primary`}
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
                    {(() => {
                      const editKey = `${courier.id}-max_packages`;
                      const originalValue = courier.max_packages || 5;
                      const currentValue = editedValues[editKey] !== undefined ? parseInt(editedValues[editKey]) : originalValue;
                      const hasChanged = editedValues[editKey] !== undefined && parseInt(editedValues[editKey]) !== originalValue;
                      const isUpdatingCell = updating[`${courier.id}-max_packages`];
                      
                      return (
                        <div className="relative flex items-center justify-center">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                const newVal = Math.max(1, currentValue - 1);
                                handleNumericChange(courier.id, "max_packages", newVal);
                              }}
                              className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded text-slate-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={currentValue}
                              onChange={(e) => handleNumericChange(courier.id, "max_packages", e.target.value)}
                              className="matrix-input w-8 h-5 border rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"
                            />
                            <button
                              onClick={() => {
                                const newVal = Math.min(20, currentValue + 1);
                                handleNumericChange(courier.id, "max_packages", newVal);
                              }}
                              className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded text-slate-600"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {hasChanged && (
                            <div className="absolute right-1">
                              {isUpdatingCell ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                              ) : (
                                <button
                                  onClick={() => handleNumericSave(courier.id, "max_packages", originalValue)}
                                  className="w-5 h-5 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded"
                                  title="Kaydet"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  
                  {/* Mola Limiti */}
                  <td className="p-1 text-center border-r-2 border-slate-300">
                    {(() => {
                      const editKey = `${courier.id}-daily_break_limit`;
                      const originalValue = courier.daily_break_limit || 30;
                      const currentValue = editedValues[editKey] !== undefined ? parseInt(editedValues[editKey]) : originalValue;
                      const hasChanged = editedValues[editKey] !== undefined && parseInt(editedValues[editKey]) !== originalValue;
                      const isUpdatingCell = updating[`${courier.id}-break_limit`];
                      
                      return (
                        <div className="relative flex items-center justify-center">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => {
                                const newVal = Math.max(0, currentValue - 5);
                                handleNumericChange(courier.id, "daily_break_limit", newVal);
                              }}
                              className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded text-slate-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="480"
                              step="5"
                              value={currentValue}
                              onChange={(e) => handleNumericChange(courier.id, "daily_break_limit", e.target.value)}
                              className="matrix-input w-10 h-5 border rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"
                            />
                            <button
                              onClick={() => {
                                const newVal = Math.min(480, currentValue + 5);
                                handleNumericChange(courier.id, "daily_break_limit", newVal);
                              }}
                              className="w-5 h-5 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded text-slate-600"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {hasChanged && (
                            <div className="absolute right-1">
                              {isUpdatingCell ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                              ) : (
                                <button
                                  onClick={() => handleNumericSave(courier.id, "break_limit", originalValue)}
                                  className="w-5 h-5 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded"
                                  title="Kaydet"
                                >
                                  <Save className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  
                  {/* Yetkiler - Hazır Değil */}
                  <td className="p-1 text-center">
                    {(() => {
                      const value = courier.permissions?.can_mark_not_ready ?? true;
                      const cellKey = `${courier.id}-perm-can_mark_not_ready`;
                      const isUpdatingCell = updating[cellKey];
                      
                      return (
                        <div
                          className="cursor-pointer"
                          onClick={() => !isUpdatingCell && handlePermissionToggle(courier.id, "can_mark_not_ready", value)}
                        >
                          {isUpdatingCell ? (
                            <RefreshCw className="w-3 h-3 animate-spin mx-auto text-slate-400" />
                          ) : value ? (
                            <Check className="w-4 h-4 mx-auto text-green-600" />
                          ) : (
                            <X className="w-4 h-4 mx-auto text-red-400" />
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Yetkiler - Havuz */}
                  <td className="p-1 text-center">
                    {(() => {
                      const value = courier.permissions?.pool_access ?? true;
                      const cellKey = `${courier.id}-perm-pool_access`;
                      const isUpdatingCell = updating[cellKey];
                      
                      return (
                        <div
                          className="cursor-pointer"
                          onClick={() => !isUpdatingCell && handlePermissionToggle(courier.id, "pool_access", value)}
                        >
                          {isUpdatingCell ? (
                            <RefreshCw className="w-3 h-3 animate-spin mx-auto text-slate-400" />
                          ) : value ? (
                            <Check className="w-4 h-4 mx-auto text-green-600" />
                          ) : (
                            <X className="w-4 h-4 mx-auto text-red-400" />
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Yetkiler - Konum Bildirimi */}
                  <td className="p-1 text-center">
                    {(() => {
                      const value = courier.permissions?.location_alert_enabled ?? true;
                      const cellKey = `${courier.id}-perm-location_alert_enabled`;
                      const isUpdatingCell = updating[cellKey];
                      
                      return (
                        <div
                          className="cursor-pointer"
                          onClick={() => !isUpdatingCell && handlePermissionToggle(courier.id, "location_alert_enabled", value)}
                        >
                          {isUpdatingCell ? (
                            <RefreshCw className="w-3 h-3 animate-spin mx-auto text-slate-400" />
                          ) : value ? (
                            <Check className="w-4 h-4 mx-auto text-green-600" />
                          ) : (
                            <X className="w-4 h-4 mx-auto text-red-400" />
                          )}
                        </div>
                      );
                    })()}
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

/* Mobil Kurye Matris Kartı */
function CourierMatrixCard({ 
  courier, paymentCols, updating, editedValues,
  onPaymentMethodToggle, onPermissionToggle, onNumericChange, onNumericSave,
  onCourierClick, getPricingLabel 
}) {
  const maxPkgKey = `${courier.id}-max_packages`;
  const breakKey = `${courier.id}-daily_break_limit`;
  const maxVal = editedValues[maxPkgKey] !== undefined ? parseInt(editedValues[maxPkgKey]) : (courier.max_packages || 5);
  const breakVal = editedValues[breakKey] !== undefined ? parseInt(editedValues[breakKey]) : (courier.daily_break_limit || 30);
  const maxChanged = editedValues[maxPkgKey] !== undefined && parseInt(editedValues[maxPkgKey]) !== (courier.max_packages || 5);
  const breakChanged = editedValues[breakKey] !== undefined && parseInt(editedValues[breakKey]) !== (courier.daily_break_limit || 30);

  return (
    <div className="border rounded-lg p-2.5 bg-white" data-testid={`courier-matrix-card-${courier.id}`}>
      {/* Başlık */}
      <div className="flex items-center justify-between mb-2">
        <button className="font-medium text-sm text-primary truncate mr-2" onClick={() => onCourierClick?.(courier)}>
          {courier.name}
          {courier.plate && <span className="text-[9px] px-1 bg-slate-200 text-slate-500 rounded ml-1">{courier.plate}</span>}
        </button>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          courier.pricing_type === "per_km" ? "bg-purple-100 text-purple-700" :
          courier.pricing_type === "hourly" ? "bg-blue-100 text-blue-700" :
          courier.pricing_type === "tiered" ? "bg-orange-100 text-orange-700" :
          "bg-amber-100 text-amber-700"
        }`}>
          {getPricingLabel(courier.pricing_type)}
          {courier.hourly_rate ? ` ${courier.hourly_rate}₺/s` : ''}
        </span>
      </div>

      {/* Ödeme Yöntemleri */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-muted-foreground w-10 flex-shrink-0">Ödeme</span>
        <div className="flex gap-1 flex-1">
          {paymentCols.map(col => {
            const value = courier.payment_methods?.[col.key] ?? true;
            const cellKey = `${courier.id}-payment-${col.key}`;
            const isUp = updating[cellKey];
            return (
              <button
                key={col.key}
                className={`flex-1 py-1 rounded text-[10px] font-medium text-center ${
                  value ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400"
                }`}
                onClick={() => !isUp && onPaymentMethodToggle(courier.id, col.key, value)}
                disabled={isUp}
              >
                {isUp ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : col.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Max Paket + Mola + Yetki */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-[10px]">
          <Package className="w-3 h-3 text-slate-400" />
          <div className="flex items-center gap-0.5">
            <button onClick={() => onNumericChange(courier.id, "max_packages", Math.max(1, maxVal - 1))} className="w-5 h-5 flex items-center justify-center bg-slate-200 rounded text-slate-600">
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="w-5 text-center font-medium">{maxVal}</span>
            <button onClick={() => onNumericChange(courier.id, "max_packages", Math.min(20, maxVal + 1))} className="w-5 h-5 flex items-center justify-center bg-slate-200 rounded text-slate-600">
              <Plus className="w-2.5 h-2.5" />
            </button>
            {maxChanged && (
              <button onClick={() => onNumericSave(courier.id, "max_packages", courier.max_packages || 5)} className="w-5 h-5 flex items-center justify-center bg-green-500 text-white rounded ml-0.5">
                <Save className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          <Coffee className="w-3 h-3 text-slate-400" />
          <div className="flex items-center gap-0.5">
            <button onClick={() => onNumericChange(courier.id, "daily_break_limit", Math.max(0, breakVal - 5))} className="w-5 h-5 flex items-center justify-center bg-slate-200 rounded text-slate-600">
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="w-6 text-center font-medium">{breakVal}</span>
            <button onClick={() => onNumericChange(courier.id, "daily_break_limit", Math.min(480, breakVal + 5))} className="w-5 h-5 flex items-center justify-center bg-slate-200 rounded text-slate-600">
              <Plus className="w-2.5 h-2.5" />
            </button>
            {breakChanged && (
              <button onClick={() => onNumericSave(courier.id, "break_limit", courier.daily_break_limit || 30)} className="w-5 h-5 flex items-center justify-center bg-green-500 text-white rounded ml-0.5">
                <Save className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          <Shield className="w-3 h-3 text-slate-400" />
          {[
            { key: "can_mark_not_ready", label: "H.D" },
            { key: "pool_access", label: "Havuz" },
            { key: "location_alert_enabled", label: "Konum" },
          ].map(perm => {
            const val = courier.permissions?.[perm.key] ?? true;
            const cellKey = `${courier.id}-perm-${perm.key}`;
            const isUp = updating[cellKey];
            return (
              <button
                key={perm.key}
                className={`px-1.5 py-0.5 rounded font-medium ${val ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400"}`}
                onClick={() => !isUp && onPermissionToggle(courier.id, perm.key, val)}
              >
                {isUp ? <RefreshCw className="w-3 h-3 animate-spin" /> : perm.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
