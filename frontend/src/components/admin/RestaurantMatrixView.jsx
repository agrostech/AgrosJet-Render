import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Package,
  MapPin
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sütun grupları
const COLUMN_GROUPS = [
  {
    id: "pricing",
    label: "Ücret",
    icon: Banknote,
    color: "bg-amber-50",
    headerColor: "bg-amber-100",
    columns: [
      { key: "type", label: "Tür", icon: Package }
    ]
  },
  {
    id: "collection",
    label: "Tahsilat",
    icon: Banknote,
    color: "bg-green-50",
    headerColor: "bg-green-100",
    columns: [
      { key: "cash", label: "Nakit", icon: Banknote },
      { key: "card", label: "Kart", icon: CreditCard },
      { key: "meal_card", label: "Yemek K.", icon: Utensils }
    ]
  },
  {
    id: "invoice",
    label: "Fatura",
    icon: FileText,
    color: "bg-blue-50",
    headerColor: "bg-blue-100",
    columns: [
      { key: "cash", label: "Nakit", icon: Banknote },
      { key: "credit_card", label: "Kart", icon: CreditCard },
      { key: "online", label: "Online", icon: Globe },
      { key: "meal_card", label: "Yemek K.", icon: Utensils },
      { key: "online_meal_card", label: "Online Y.K.", icon: Globe }
    ]
  }
];

export default function RestaurantMatrixView({ companyId, onRestaurantClick }) {
  const [data, setData] = useState({ restaurants: [], permission_definitions: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({
    pricing: true,
    collection: true,
    invoice: true,
    permissions: true
  });

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
      // Tahsilat: courier <-> restaurant toggle
      newValue = currentValue === "courier" ? "restaurant" : "courier";
    } else {
      // Fatura ve İzinler: boolean toggle
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

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Değer hücresi render
  const renderCell = (restaurant, groupId, column) => {
    const cellKey = `${restaurant.id}-${groupId}-${column.key}`;
    const isUpdating = updating[cellKey];
    
    let value, displayValue, cellClass, isClickable = true;
    
    if (groupId === "pricing") {
      // Ücretlendirme türü - sadece gösterim, tıklanamaz
      value = restaurant.pricing_type || "per_package";
      displayValue = value === "per_km" ? "KM" : "Paket";
      cellClass = value === "per_km" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800";
      isClickable = false; // Ücretlendirme modaldan değiştirilmeli
    } else if (groupId === "collection") {
      value = restaurant.collection?.[column.key] || "courier";
      const isCourier = value === "courier";
      displayValue = isCourier ? "Kurye" : "Rest.";
      cellClass = isCourier ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800";
    } else if (groupId === "invoice") {
      value = restaurant.invoice?.[column.key] || false;
      displayValue = value ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />;
      cellClass = value ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400";
    } else if (groupId === "permissions") {
      value = restaurant.permissions?.[column.key] || false;
      displayValue = value ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />;
      cellClass = value ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400";
    }
    
    return (
      <TableCell 
        key={column.key} 
        className={`text-center p-1 transition-opacity ${cellClass} ${isClickable ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={() => isClickable && !isUpdating && handleCellUpdate(restaurant.id, groupId, column.key, value)}
      >
        {isUpdating ? (
          <RefreshCw className="w-3 h-3 animate-spin mx-auto" />
        ) : (
          <span className="text-xs font-medium">{displayValue}</span>
        )}
      </TableCell>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="default" />
      </div>
    );
  }

  // Permission columns
  const permissionColumns = data.permission_definitions.map(p => ({
    key: p.key,
    label: p.label,
    category: p.category
  }));

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
        <Button variant="outline" size="sm" onClick={fetchMatrix}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Yenile
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-300"></span>
          <span>Aktif / Kurye Tahsil</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span>
          <span>Restoran Tahsil</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span>
          <span>Pasif</span>
        </div>
        <div className="ml-auto text-muted-foreground">
          Hücreye tıklayarak değeri değiştirebilirsiniz
        </div>
      </div>

      {/* Matrix Table */}
      <div className="border rounded-lg overflow-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-white">
            <TableRow>
              <TableHead className="sticky left-0 z-20 bg-white min-w-[200px] border-r">
                Restoran
              </TableHead>
              
              {/* Ücretlendirme Grubu */}
              {expandedGroups.pricing && COLUMN_GROUPS[0].columns.map(col => (
                <TableHead 
                  key={`pricing-${col.key}`} 
                  className={`text-center text-xs p-2 ${COLUMN_GROUPS[0].headerColor}`}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex flex-col items-center gap-1">
                        <col.icon className="w-3 h-3" />
                        <span>{col.label}</span>
                      </TooltipTrigger>
                      <TooltipContent>Ücretlendirme Türü</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
              
              {/* Tahsilat Grubu */}
              {expandedGroups.collection && COLUMN_GROUPS[1].columns.map(col => (
                <TableHead 
                  key={`collection-${col.key}`} 
                  className={`text-center text-xs p-2 ${COLUMN_GROUPS[1].headerColor}`}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex flex-col items-center gap-1">
                        <col.icon className="w-3 h-3" />
                        <span>{col.label}</span>
                      </TooltipTrigger>
                      <TooltipContent>Tahsilat: {col.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
              
              {/* Fatura Grubu */}
              {expandedGroups.invoice && COLUMN_GROUPS[2].columns.map(col => (
                <TableHead 
                  key={`invoice-${col.key}`} 
                  className={`text-center text-xs p-2 ${COLUMN_GROUPS[2].headerColor}`}
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex flex-col items-center gap-1">
                        <col.icon className="w-3 h-3" />
                        <span>{col.label}</span>
                      </TooltipTrigger>
                      <TooltipContent>Fatura: {col.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
              
              {/* İzinler Grubu */}
              {expandedGroups.permissions && permissionColumns.map(col => (
                <TableHead 
                  key={`perm-${col.key}`} 
                  className="text-center text-xs p-2 bg-purple-100"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="truncate max-w-[60px] block">{col.label}</span>
                      </TooltipTrigger>
                      <TooltipContent>İzin: {col.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
              ))}
            </TableRow>
            
            {/* Grup başlıkları */}
            <TableRow className="bg-slate-100">
              <TableHead className="sticky left-0 z-20 bg-slate-100 border-r">
                <span className="text-xs text-muted-foreground">
                  {filteredRestaurants.length} restoran
                </span>
              </TableHead>
              
              {expandedGroups.pricing && (
                <TableHead 
                  colSpan={COLUMN_GROUPS[0].columns.length}
                  className="text-center cursor-pointer hover:bg-amber-200 bg-amber-100"
                  onClick={() => toggleGroup("pricing")}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-semibold text-amber-800">
                    <Package className="w-3 h-3" />
                    Ücret
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </TableHead>
              )}
              
              {expandedGroups.collection && (
                <TableHead 
                  colSpan={COLUMN_GROUPS[1].columns.length}
                  className="text-center cursor-pointer hover:bg-green-200 bg-green-100"
                  onClick={() => toggleGroup("collection")}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-semibold text-green-800">
                    <Banknote className="w-3 h-3" />
                    Tahsilat
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </TableHead>
              )}
              
              {expandedGroups.invoice && (
                <TableHead 
                  colSpan={COLUMN_GROUPS[2].columns.length}
                  className="text-center cursor-pointer hover:bg-blue-200 bg-blue-100"
                  onClick={() => toggleGroup("invoice")}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-semibold text-blue-800">
                    <FileText className="w-3 h-3" />
                    Fatura
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </TableHead>
              )}
              
              {expandedGroups.permissions && permissionColumns.length > 0 && (
                <TableHead 
                  colSpan={permissionColumns.length}
                  className="text-center cursor-pointer hover:bg-purple-200 bg-purple-100"
                  onClick={() => toggleGroup("permissions")}
                >
                  <div className="flex items-center justify-center gap-1 text-xs font-semibold text-purple-800">
                    <Shield className="w-3 h-3" />
                    İzinler
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          
          <TableBody>
            {filteredRestaurants.map(restaurant => (
              <TableRow key={restaurant.id} className="hover:bg-slate-50">
                <TableCell 
                  className="sticky left-0 z-10 bg-white border-r font-medium cursor-pointer hover:text-primary"
                  onClick={() => onRestaurantClick?.(restaurant)}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[180px]">{restaurant.name}</span>
                    {restaurant.is_archived && (
                      <span className="text-[10px] px-1 py-0.5 bg-slate-200 text-slate-600 rounded">Arşiv</span>
                    )}
                  </div>
                </TableCell>
                
                {/* Ücretlendirme hücreleri */}
                {expandedGroups.pricing && COLUMN_GROUPS[0].columns.map(col => 
                  renderCell(restaurant, "pricing", col)
                )}
                
                {/* Tahsilat hücreleri */}
                {expandedGroups.collection && COLUMN_GROUPS[1].columns.map(col => 
                  renderCell(restaurant, "collection", col)
                )}
                
                {/* Fatura hücreleri */}
                {expandedGroups.invoice && COLUMN_GROUPS[2].columns.map(col => 
                  renderCell(restaurant, "invoice", col)
                )}
                
                {/* İzin hücreleri */}
                {expandedGroups.permissions && permissionColumns.map(col => 
                  renderCell(restaurant, "permissions", col)
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Collapsed Groups - Mini buttons to expand */}
      <div className="flex gap-2 flex-wrap">
        {!expandedGroups.pricing && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => toggleGroup("pricing")}
            className="text-amber-700 border-amber-300 hover:bg-amber-50"
          >
            <ChevronRight className="w-3 h-3 mr-1" />
            <Package className="w-3 h-3 mr-1" />
            Ücret
          </Button>
        )}
        {!expandedGroups.collection && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => toggleGroup("collection")}
            className="text-green-700 border-green-300 hover:bg-green-50"
          >
            <ChevronRight className="w-3 h-3 mr-1" />
            <Banknote className="w-3 h-3 mr-1" />
            Tahsilat
          </Button>
        )}
        {!expandedGroups.invoice && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => toggleGroup("invoice")}
            className="text-blue-700 border-blue-300 hover:bg-blue-50"
          >
            <ChevronRight className="w-3 h-3 mr-1" />
            <FileText className="w-3 h-3 mr-1" />
            Fatura
          </Button>
        )}
        {!expandedGroups.permissions && permissionColumns.length > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => toggleGroup("permissions")}
            className="text-purple-700 border-purple-300 hover:bg-purple-50"
          >
            <ChevronRight className="w-3 h-3 mr-1" />
            <Shield className="w-3 h-3 mr-1" />
            İzinler
          </Button>
        )}
      </div>
    </div>
  );
}
