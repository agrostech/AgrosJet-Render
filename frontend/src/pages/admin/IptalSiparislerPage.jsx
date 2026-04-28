import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Package, XCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IptalSiparislerPage({ companyId, onOrderSelect, isSuperAdmin = false }) {
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter states
  const [restaurants, setRestaurants] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [company, setCompany] = useState(null);
  
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  
  // Date filters with defaults
  const getDefaultDates = useCallback((companyData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = companyData?.opening_time || "06:00";
    const closingTime = companyData?.closing_time || "06:00";
    
    // Format: YYYY-MM-DDTHH:MM
    const startDateTime = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}T${openingTime}`;
    const endDateTime = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}T${closingTime}`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Fetch and filter orders - called on button click or initial load
  const fetchAndFilterOrders = useCallback(async (filters) => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Yeni merkezi endpoint kullan
      const res = await axios.get(`${API}/orders/v2/list`, {
        params: {
          panel: 'admin',
          company_id: companyId,
          status: 'cancelled',
          limit: 500
        }
      });
      let result = res.data.orders || [];
      
      // Restaurant filter
      if (filters.restaurant !== "all") {
        result = result.filter(o => o.restaurant_id === filters.restaurant);
      }
      
      // Courier filter
      if (filters.courier !== "all") {
        result = result.filter(o => o.courier_id === filters.courier);
      }
      
      // Payment method filter
      if (filters.payment !== "all") {
        result = result.filter(o => o.payment_method === filters.payment);
      }
      
      // Date range filter
      if (filters.startDateTime && filters.endDateTime) {
        const start = new Date(filters.startDateTime);
        const end = new Date(filters.endDateTime);
        
        result = result.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= start && orderDate <= end;
        });
      }
      
      setFilteredOrders(result);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Handle filter button click
  const handleFilter = () => {
    setCurrentPage(1);
    fetchAndFilterOrders({
      restaurant: restaurantFilter,
      courier: courierFilter,
      payment: paymentFilter,
      startDateTime,
      endDateTime
    });
  };

  // Fetch restaurants and couriers separately 
  useEffect(() => {
    const fetchFiltersData = async () => {
      if (!companyId) return;
      try {
        const [restaurantsRes, couriersRes] = await Promise.all([
          axios.get(`${API}/restaurants/${companyId}`),
          axios.get(`${API}/companies/${companyId}/couriers`)
        ]);
        console.log("Restaurants loaded:", restaurantsRes.data);
        console.log("Couriers loaded:", couriersRes.data);
        setRestaurants(restaurantsRes.data || []);
        setCouriers(couriersRes.data || []);
      } catch (err) {
        console.error("Filters data fetch error:", err);
      }
    };
    fetchFiltersData();
  }, [companyId]);

  // Initial load: fetch company and orders
  useEffect(() => {
    const initializeData = async () => {
      if (!companyId || initialized) return;
      
      try {
        // Fetch company first
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        setCompany(companyRes.data);
        
        // Set default dates
        const defaults = getDefaultDates(companyRes.data);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);
        
        // Auto-filter with defaults on first load
        await fetchAndFilterOrders({
          restaurant: "all",
          courier: "all",
          payment: "all",
          startDateTime: defaults.startDateTime,
          endDateTime: defaults.endDateTime
        });
        
        setInitialized(true);
      } catch (err) {
        console.error("Initialization error:", err);
        setLoading(false);
      }
    };
    
    initializeData();
  }, [companyId, initialized, getDefaultDates, fetchAndFilterOrders]);

  // Mesafe hesaplama (Haversine formula)
  const calculateDistance = (order) => {
    if (!order.restaurant_location || !order.delivery_location) return null;
    
    const R = 6371; // Dünya yarıçapı km
    const lat1 = order.restaurant_location.latitude || order.restaurant_location.lat;
    const lon1 = order.restaurant_location.longitude || order.restaurant_location.lng;
    const lat2 = order.delivery_location.latitude || order.delivery_location.lat;
    const lon2 = order.delivery_location.longitude || order.delivery_location.lng;
    
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const clearFilters = () => {
    setRestaurantFilter("all");
    setCourierFilter("all");
    setPaymentFilter("all");
    const defaults = getDefaultDates(company);
    setStartDateTime(defaults.startDateTime);
    setEndDateTime(defaults.endDateTime);
    setCurrentPage(1);
    // Auto-filter with cleared defaults
    fetchAndFilterOrders({
      restaurant: "all",
      courier: "all",
      payment: "all",
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
  };

  // Pagination logic with search
  const searchedOrders = useMemo(() => {
    if (!searchQuery.trim()) return filteredOrders;
    
    const query = searchQuery.toLowerCase().trim();
    return filteredOrders.filter(order => {
      const searchableFields = [
        order.restaurant_name,
        order.customer_name,
        order.customer_phone,
        order.courier_name,
        order.delivery_address,
        order.payment_method === 'cash' ? 'nakit' : order.payment_method === 'card' ? 'kart' : order.payment_method === 'meal_card' ? 'yemek kartı' : 'online',
        order.total_amount?.toString(),
        order.order_number,
        order.cancellation_reason
      ].filter(Boolean);
      
      return searchableFields.some(field => 
        field.toLowerCase().includes(query)
      );
    });
  }, [filteredOrders, searchQuery]);

  const totalItems = searchedOrders.length;
  const totalPages = itemsPerPage === "all" ? 1 : Math.ceil(totalItems / itemsPerPage);
  
  const paginatedOrders = useMemo(() => {
    if (itemsPerPage === "all") return searchedOrders;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return searchedOrders.slice(start, end);
  }, [searchedOrders, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value === "all" ? "all" : parseInt(value));
    setCurrentPage(1);
  };
  
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Restoran</Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Kurye</Label>
              <Select value={courierFilter} onValueChange={setCourierFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {couriers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Ödeme</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tümü" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="cash">Nakit</SelectItem>
                  <SelectItem value="card">Kart</SelectItem>
                  <SelectItem value="meal_card">Yemek Kartı</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input type="datetime-local" value={startDateTime} onChange={(e) => setStartDateTime(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Bitiş</Label>
              <Input type="datetime-local" value={endDateTime} onChange={(e) => setEndDateTime(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleFilter} disabled={loading} size="sm" className="h-8 flex-1 sm:flex-none sm:w-auto px-4 text-xs gap-1.5" data-testid="filter-cancelled-orders-btn">
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Filtrele
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs text-muted-foreground" title="Temizle">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-base">İptal Edilen Siparişler ({searchedOrders.length})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Ara..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="h-7 w-[150px] pl-7 text-xs"
                />
              </div>
              <span className="text-xs text-muted-foreground">Göster:</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="all">Tümü</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : searchedOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{searchQuery ? "Aramayla eşleşen sipariş bulunamadı" : "İptal edilmiş sipariş bulunamadı"}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {paginatedOrders.map((order) => (
                  <div 
                    key={order.id}
                    className="bg-white border border-red-100 rounded-lg shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer"
                    onClick={() => onOrderSelect && onOrderSelect(order)}
                    data-testid={`order-card-${order.id}`}
                  >
                    {/* Üst Bar: Restoran + Mesafe + Ödeme + Tutar + Tarih + İptal Badge */}
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-red-50 bg-red-50/50 rounded-t-lg">
                      <div className="flex items-center gap-1 min-w-0 flex-1 flex-wrap">
                        <span className="px-1.5 py-0.5 bg-slate-700 text-white text-[10px] font-semibold rounded truncate max-w-[140px]" title={order.restaurant_name}>
                          {order.restaurant_name || "-"}
                        </span>
                        <span className="text-[9px] text-slate-500 flex-shrink-0">
                          {(() => {
                            const dist = calculateDistance(order);
                            return dist ? `${dist.toFixed(1)} km` : "";
                          })()}
                        </span>
                        <span className={`px-1 py-0.5 text-[9px] font-medium rounded flex-shrink-0 ${
                          order.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : 
                          order.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 
                          (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? 'bg-orange-100 text-orange-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {order.payment_method === 'cash' ? 'Nakit' : 
                           order.payment_method === 'card' ? 'Kart' : 
                           (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? (order.payment_method_detail || 'Y.Kartı') : 
                           'Online'}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 line-through flex-shrink-0">{order.total_amount?.toFixed(2) || "0.00"} ₺</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        <span className="text-[9px] text-slate-500 font-medium">{formatDate(order.created_at)}</span>
                        <span className="px-1.5 py-0.5 text-[9px] rounded bg-red-100 text-red-700 flex items-center gap-0.5 font-semibold">
                          <XCircle className="w-2.5 h-2.5" />İptal
                        </span>
                      </div>
                    </div>

                    {/* Orta: Müşteri + Telefon + Adres */}
                    <div className="px-2.5 py-1.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs text-slate-800">{order.customer_name || "-"}</span>
                        {order.customer_phone && (
                          <a href={`tel:${order.customer_phone}`} className="text-[10px] text-blue-600 font-mono" onClick={(e) => e.stopPropagation()}>
                            {order.customer_phone}
                          </a>
                        )}
                      </div>
                      {order.delivery_address && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">{order.delivery_address}</p>
                      )}
                    </div>

                    {/* Alt Bar: Kurye */}
                    {order.courier_name && (
                      <div className="px-2.5 py-1 border-t border-red-50 bg-slate-50/30 rounded-b-lg">
                        <span className="text-[11px] text-slate-600 font-medium">{order.courier_name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} / {totalItems} sipariş
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="h-7 w-7 p-0 text-xs"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
