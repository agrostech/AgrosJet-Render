import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  RefreshCw, MapPin, Phone, Clock, User, Bike, Store, Package,
  ChevronRight, Navigation, CheckCircle2, XCircle, AlertCircle,
  Plus, Trash2, Filter
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sipariş durumları
const ORDER_STATUSES = {
  new: { label: "Yeni", color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50" },
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-500", textColor: "text-yellow-700", bgLight: "bg-yellow-50" },
  ready: { label: "Hazır", color: "bg-orange-500", textColor: "text-orange-700", bgLight: "bg-orange-50" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-500", textColor: "text-purple-700", bgLight: "bg-purple-50" },
  courier_confirmed: { label: "Kurye Onayladı", color: "bg-indigo-500", textColor: "text-indigo-700", bgLight: "bg-indigo-50" },
  on_the_way: { label: "Yolda", color: "bg-cyan-500", textColor: "text-cyan-700", bgLight: "bg-cyan-50" },
  delivered: { label: "Teslim Edildi", color: "bg-green-500", textColor: "text-green-700", bgLight: "bg-green-50" },
  cancelled: { label: "İptal", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50" }
};

// Ödeme yöntemleri
const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: "💵" },
  card: { label: "Kart", icon: "💳" },
  online: { label: "Online", icon: "📱" }
};

export default function SiparisYonetimiPage({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  
  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  
  // Map ref
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Fetch data
  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/orders/${companyId}?status=${statusFilter}`);
      setOrders(res.data);
    } catch (err) {
      console.error("Orders fetch error:", err);
    }
  }, [companyId, statusFilter]);

  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/couriers/company/${companyId}`);
      setCouriers(res.data.filter(c => !c.is_archived));
    } catch (err) {
      console.error("Couriers fetch error:", err);
    }
  }, [companyId]);

  const fetchRestaurants = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/restaurants/${companyId}`);
      setRestaurants(res.data);
    } catch (err) {
      console.error("Restaurants fetch error:", err);
    }
  }, [companyId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchCouriers(), fetchRestaurants()]);
    setLoading(false);
  }, [fetchOrders, fetchCouriers, fetchRestaurants]);

  useEffect(() => {
    fetchAll();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchOrders]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => initMap();
      document.body.appendChild(script);
    } else {
      initMap();
    }
  }, []);

  const initMap = () => {
    if (!mapRef.current || !window.L) return;
    
    // Istanbul center
    const map = window.L.map(mapRef.current).setView([41.0082, 28.9784], 11);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    mapInstanceRef.current = map;
    updateMapMarkers();
  };

  // Update markers when data changes
  useEffect(() => {
    updateMapMarkers();
  }, [orders, restaurants, couriers]);

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;
    
    const map = mapInstanceRef.current;
    const L = window.L;
    
    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Restaurant markers (red)
    restaurants.forEach(r => {
      if (r.latitude && r.longitude) {
        const marker = L.marker([r.latitude, r.longitude], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white">🍽️</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }).addTo(map);
        marker.bindPopup(`<strong>${r.name}</strong><br/>${r.address || ''}`);
        markersRef.current.push(marker);
      }
    });

    // Order delivery markers (blue - for undelivered orders)
    orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').forEach((order, idx) => {
      if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
        const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.new;
        const marker = L.marker([order.delivery_location.latitude, order.delivery_location.longitude], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-8 h-8 ${statusInfo.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white">${idx + 1}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }).addTo(map);
        marker.bindPopup(`
          <strong>${order.order_number}</strong><br/>
          ${order.customer_name}<br/>
          ${order.delivery_address}<br/>
          <em>${statusInfo.label}</em>
        `);
        marker.on('click', () => {
          setSelectedOrder(order);
          setShowOrderDetailModal(true);
        });
        markersRef.current.push(marker);
      }
    });

    // TODO: Courier live locations (green) - requires real-time location tracking
  };

  // Generate mock orders
  const handleGenerateMock = async () => {
    try {
      const res = await axios.post(`${API}/orders/${companyId}/generate-mock?count=5`);
      toast.success(res.data.message);
      fetchOrders();
    } catch (err) {
      toast.error("Mock sipariş oluşturulamadı");
    }
  };

  // Clear mock orders
  const handleClearMock = async () => {
    try {
      const res = await axios.delete(`${API}/orders/${companyId}/clear-mock`);
      toast.success(res.data.message);
      fetchOrders();
    } catch (err) {
      toast.error("Mock siparişler silinemedi");
    }
  };

  // Assign courier to order
  const handleAssignCourier = async () => {
    if (!selectedOrder || !selectedCourierId) return;
    
    try {
      await axios.post(`${API}/orders/${companyId}/${selectedOrder.id}/assign`, {
        courier_id: selectedCourierId
      });
      toast.success("Kurye atandı");
      setShowAssignModal(false);
      setSelectedCourierId("");
      fetchOrders();
    } catch (err) {
      toast.error("Kurye atanamadı");
    }
  };

  // Update order status
  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      await axios.post(`${API}/orders/${companyId}/${orderId}/status`, {
        status: newStatus
      });
      toast.success(`Durum güncellendi: ${ORDER_STATUSES[newStatus].label}`);
      fetchOrders();
    } catch (err) {
      toast.error("Durum güncellenemedi");
    }
  };

  // Stats
  const stats = {
    total: orders.length,
    unassigned: orders.filter(o => !o.courier_id && !['delivered', 'cancelled'].includes(o.status)).length,
    onTheWay: orders.filter(o => o.status === 'on_the_way').length,
    delivered: orders.filter(o => o.status === 'delivered').length
  };

  const formatTime = (isoString) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  return (
    <div data-testid="siparis-yonetimi-page" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">Sipariş Yönetimi</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Yenile
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateMock}>
            <Plus className="w-4 h-4 mr-2" />
            Mock Sipariş
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearMock}>
            <Trash2 className="w-4 h-4 mr-2" />
            Mock Temizle
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Toplam</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.unassigned}</p>
                <p className="text-xs text-muted-foreground">Atanmamış</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 rounded-lg">
                <Bike className="w-5 h-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.onTheWay}</p>
                <p className="text-xs text-muted-foreground">Yolda</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">Teslim</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Canlı Harita
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div 
            ref={mapRef} 
            className="w-full h-[350px] md:h-[400px] rounded-b-lg"
            style={{ zIndex: 1 }}
          />
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Siparişler</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif Siparişler</SelectItem>
                <SelectItem value="new">Yeni</SelectItem>
                <SelectItem value="preparing">Hazırlanıyor</SelectItem>
                <SelectItem value="ready">Hazır</SelectItem>
                <SelectItem value="assigned">Kurye Atandı</SelectItem>
                <SelectItem value="on_the_way">Yolda</SelectItem>
                <SelectItem value="delivered">Teslim Edildi</SelectItem>
                <SelectItem value="cancelled">İptal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Sipariş bulunamadı</p>
              <Button variant="link" onClick={handleGenerateMock}>
                Test için mock sipariş oluştur
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.new;
                const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
                
                return (
                  <div 
                    key={order.id}
                    className={`p-4 rounded-lg border ${statusInfo.bgLight} cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowOrderDetailModal(true);
                    }}
                    data-testid={`order-card-${order.id}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{order.order_number}</span>
                          <Badge className={`${statusInfo.color} text-white text-xs`}>
                            {statusInfo.label}
                          </Badge>
                          <span className="text-sm">{paymentInfo.icon}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Store className="w-3.5 h-3.5" />
                            {order.restaurant_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {order.customer_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatTime(order.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          {order.delivery_address}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(order.total_amount)}</p>
                          {order.courier_name ? (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
                              <Bike className="w-3.5 h-3.5" />
                              {order.courier_name}
                            </p>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="mt-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(order);
                                setShowAssignModal(true);
                              }}
                            >
                              Kurye Ata
                            </Button>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Courier Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kurye Ata - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{selectedOrder?.restaurant_name}</strong> → <strong>{selectedOrder?.delivery_address}</strong>
            </p>
            <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
              <SelectTrigger>
                <SelectValue placeholder="Kurye seçin" />
              </SelectTrigger>
              <SelectContent>
                {couriers.map(courier => (
                  <SelectItem key={courier.id} value={courier.id}>
                    {courier.name} {courier.phone && `- ${courier.phone}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              İptal
            </Button>
            <Button onClick={handleAssignCourier} disabled={!selectedCourierId}>
              Ata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Modal */}
      <Dialog open={showOrderDetailModal} onOpenChange={setShowOrderDetailModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedOrder?.order_number}
              {selectedOrder && (
                <Badge className={`${ORDER_STATUSES[selectedOrder.status]?.color} text-white`}>
                  {ORDER_STATUSES[selectedOrder.status]?.label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Restaurant */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <Store className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <p className="font-medium">{selectedOrder.restaurant_name}</p>
                  <p className="text-sm text-muted-foreground">Restoran</p>
                </div>
              </div>

              {/* Customer */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <User className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" />
                    {selectedOrder.customer_phone}
                  </p>
                </div>
                <a 
                  href={`tel:${selectedOrder.customer_phone}`}
                  className="p-2 bg-green-100 rounded-full hover:bg-green-200"
                >
                  <Phone className="w-4 h-4 text-green-600" />
                </a>
              </div>

              {/* Delivery Address */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <MapPin className="w-5 h-5 text-orange-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{selectedOrder.delivery_address}</p>
                  {selectedOrder.notes && (
                    <p className="text-sm text-orange-600 mt-1">Not: {selectedOrder.notes}</p>
                  )}
                </div>
                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedOrder.delivery_location?.latitude},${selectedOrder.delivery_location?.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-blue-100 rounded-full hover:bg-blue-200"
                >
                  <Navigation className="w-4 h-4 text-blue-600" />
                </a>
              </div>

              {/* Items */}
              <div className="border rounded-lg p-3">
                <p className="font-medium mb-2">Ürünler</p>
                <div className="space-y-1">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-semibold mt-2 pt-2 border-t">
                  <span>Toplam</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <span>{PAYMENT_METHODS[selectedOrder.payment_method]?.icon}</span>
                  <span>{PAYMENT_METHODS[selectedOrder.payment_method]?.label}</span>
                </div>
              </div>

              {/* Courier */}
              {selectedOrder.courier_name ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  <Bike className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium">{selectedOrder.courier_name}</p>
                    <p className="text-sm text-muted-foreground">Kurye</p>
                  </div>
                </div>
              ) : (
                <Button 
                  className="w-full"
                  onClick={() => {
                    setShowOrderDetailModal(false);
                    setShowAssignModal(true);
                  }}
                >
                  <Bike className="w-4 h-4 mr-2" />
                  Kurye Ata
                </Button>
              )}

              {/* Status Actions */}
              {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
                <div className="flex gap-2 flex-wrap pt-2 border-t">
                  {selectedOrder.status === 'new' && (
                    <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedOrder.id, 'preparing')}>
                      Hazırlanıyor
                    </Button>
                  )}
                  {selectedOrder.status === 'preparing' && (
                    <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedOrder.id, 'ready')}>
                      Hazır
                    </Button>
                  )}
                  {['assigned', 'courier_confirmed'].includes(selectedOrder.status) && (
                    <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(selectedOrder.id, 'on_the_way')}>
                      Yola Çıktı
                    </Button>
                  )}
                  {selectedOrder.status === 'on_the_way' && (
                    <Button size="sm" variant="default" onClick={() => handleUpdateStatus(selectedOrder.id, 'delivered')}>
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Teslim Edildi
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-red-600"
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    İptal
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
