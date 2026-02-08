import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  RefreshCw, MapPin, Phone, Clock, User, Bike, Store, Package,
  ChevronRight, Navigation, CheckCircle2, XCircle, AlertCircle,
  Plus, Trash2, Filter, Users, Timer
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sipariş durumları
const ORDER_STATUSES = {
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-500", textColor: "text-yellow-700", bgLight: "bg-yellow-50" },
  ready: { label: "Hazır", color: "bg-orange-500", textColor: "text-orange-700", bgLight: "bg-orange-50" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-500", textColor: "text-purple-700", bgLight: "bg-purple-50" },
  confirmed: { label: "Onaylandı", color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50" },
  on_the_way: { label: "Yolda", color: "bg-cyan-500", textColor: "text-cyan-700", bgLight: "bg-cyan-50" },
  delivered: { label: "Teslim Edildi", color: "bg-green-500", textColor: "text-green-700", bgLight: "bg-green-50" },
  cancelled: { label: "İptal Edildi", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50" }
};

// Admin tarafından seçilemeyen durumlar (otomatik atanır veya kurye seçer)
const COURIER_ONLY_STATUSES = ["assigned", "confirmed"];

// Ödeme yöntemleri
const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: "💵" },
  card: { label: "Kart", icon: "💳" },
  online: { label: "Online", icon: "📱" }
};

// Hazırlık süreleri
const PREPARATION_TIMES = [
  { value: 5, label: "5 Dakika" },
  { value: 10, label: "10 Dakika" },
  { value: 15, label: "15 Dakika" },
  { value: 30, label: "30 Dakika" },
  { value: 60, label: "60 Dakika" }
];

// Geri sayım hesaplama
const getCountdown = (preparationEndAt) => {
  if (!preparationEndAt) return null;
  const now = new Date();
  const endTime = new Date(preparationEndAt);
  const diffMs = endTime - now;
  
  if (diffMs <= 0) return { expired: true, text: "Süre doldu" };
  
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  
  return { 
    expired: false, 
    text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    minutes,
    seconds
  };
};

export default function SiparisYonetimiPage({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [couriersByStatus, setCouriersByStatus] = useState({ active: [], on_break: [], offline: [] });
  const [restaurants, setRestaurants] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [, setTick] = useState(0); // Geri sayım için re-render
  
  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  
  // Map ref
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Fetch company info for city center
  const fetchCompany = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompany(res.data);
    } catch (err) {
      console.error("Company fetch error:", err);
    }
  }, [companyId]);

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
      // Kuryeleri availability durumuna göre gruplu al
      const res = await axios.get(`${API}/companies/${companyId}/couriers/with-availability`);
      setCouriersByStatus({
        active: res.data.active || [],
        on_break: res.data.on_break || [],
        offline: res.data.offline || []
      });
      // Tüm kuryeler (eski uyumluluk için)
      const allCouriers = [...(res.data.active || []), ...(res.data.on_break || []), ...(res.data.offline || [])];
      setCouriers(allCouriers);
    } catch (err) {
      console.error("Couriers fetch error:", err);
      // Fallback to old endpoint
      try {
        const res = await axios.get(`${API}/couriers/companies/${companyId}/couriers`);
        const filtered = res.data.filter(c => !c.is_archived);
        setCouriers(filtered);
        setCouriersByStatus({
          active: filtered.filter(c => c.availability_status === 'active'),
          on_break: filtered.filter(c => c.availability_status === 'on_break'),
          offline: filtered.filter(c => !c.availability_status || c.availability_status === 'offline')
        });
      } catch (e) {
        console.error("Fallback couriers fetch error:", e);
      }
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
    await Promise.all([fetchOrders(), fetchCouriers(), fetchRestaurants(), fetchCompany()]);
    setLoading(false);
  }, [fetchOrders, fetchCouriers, fetchRestaurants, fetchCompany]);

  useEffect(() => {
    fetchAll();
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchOrders]);

  // Geri sayım için her saniye re-render
  useEffect(() => {
    const hasPreparingOrders = orders.some(o => o.status === 'preparing' && o.preparation_end_at);
    if (!hasPreparingOrders) return;
    
    const tickInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    
    return () => clearInterval(tickInterval);
  }, [orders]);

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
    
    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || !window.L || mapInstanceRef.current) return;
    
    // Şirketin ili veya default İstanbul
    const centerLat = company?.city_lat || 41.0082;
    const centerLng = company?.city_lng || 28.9784;
    
    const map = window.L.map(mapRef.current, {
      scrollWheelZoom: false  // Scroll zoom kapalı - sadece butonlarla zoom
    }).setView([centerLat, centerLng], 12);
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    mapInstanceRef.current = map;
    updateMapMarkers();
  };

  // Re-center map when company data loads
  useEffect(() => {
    if (mapInstanceRef.current && company?.city_lat && company?.city_lng) {
      mapInstanceRef.current.setView([company.city_lat, company.city_lng], 12);
    }
  }, [company]);

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

    // Order delivery markers (for undelivered orders)
    orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').forEach((order, idx) => {
      if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
        const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
        const markerColor = statusInfo?.color || 'bg-yellow-500';
        const marker = L.marker([order.delivery_location.latitude, order.delivery_location.longitude], {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-8 h-8 ${markerColor} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white">${idx + 1}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          })
        }).addTo(map);
        marker.bindPopup(`
          <strong>${order.order_number}</strong><br/>
          ${order.customer_name}<br/>
          ${order.delivery_address}<br/>
          <em>${statusInfo?.label || 'Beklemede'}</em>
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

  // Unassign courier from order
  const handleUnassignCourier = async (orderId) => {
    try {
      await axios.delete(`${API}/orders/${companyId}/${orderId}/assign`);
      toast.success("Kurye ataması kaldırıldı");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye ataması kaldırılamadı");
    }
  };

  // Reassign courier (assign different courier)
  const handleReassignCourier = async (orderId, courierId) => {
    try {
      await axios.post(`${API}/orders/${companyId}/${orderId}/assign`, {
        courier_id: courierId
      });
      toast.success("Kurye değiştirildi");
      fetchOrders();
    } catch (err) {
      toast.error("Kurye atanamadı");
    }
  };

  // Update order status
  const handleUpdateStatus = async (orderId, newStatus, preparationTime = null) => {
    try {
      const payload = { status: newStatus };
      if (preparationTime) {
        payload.preparation_time = parseInt(preparationTime);
      }
      
      await axios.post(`${API}/orders/${companyId}/${orderId}/status`, payload);
      toast.success(`Durum güncellendi: ${ORDER_STATUSES[newStatus]?.label || newStatus}`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum güncellenemedi");
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
      {/* Header with inline stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-heading text-xl font-bold tracking-tight">Sipariş Yönetimi</h2>
          {/* Inline Stats */}
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-full">
              <Package className="w-3.5 h-3.5 text-slate-600" />
              <span className="font-semibold">{stats.total}</span>
            </span>
            {stats.unassigned > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 rounded-full text-orange-700">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="font-semibold">{stats.unassigned}</span>
                <span className="text-xs">bekliyor</span>
              </span>
            )}
            {stats.onTheWay > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-cyan-100 rounded-full text-cyan-700">
                <Bike className="w-3.5 h-3.5" />
                <span className="font-semibold">{stats.onTheWay}</span>
                <span className="text-xs">yolda</span>
              </span>
            )}
            {stats.delivered > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 bg-green-100 rounded-full text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold">{stats.delivered}</span>
              </span>
            )}
          </div>
        </div>
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

      {/* Map with Courier List */}
      <div className="flex gap-4">
        {/* Courier Status List - Left Side */}
        <Card className="w-56 flex-shrink-0 hidden lg:block">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Kuryeler
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-3 max-h-[380px] overflow-y-auto">
            {/* Aktif Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-green-50 rounded text-xs font-semibold text-green-700 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Aktif ({couriersByStatus.active.length})
              </div>
              {couriersByStatus.active.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersByStatus.active.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 rounded">
                    <Bike className="w-3 h-3 text-green-600" />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))
              )}
            </div>
            
            {/* Moladaki Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-yellow-50 rounded text-xs font-semibold text-yellow-700 mb-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Molada ({couriersByStatus.on_break.length})
              </div>
              {couriersByStatus.on_break.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersByStatus.on_break.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 rounded">
                    <Bike className="w-3 h-3 text-yellow-600" />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))
              )}
            </div>
            
            {/* Çevrimdışı Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-600 mb-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                Çevrimdışı ({couriersByStatus.offline.length})
              </div>
              {couriersByStatus.offline.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersByStatus.offline.map(c => (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 rounded text-muted-foreground">
                    <Bike className="w-3 h-3" />
                    <span className="truncate">{c.name}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Map - Right Side */}
        <Card className="flex-1">
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
      </div>

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
                <SelectItem value="preparing">Hazırlanıyor</SelectItem>
                <SelectItem value="ready">Hazır</SelectItem>
                <SelectItem value="assigned">Kurye Atandı</SelectItem>
                <SelectItem value="confirmed">Onaylandı</SelectItem>
                <SelectItem value="on_the_way">Yolda</SelectItem>
                <SelectItem value="delivered">Teslim Edildi</SelectItem>
                <SelectItem value="cancelled">İptal Edildi</SelectItem>
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
            <div className="space-y-1.5">
              {orders.map((order) => {
                const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
                
                return (
                  <div 
                    key={order.id}
                    className={`px-3 py-2.5 rounded-lg border ${statusInfo.bgLight} cursor-pointer hover:shadow-sm transition-shadow`}
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowOrderDetailModal(true);
                    }}
                    data-testid={`order-card-${order.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Sol: Restoran + Durum + Müşteri */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-sm truncate">{order.restaurant_name}</span>
                        {/* Durum Dropdown - Tıkla değiştir */}
                        <Select 
                          value={order.status} 
                          onValueChange={(newValue) => {
                            // Hazırlanıyor süre seçenekleri: preparing_5, preparing_10, vb.
                            if (newValue.startsWith('preparing_')) {
                              const prepTime = parseInt(newValue.split('_')[1]);
                              handleUpdateStatus(order.id, 'preparing', prepTime);
                            } else {
                              handleUpdateStatus(order.id, newValue);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className={`${statusInfo.color} text-white text-[10px] px-1.5 py-0 h-5 w-auto border-0 gap-0.5`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SelectValue>{statusInfo.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {/* Hazırlanıyor - süre seçenekleri */}
                            <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">
                              Hazırlanıyor
                            </div>
                            {PREPARATION_TIMES.map(time => (
                              <SelectItem key={`preparing_${time.value}`} value={`preparing_${time.value}`} className="text-xs pl-4">
                                <div className="flex items-center gap-2">
                                  <Timer className="w-3 h-3 text-yellow-500" />
                                  {time.label}
                                </div>
                              </SelectItem>
                            ))}
                            
                            {/* Diğer durumlar */}
                            <div className="border-t my-1" />
                            {Object.entries(ORDER_STATUSES)
                              .filter(([key]) => !COURIER_ONLY_STATUSES.includes(key) && key !== 'preparing')
                              .map(([key, value]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${value.color}`} />
                                  {value.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Hazırlanıyor durumunda geri sayım */}
                        {order.status === 'preparing' && order.preparation_end_at && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            getCountdown(order.preparation_end_at)?.expired 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            <Timer className="w-3 h-3" />
                            {getCountdown(order.preparation_end_at)?.text}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground truncate">{order.customer_name}</span>
                        <span className="text-xs text-muted-foreground truncate hidden lg:block">- {order.delivery_address}</span>
                      </div>
                      
                      {/* Sağ: Saat + Ödeme + Tutar + Kurye/Ata */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:block">{formatTime(order.created_at)}</span>
                        <span className="text-xs">{paymentInfo.icon}</span>
                        <span className="font-semibold text-sm min-w-[70px] text-right">{formatCurrency(order.total_amount)}</span>
                        
                        {/* Kurye Dropdown - Her durumda aynı tasarım */}
                        <Select 
                          value={order.courier_id || ""}
                          onValueChange={(value) => {
                            if (value === "__remove__") {
                              handleUnassignCourier(order.id);
                            } else if (value) {
                              handleReassignCourier(order.id, value);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className={`h-6 px-2 text-xs min-w-[90px] gap-1 ${
                              order.courier_name 
                                ? "bg-green-50 border-green-200 text-green-700" 
                                : "bg-slate-50 border-slate-200 text-slate-600"
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Bike className="w-3 h-3 flex-shrink-0" />
                            <span>
                              {order.courier_name || "Kurye Ata"}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {/* Aktif Kuryeler */}
                            {couriersByStatus.active.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">
                                  Aktif Kuryeler
                                </div>
                                {couriersByStatus.active.map(courier => (
                                  <SelectItem key={courier.id} value={courier.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-green-500" />
                                      {courier.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {/* Moladaki Kuryeler */}
                            {couriersByStatus.on_break.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">
                                  Molada
                                </div>
                                {couriersByStatus.on_break.map(courier => (
                                  <SelectItem key={courier.id} value={courier.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                      {courier.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {/* Çevrimdışı Kuryeler */}
                            {couriersByStatus.offline.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1">
                                  Çevrimdışı
                                </div>
                                {couriersByStatus.offline.map(courier => (
                                  <SelectItem key={courier.id} value={courier.id}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                                      {courier.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {/* Atamayı Kaldır - sadece kurye varsa ve uygun durumda göster */}
                            {order.courier_id && order.status !== 'on_the_way' && order.status !== 'delivered' && (
                              <>
                                <div className="border-t my-1" />
                                <SelectItem value="__remove__" className="text-red-600">
                                  <div className="flex items-center gap-2">
                                    <XCircle className="w-3 h-3" />
                                    Atamayı Kaldır
                                  </div>
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Courier Modal - Sipariş detay modalından kullanılıyor */}
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
                {/* Aktif Kuryeler */}
                {couriersByStatus.active.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">
                      Aktif Kuryeler
                    </div>
                    {couriersByStatus.active.map(courier => (
                      <SelectItem key={courier.id} value={courier.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          {courier.name} {courier.phone && `- ${courier.phone}`}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                {/* Moladaki Kuryeler */}
                {couriersByStatus.on_break.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">
                      Molada
                    </div>
                    {couriersByStatus.on_break.map(courier => (
                      <SelectItem key={courier.id} value={courier.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                          {courier.name} {courier.phone && `- ${courier.phone}`}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
                {/* Çevrimdışı Kuryeler */}
                {couriersByStatus.offline.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1">
                      Çevrimdışı
                    </div>
                    {couriersByStatus.offline.map(courier => (
                      <SelectItem key={courier.id} value={courier.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          {courier.name} {courier.phone && `- ${courier.phone}`}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
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
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Bike className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium">{selectedOrder.courier_name}</p>
                      <p className="text-sm text-muted-foreground">Kurye</p>
                    </div>
                  </div>
                  {selectedOrder.status !== 'on_the_way' && selectedOrder.status !== 'delivered' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        handleUnassignCourier(selectedOrder.id);
                        setShowOrderDetailModal(false);
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Kaldır
                    </Button>
                  )}
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

              {/* Status Change - Dropdown */}
              {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'cancelled' && (
                <div className="pt-2 border-t">
                  <Label className="text-sm font-medium mb-2 block">Durum Değiştir</Label>
                  <Select 
                    value={selectedOrder.status} 
                    onValueChange={(newValue) => {
                      if (newValue.startsWith('preparing_')) {
                        const prepTime = parseInt(newValue.split('_')[1]);
                        handleUpdateStatus(selectedOrder.id, 'preparing', prepTime);
                      } else {
                        handleUpdateStatus(selectedOrder.id, newValue);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Hazırlanıyor - süre seçenekleri */}
                      <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">
                        Hazırlanıyor
                      </div>
                      {PREPARATION_TIMES.map(time => (
                        <SelectItem key={`preparing_${time.value}`} value={`preparing_${time.value}`} className="pl-4">
                          <div className="flex items-center gap-2">
                            <Timer className="w-3 h-3 text-yellow-500" />
                            {time.label}
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Diğer durumlar */}
                      <div className="border-t my-1" />
                      {Object.entries(ORDER_STATUSES)
                        .filter(([key]) => !COURIER_ONLY_STATUSES.includes(key) && key !== 'preparing')
                        .map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${value.color}`} />
                            {value.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
