import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Package, Filter, CreditCard, Bike, Calendar, Store, Search } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GecmisSiparislerPage({ companyId }) {
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const initialLoadDone = useRef(false);
  
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
    
    const openingTime = companyData?.opening_time || "09:00";
    const closingTime = companyData?.closing_time || "23:00";
    
    // Format: YYYY-MM-DDTHH:MM
    const startDateTime = `${today.toISOString().split('T')[0]}T${openingTime}`;
    const endDateTime = `${tomorrow.toISOString().split('T')[0]}T${closingTime}`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Fetch and filter orders - called on button click or initial load
  const fetchAndFilterOrders = useCallback(async (filters) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/orders/${companyId}?status=delivered`);
      let result = res.data;
      
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
          const orderDate = new Date(o.delivered_at || o.updated_at || o.created_at);
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
    fetchAndFilterOrders({
      restaurant: restaurantFilter,
      courier: courierFilter,
      payment: paymentFilter,
      startDateTime,
      endDateTime
    });
  };

  // Initial load: fetch company, then set defaults and auto-filter
  useEffect(() => {
    const initializeData = async () => {
      if (!companyId || initialLoadDone.current) return;
      
      try {
        // Fetch company first
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        setCompany(companyRes.data);
        
        // Set default dates
        const defaults = getDefaultDates(companyRes.data);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);
        
        // Fetch restaurants and couriers
        const [restaurantsRes, couriersRes] = await Promise.all([
          axios.get(`${API}/restaurants/${companyId}`),
          axios.get(`${API}/couriers/${companyId}`)
        ]);
        setRestaurants(restaurantsRes.data);
        setCouriers(couriersRes.data);
        
        // Auto-filter with defaults on first load
        await fetchAndFilterOrders({
          restaurant: "all",
          courier: "all",
          payment: "all",
          startDateTime: defaults.startDateTime,
          endDateTime: defaults.endDateTime
        });
        
        initialLoadDone.current = true;
      } catch (err) {
        console.error("Initialization error:", err);
        setLoading(false);
      }
    };
    
    initializeData();
  }, [companyId, getDefaultDates, fetchAndFilterOrders]);

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
    // Auto-filter with cleared defaults
    fetchAndFilterOrders({
      restaurant: "all",
      courier: "all",
      payment: "all",
      startDateTime: defaults.startDateTime,
      endDateTime: defaults.endDateTime
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Restaurant Filter */}
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Store className="w-3 h-3" />
                Restoran
              </Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {restaurants.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Courier Filter */}
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Bike className="w-3 h-3" />
                Kurye
              </Label>
              <Select value={courierFilter} onValueChange={setCourierFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {couriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Payment Method Filter */}
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <CreditCard className="w-3 h-3" />
                Ödeme Yöntemi
              </Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tümü" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="cash">Nakit</SelectItem>
                  <SelectItem value="card">Kredi Kartı</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Clear Filters */}
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 w-full">
                Filtreleri Temizle
              </Button>
            </div>
          </div>
          
          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t">
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                Başlangıç
              </Label>
              <Input 
                type="datetime-local" 
                value={startDateTime} 
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                Bitiş
              </Label>
              <Input 
                type="datetime-local" 
                value={endDateTime} 
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          
          {/* Filter Button */}
          <div className="mt-3 pt-3 border-t flex justify-end">
            <Button 
              onClick={handleFilter} 
              disabled={loading}
              className="gap-2"
              data-testid="filter-orders-btn"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Filtrele
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Teslim Edilen Siparişler ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Teslim edilmiş sipariş bulunamadı</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-primary">
                    <th className="text-left p-2 font-bold text-xs">Restoran</th>
                    <th className="text-left p-2 font-bold text-xs">Müşteri</th>
                    <th className="text-left p-2 font-bold text-xs">Sipariş Zamanı</th>
                    <th className="text-left p-2 font-bold text-xs">Ödeme</th>
                    <th className="text-left p-2 font-bold text-xs">Ücret</th>
                    <th className="text-left p-2 font-bold text-xs">Durum</th>
                    <th className="text-left p-2 font-bold text-xs">Adres</th>
                    <th className="text-left p-2 font-bold text-xs">Mesafe</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr 
                      key={order.id}
                      className="border-b hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowDetailModal(true);
                      }}
                    >
                      <td className="p-2">
                        <span className="font-medium">{order.restaurant_name || "-"}</span>
                      </td>
                      <td className="p-2">
                        <div>
                          <span>{order.customer_name || "-"}</span>
                          {order.customer_phone && (
                            <div className="text-xs text-muted-foreground font-mono">{order.customer_phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-xs">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          order.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : 
                          order.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {order.payment_method === 'cash' ? 'Nakit' : order.payment_method === 'card' ? 'Kart' : 'Online'}
                        </span>
                      </td>
                      <td className="p-2 font-semibold">
                        {order.total_amount?.toFixed(2) || "0.00"} ₺
                      </td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">
                          Teslim Edildi
                        </span>
                      </td>
                      <td className="p-2 text-xs max-w-[200px]" title={order.delivery_address}>
                        <div className="line-clamp-3">{order.delivery_address || "-"}</div>
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap">
                        {(() => {
                          const dist = calculateDistance(order);
                          return dist ? `${dist.toFixed(1)} km` : "-";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sipariş Detayı</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sipariş No:</span>
                  <span className="font-medium">{selectedOrder.order_number || selectedOrder.id?.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restoran:</span>
                  <span className="font-medium">{selectedOrder.restaurant_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kurye:</span>
                  <span className="font-medium">{selectedOrder.courier_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Müşteri:</span>
                  <span className="font-medium">{selectedOrder.customer_name || "-"}</span>
                </div>
                {selectedOrder.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefon:</span>
                    <span className="font-medium font-mono">{selectedOrder.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adres:</span>
                  <span className="font-medium text-right max-w-[200px]">{selectedOrder.delivery_address || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ödeme:</span>
                  <span className="font-medium">
                    {selectedOrder.payment_method === 'cash' ? 'Nakit' : selectedOrder.payment_method === 'card' ? 'Kredi Kartı' : 'Online'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tutar:</span>
                  <span className="font-medium">{selectedOrder.total_amount?.toFixed(2) || "0.00"} ₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oluşturulma:</span>
                  <span className="font-medium">{formatDate(selectedOrder.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teslim:</span>
                  <span className="font-medium">{formatDate(selectedOrder.delivered_at || selectedOrder.updated_at)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
