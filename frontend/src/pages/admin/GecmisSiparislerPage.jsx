import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Package, Clock, Filter, CreditCard, Bike, Calendar, Store } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GecmisSiparislerPage({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Filter states
  const [restaurants, setRestaurants] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [company, setCompany] = useState(null);
  
  const [restaurantFilter, setRestaurantFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  
  // Date filters with defaults
  const getDefaultDates = useCallback(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = company?.opening_time || "09:00";
    const closingTime = company?.closing_time || "23:00";
    
    return {
      startDate: today.toISOString().split('T')[0],
      startTime: openingTime,
      endDate: tomorrow.toISOString().split('T')[0],
      endTime: closingTime
    };
  }, [company]);
  
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");

  // Fetch company info
  const fetchCompany = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompany(res.data);
    } catch (err) {
      console.error("Company fetch error:", err);
    }
  }, [companyId]);

  // Fetch restaurants
  const fetchRestaurants = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/restaurants/${companyId}`);
      setRestaurants(res.data);
    } catch (err) {
      console.error("Restaurants fetch error:", err);
    }
  }, [companyId]);

  // Fetch couriers
  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/couriers/${companyId}`);
      setCouriers(res.data);
    } catch (err) {
      console.error("Couriers fetch error:", err);
    }
  }, [companyId]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/orders/${companyId}?status=delivered`);
      setAllOrders(res.data);
      setOrders(res.data);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Set default dates when company is loaded
  useEffect(() => {
    if (company) {
      const defaults = getDefaultDates();
      if (!startDate) setStartDate(defaults.startDate);
      if (!startTime) setStartTime(defaults.startTime);
      if (!endDate) setEndDate(defaults.endDate);
      if (!endTime) setEndTime(defaults.endTime);
    }
  }, [company, getDefaultDates, startDate, startTime, endDate, endTime]);

  useEffect(() => {
    fetchCompany();
    fetchRestaurants();
    fetchCouriers();
    fetchOrders();
  }, [fetchCompany, fetchRestaurants, fetchCouriers, fetchOrders]);

  // Apply filters
  const filteredOrders = useMemo(() => {
    let result = [...allOrders];
    
    // Restaurant filter
    if (restaurantFilter !== "all") {
      result = result.filter(o => o.restaurant_id === restaurantFilter);
    }
    
    // Courier filter
    if (courierFilter !== "all") {
      result = result.filter(o => o.courier_id === courierFilter);
    }
    
    // Payment method filter
    if (paymentFilter !== "all") {
      result = result.filter(o => o.payment_method === paymentFilter);
    }
    
    // Date range filter
    if (startDate && startTime && endDate && endTime) {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);
      
      result = result.filter(o => {
        const orderDate = new Date(o.delivered_at || o.updated_at || o.created_at);
        return orderDate >= startDateTime && orderDate <= endDateTime;
      });
    }
    
    return result;
  }, [allOrders, restaurantFilter, courierFilter, paymentFilter, startDate, startTime, endDate, endTime]);

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
    const defaults = getDefaultDates();
    setStartDate(defaults.startDate);
    setStartTime(defaults.startTime);
    setEndDate(defaults.endDate);
    setEndTime(defaults.endTime);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t">
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                Başlangıç Tarih
              </Label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                Başlangıç Saat
              </Label>
              <Input 
                type="time" 
                value={startTime} 
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" />
                Bitiş Tarih
              </Label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3" />
                Bitiş Saat
              </Label>
              <Input 
                type="time" 
                value={endTime} 
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9"
              />
            </div>
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
                      <td className="p-2 text-xs max-w-[200px] truncate" title={order.delivery_address}>
                        {order.delivery_address || "-"}
                      </td>
                      <td className="p-2 text-xs">
                        {order.distance ? `${order.distance.toFixed(1)} km` : "-"}
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
