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
  Utensils,
  Globe,
  FileText,
  Shield,
  RefreshCw,
  Package
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantMatrixView({ companyId, onRestaurantClick }) {
  const [data, setData] = useState({ restaurants: [], permission_definitions: [] });
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
      const res = await axios.get(`${API}/restaurants/${companyId}/matrix`);
      setData(res.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filtrelenmiş restoranlar
  const filteredRestaurants = useMemo(() => {
    if (!search.trim()) return data.restaurants;
    const term = search.toLowerCase();
    return data.restaurants.filter(r => 
      r.name.toLowerCase().includes(term)
    );
  }, [data.restaurants, search]);

  // Hücre değerini güncelle
  const handleCellUpdate = async (restaurantId, settingType, settingKey, currentValue) => {
    const cellKey = `${restaurantId}-${settingType}-${settingKey}`;
    setUpdating(prev => ({ ...prev, [cellKey]: true }));
    
    let newValue;
    if (settingType === "collection") {
      newValue = currentValue === "courier" ? "restaurant" : "courier";
    } else {
      newValue = !currentValue;
    }
    
    // Optimistic update
    setData(prev => ({
      ...prev,
      restaurants: prev.restaurants.map(r => {
        if (r.id !== restaurantId) return r;
        
        if (settingType === "collection") {
          return { ...r, collection: { ...r.collection, [settingKey]: newValue } };
        } else if (settingType === "invoice") {
          return { ...r, invoice: { ...r.invoice, [settingKey]: newValue } };
        } else if (settingType === "permission") {
          return { ...r, permissions: { ...r.permissions, [settingKey]: newValue } };
        }
        return r;
      })
    }));
    
    try {
      await axios.put(`${API}/restaurants/${companyId}/matrix/bulk-update`, [{
        restaurant_id: restaurantId,
        setting_type: settingType,
        setting_key: settingKey,
        value: newValue
      }]);
    } catch (err) {
      // Revert on error
      setData(prev => ({
        ...prev,
        restaurants: prev.restaurants.map(r => {
          if (r.id !== restaurantId) return r;
          
          if (settingType === "collection") {
            return { ...r, collection: { ...r.collection, [settingKey]: currentValue } };
          } else if (settingType === "invoice") {
            return { ...r, invoice: { ...r.invoice, [settingKey]: currentValue } };
          } else if (settingType === "permission") {
            return { ...r, permissions: { ...r.permissions, [settingKey]: currentValue } };
          }
          return r;
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

  const permissionColumns = data.permission_definitions || [];

  // Tahsilat sütunları
  const collectionCols = [
    { key: "cash", label: "Nakit" },
    { key: "card", label: "Kart" },
    { key: "meal_card", label: "Y.Kartı" }
  ];

  // Fatura sütunları
  const invoiceCols = [
    { key: "cash", label: "Nakit" },
    { key: "credit_card", label: "Kart" },
    { key: "online", label: "Online" },
    { key: "meal_card", label: "Y.Kartı" },
    { key: "online_meal_card", label: "Onl.Y.K." }
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Restoran ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filteredRestaurants.length} restoran</span>
          <Button variant="outline" size="sm" onClick={fetchMatrix}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs bg-slate-50 p-2 rounded border">
        <span className="font-medium text-slate-600">Renk Kodları:</span>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-green-500"></span>
          <span>Aktif / Kurye</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-amber-500"></span>
          <span>Restoran</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 rounded bg-red-400"></span>
          <span>Pasif</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="border rounded-lg overflow-auto max-h-[600px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            {/* Grup Başlıkları */}
            <tr className="bg-slate-100">
              <th className="sticky left-0 z-20 bg-slate-100 p-2 text-left font-semibold border-r-2 border-slate-400 min-w-[160px]">
                Restoran
              </th>
              <th className="p-2 text-center font-semibold bg-amber-100 border-r-2 border-slate-400">
                <div className="flex items-center justify-center gap-1">
                  <Package className="w-3 h-3" />
                  Ücret
                </div>
              </th>
              <th colSpan={3} className="p-2 text-center font-semibold bg-green-100 border-r-2 border-slate-400">
                <div className="flex items-center justify-center gap-1">
                  <Banknote className="w-3 h-3" />
                  Tahsilat
                </div>
              </th>
              <th colSpan={5} className="p-2 text-center font-semibold bg-blue-100 border-r-2 border-slate-400">
                <div className="flex items-center justify-center gap-1">
                  <FileText className="w-3 h-3" />
                  Fatura
                </div>
              </th>
              {permissionColumns.length > 0 && (
                <th colSpan={permissionColumns.length} className="p-2 text-center font-semibold bg-purple-100">
                  <div className="flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3" />
                    İzinler
                  </div>
                </th>
              )}
            </tr>
            
            {/* Alt Başlıklar */}
            <tr className="bg-white border-b-2 border-slate-400">
              <th className="sticky left-0 z-20 bg-white p-2 text-left text-[10px] text-muted-foreground border-r-2 border-slate-400">
                İsim
              </th>
              <th className="p-1.5 text-center text-[10px] text-muted-foreground bg-amber-50 border-r-2 border-slate-400">
                Tür
              </th>
              {collectionCols.map((col, i) => (
                <th 
                  key={`col-${col.key}`} 
                  className={`p-1.5 text-center text-[10px] text-muted-foreground bg-green-50 ${i === collectionCols.length - 1 ? 'border-r-2 border-slate-400' : 'border-r border-slate-400'}`}
                >
                  {col.label}
                </th>
              ))}
              {invoiceCols.map((col, i) => (
                <th 
                  key={`inv-${col.key}`} 
                  className={`p-1.5 text-center text-[10px] text-muted-foreground bg-blue-50 ${i === invoiceCols.length - 1 ? 'border-r-2 border-slate-400' : 'border-r border-slate-400'}`}
                >
                  {col.label}
                </th>
              ))}
              {permissionColumns.map((col, i) => (
                <th 
                  key={`perm-${col.key}`} 
                  className={`p-1.5 text-center text-[10px] text-muted-foreground bg-purple-50 ${i < permissionColumns.length - 1 ? 'border-r border-slate-400' : ''}`}
                  title={col.label}
                >
                  {col.short_label || col.label}
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {filteredRestaurants.map(restaurant => {
              const isUpdatingAny = Object.keys(updating).some(k => k.startsWith(restaurant.id) && updating[k]);
              
              return (
                <tr key={restaurant.id} className="border-b border-slate-400 hover:bg-slate-50/50">
                  {/* Restoran İsmi */}
                  <td 
                    className="sticky left-0 z-10 bg-white p-2 font-medium border-r-2 border-slate-400 cursor-pointer hover:text-primary"
                    onClick={() => onRestaurantClick?.(restaurant)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[140px]">{restaurant.name}</span>
                      {restaurant.is_archived && (
                        <span className="text-[9px] px-1 bg-slate-200 text-slate-500 rounded">Arşiv</span>
                      )}
                    </div>
                  </td>
                  
                  {/* Ücretlendirme */}
                  <td className="p-1 text-center border-r-2 border-slate-400">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                      restaurant.pricing_type === "per_km" 
                        ? "bg-purple-100 text-purple-700" 
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {restaurant.pricing_type === "per_km" ? "KM" : "Pkt Başı"}
                    </span>
                  </td>
                  
                  {/* Tahsilat */}
                  {collectionCols.map((col, i) => {
                    const value = restaurant.collection?.[col.key] || "courier";
                    const isCourier = value === "courier";
                    const cellKey = `${restaurant.id}-collection-${col.key}`;
                    const isUpdatingCell = updating[cellKey];
                    
                    return (
                      <td 
                        key={`col-${col.key}`}
                        className={`p-1 text-center cursor-pointer transition-colors ${i === collectionCols.length - 1 ? 'border-r-2 border-slate-400' : 'border-r border-slate-400'}`}
                        onClick={() => !isUpdatingCell && handleCellUpdate(restaurant.id, "collection", col.key, value)}
                      >
                        {isUpdatingCell ? (
                          <RefreshCw className="w-3 h-3 animate-spin mx-auto text-slate-400" />
                        ) : (
                          <span className={`inline-block w-5 h-5 rounded-sm text-[10px] font-bold leading-5 ${
                            isCourier ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                          }`}>
                            {isCourier ? "K" : "R"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  
                  {/* Fatura */}
                  {invoiceCols.map((col, i) => {
                    const value = restaurant.invoice?.[col.key] || false;
                    const cellKey = `${restaurant.id}-invoice-${col.key}`;
                    const isUpdatingCell = updating[cellKey];
                    
                    return (
                      <td 
                        key={`inv-${col.key}`}
                        className={`p-1 text-center cursor-pointer transition-colors ${i === invoiceCols.length - 1 ? 'border-r-2 border-slate-400' : 'border-r border-slate-400'}`}
                        onClick={() => !isUpdatingCell && handleCellUpdate(restaurant.id, "invoice", col.key, value)}
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
                  
                  {/* İzinler */}
                  {permissionColumns.map((col, i) => {
                    const value = restaurant.permissions?.[col.key] || false;
                    const cellKey = `${restaurant.id}-permission-${col.key}`;
                    const isUpdatingCell = updating[cellKey];
                    
                    return (
                      <td 
                        key={`perm-${col.key}`}
                        className={`p-1 text-center cursor-pointer transition-colors ${i < permissionColumns.length - 1 ? 'border-r border-slate-400' : ''}`}
                        onClick={() => !isUpdatingCell && handleCellUpdate(restaurant.id, "permission", col.key, value)}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
