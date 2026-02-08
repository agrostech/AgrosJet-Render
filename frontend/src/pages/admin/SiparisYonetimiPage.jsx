import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  RefreshCw, MapPin, Phone, Clock, User, Bike, Store, Package,
  ChevronRight, ChevronDown, Navigation, CheckCircle2, XCircle, AlertCircle,
  Plus, Trash2, Filter, Users, Timer, Map
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

// Geri sayım hesaplama (dakika bazlı)
const getCountdown = (preparationEndAt) => {
  if (!preparationEndAt) return null;
  const now = new Date();
  const endTime = new Date(preparationEndAt);
  const diffMs = endTime - now;
  
  if (diffMs <= 0) return { expired: true, text: "Süre Doldu" };
  
  const minutes = Math.ceil(diffMs / 60000); // Yukarı yuvarla
  
  return { 
    expired: false, 
    text: `${minutes} Dakika`,
    minutes
  };
};

// Hedeflenen teslimat zamanı hesaplama (sipariş + 35 dk)
const getTargetDelivery = (createdAt) => {
  if (!createdAt) return null;
  
  const orderTime = new Date(createdAt);
  const targetTime = new Date(orderTime.getTime() + 35 * 60000); // +35 dakika
  const now = new Date();
  
  const targetTimeStr = targetTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  
  if (now > targetTime) {
    // Gecikme var
    const delayMs = now - targetTime;
    const delayMinutes = Math.floor(delayMs / 60000);
    return {
      time: targetTimeStr,
      delayed: true,
      delayMinutes
    };
  }
  
  return {
    time: targetTimeStr,
    delayed: false,
    delayMinutes: 0
  };
};

export default function SiparisYonetimiPage({ companyId, adminName }) {
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
  const [orderDetailTab, setOrderDetailTab] = useState("details");
  
  // Map ref
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  
  // Order detail modal map ref
  const orderMapRef = useRef(null);
  const orderMapInstanceRef = useRef(null);

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

  // Geri sayım için her dakika re-render (dakika bazlı olduğu için)
  useEffect(() => {
    const hasPreparingOrders = orders.some(o => o.status === 'preparing' && o.preparation_end_at);
    if (!hasPreparingOrders) return;
    
    const tickInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000); // Her dakika güncelle
    
    return () => clearInterval(tickInterval);
  }, [orders]);

  // Order detail modal - Konum sekmesi haritası
  useEffect(() => {
    if (orderDetailTab !== 'location' || !selectedOrder) return;
    
    // DOM hazır olana kadar bekle
    const initOrderMap = async () => {
      // Container hazır mı?
      if (!orderMapRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!orderMapRef.current) return;
      }
      
      // Zaten harita varsa temizle
      if (orderMapInstanceRef.current) {
        orderMapInstanceRef.current.remove();
        orderMapInstanceRef.current = null;
      }
      
      // Leaflet yüklü mü kontrol et
      if (!window.L) {
        // Leaflet'i yükle
        const loadLeaflet = () => {
          return new Promise((resolve) => {
            if (window.L) {
              resolve();
              return;
            }
            
            // CSS
            if (!document.querySelector('link[href*="leaflet"]')) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
              document.head.appendChild(link);
            }
            
            // JS
            if (!document.querySelector('script[src*="leaflet"]')) {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
              script.onload = () => resolve();
              document.head.appendChild(script);
            } else {
              // Script var ama henüz yüklenmemiş olabilir
              const checkInterval = setInterval(() => {
                if (window.L) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
            }
          });
        };
        
        await loadLeaflet();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!window.L || !orderMapRef.current) return;
      
      const L = window.L;
      const deliveryLat = selectedOrder.delivery_location?.latitude || 41.0082;
      const deliveryLng = selectedOrder.delivery_location?.longitude || 28.9784;
      const restaurantLat = selectedOrder.restaurant_location?.latitude;
      const restaurantLng = selectedOrder.restaurant_location?.longitude;
      
      // Haritayı oluştur
      const map = L.map(orderMapRef.current, {
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([deliveryLat, deliveryLng], 15);
      
      // CartoDB Positron - Temiz, modern harita stili
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
      
      // 1km çap = 500m yarıçap için bounds hesapla
      // 1 derece latitude ≈ 111km, 500m ≈ 0.0045 derece
      const radiusInDegrees = 0.0045;
      const bounds1km = L.latLngBounds([
        [deliveryLat - radiusInDegrees, deliveryLng - radiusInDegrees],
        [deliveryLat + radiusInDegrees, deliveryLng + radiusInDegrees]
      ]);
      
      // Teslimat noktası marker (kırmızı, yuvarlak)
      const deliveryIcon = L.divIcon({
        className: '',
        html: `<div style="background: #ef4444; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      
      L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon })
        .addTo(map)
        .bindPopup(`<b>Teslimat Adresi</b><br>${selectedOrder.delivery_address}`);
      
      // Restoran marker (gri, küçük, yuvarlak)
      if (restaurantLat && restaurantLng) {
        L.marker([restaurantLat, restaurantLng], {
          icon: L.divIcon({
            className: 'restaurant-marker',
            html: '<div style="width:10px;height:10px;background:#9ca3af;border-radius:50%;border:1px solid #6b7280;"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
          })
        })
          .addTo(map)
          .bindPopup(`<b>${selectedOrder.restaurant_name}</b><br>Restoran`);
      }
      
      // Haritayı 1km çapında teslimat noktasına ortala
      map.fitBounds(bounds1km);
      
      orderMapInstanceRef.current = map;
      
      // Map resize fix - birden fazla kez çağır
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
      setTimeout(() => map.invalidateSize(), 500);
    };
    
    // Biraz bekleyip başlat (tab geçişi için)
    const timer = setTimeout(initOrderMap, 150);
    
    return () => {
      clearTimeout(timer);
    };
  }, [orderDetailTab, selectedOrder]);

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
    
    // Şirketin ili veya default Türkiye merkezi
    const centerLat = company?.city_lat || 39.0;
    const centerLng = company?.city_lng || 35.0;
    const zoomLevel = company?.city_lat ? 12 : 6;
    
    const map = window.L.map(mapRef.current, {
      scrollWheelZoom: false,
      attributionControl: false
    }).setView([centerLat, centerLng], zoomLevel);
    
    // CartoDB Positron - Temiz, modern harita stili
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);
    
    mapInstanceRef.current = map;
  };

  // Şirket verisi yüklenince haritayı şirketin iline ortala
  useEffect(() => {
    if (!company?.city_lat || !company?.city_lng) return;
    
    // Harita hazır olana kadar bekle
    const centerMap = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([company.city_lat, company.city_lng], 12);
      } else {
        // Harita henüz yüklenmemişse tekrar dene
        setTimeout(centerMap, 300);
      }
    };
    
    centerMap();
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
    markersRef.current.forEach(marker => {
      try {
        map.removeLayer(marker);
      } catch (e) {
        // ignore
      }
    });
    markersRef.current = [];

    // Restaurant markers (gri, küçük, yuvarlak)
    restaurants.forEach(r => {
      if (r.latitude && r.longitude) {
        try {
          const marker = L.marker([r.latitude, r.longitude], {
            icon: L.divIcon({
              className: 'restaurant-marker',
              html: '<div style="width:12px;height:12px;background:#9ca3af;border-radius:50%;border:1px solid #6b7280;"></div>',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })
          }).addTo(map);
          marker.bindPopup(`<strong>${r.name}</strong><br/>${r.address || ''}`);
          markersRef.current.push(marker);
        } catch (e) {
          console.error("Restaurant marker error:", e);
        }
      }
    });

    // Order delivery markers (yuvarlak)
    orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').forEach((order, idx) => {
      if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
        try {
          const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
          const bgColor = statusInfo?.color?.replace('bg-', '') || 'yellow-500';
          const colorMap = {
            'yellow-500': '#eab308',
            'orange-500': '#f97316',
            'purple-500': '#a855f7',
            'blue-500': '#3b82f6',
            'cyan-500': '#06b6d4',
            'green-500': '#22c55e',
            'red-500': '#ef4444'
          };
          const hexColor = colorMap[bgColor] || '#eab308';
          
          const marker = L.marker([order.delivery_location.latitude, order.delivery_location.longitude], {
            icon: L.divIcon({
              className: 'order-marker',
              html: `<div style="background: ${hexColor}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">${idx + 1}</div>`,
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
        } catch (e) {
          console.error("Order marker error:", e);
        }
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
        courier_id: selectedCourierId,
        admin_name: adminName || "Admin"
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
      await axios.delete(`${API}/orders/${companyId}/${orderId}/assign?admin_name=${encodeURIComponent(adminName || "Admin")}`);
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
        courier_id: courierId,
        admin_name: adminName || "Admin"
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
      const payload = { 
        status: newStatus,
        admin_name: adminName || "Admin"
      };
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

      {/* Mobile Courier Status List */}
      <Card className="lg:hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Kuryeler
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-3">
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

      {/* Map with Courier List */}
      <div className="flex gap-4">
        {/* Courier Status List - Left Side (Desktop only) */}
        <Card className="w-56 flex-shrink-0 hidden lg:block">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Kuryeler
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-3 max-h-[500px] overflow-y-auto">
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
              className="w-full h-[450px] md:h-[520px] rounded-b-lg"
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
                const targetDelivery = getTargetDelivery(order.created_at);
                
                return (
                  <div 
                    key={order.id}
                    className={`px-3 py-2.5 rounded-lg border ${statusInfo.bgLight} cursor-pointer hover:shadow-sm transition-shadow`}
                    onClick={(e) => {
                      // Dropdown veya buton tıklamalarında modal açılmasın
                      const target = e.target;
                      if (
                        target.closest('[data-radix-select-trigger]') ||
                        target.closest('[data-radix-select-content]') ||
                        target.closest('[role="combobox"]') ||
                        target.closest('[role="option"]') ||
                        target.closest('button')
                      ) {
                        return;
                      }
                      setSelectedOrder(order);
                      setShowOrderDetailModal(true);
                    }}
                    data-testid={`order-card-${order.id}`}
                  >
                    {/* Mobil görünüm */}
                    <div className="flex flex-col gap-2 sm:hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{formatTime(order.created_at)}</span>
                          {targetDelivery && order.status !== 'delivered' && order.status !== 'cancelled' && (
                            <span className={`text-xs font-mono ${targetDelivery.delayed ? 'text-red-600' : 'text-green-600'}`}>
                              → {targetDelivery.time}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-sm">{formatCurrency(order.total_amount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{order.restaurant_name}</span>
                        {/* Durum Badge */}
                        <Select 
                          value={order.status} 
                          onValueChange={(newValue) => {
                            if (newValue.startsWith('preparing_')) {
                              const prepTime = parseInt(newValue.split('_')[1]);
                              handleUpdateStatus(order.id, 'preparing', prepTime);
                            } else {
                              handleUpdateStatus(order.id, newValue);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className={`${statusInfo.color} text-white text-[11px] px-2 py-0 h-5 w-auto border-0 gap-0.5`}
                            
                          >
                            <SelectValue>
                              {order.status === 'preparing' && order.preparation_end_at
                                ? getCountdown(order.preparation_end_at)?.text
                                : statusInfo.label
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent >
                            <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">Hazırlanıyor</div>
                            {PREPARATION_TIMES.map(time => (
                              <SelectItem key={`preparing_${time.value}`} value={`preparing_${time.value}`} className="text-xs pl-4">
                                <div className="flex items-center gap-2">
                                  <Timer className="w-3 h-3 text-yellow-500" />
                                  {time.label}
                                </div>
                              </SelectItem>
                            ))}
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
                      </div>
                      {/* Adres bilgisi */}
                      <div className="text-xs text-muted-foreground truncate">
                        {order.delivery_address}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate max-w-[150px]">{order.customer_name}</span>
                        {/* Kurye Dropdown */}
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
                            className="h-6 text-xs border-dashed w-auto gap-1 px-2"
                          >
                            <Bike className="w-3 h-3" />
                            <SelectValue>
                              {order.courier_name || "Kurye Ata"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {couriers.filter(c => c.status === 'active').map(c => (
                              <SelectItem key={c.id} value={c.id} className="text-xs">
                                {c.name}
                              </SelectItem>
                            ))}
                            {order.courier_id && (
                              <>
                                <div className="border-t my-1" />
                                <SelectItem value="__remove__" className="text-xs text-red-600">
                                  Kurye Kaldır
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Desktop görünüm */}
                    <div className="hidden sm:flex items-center justify-between gap-3">
                      {/* Sol: Saat + Restoran + Durum + Müşteri */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {/* Saat ve Hedef Teslimat */}
                        <div className="flex flex-col min-w-[50px]">
                          <span className="text-xs text-muted-foreground font-mono">{formatTime(order.created_at)}</span>
                          {targetDelivery && order.status !== 'delivered' && order.status !== 'cancelled' && (
                            <div className="flex flex-col">
                              <span className={`text-[10px] font-mono ${targetDelivery.delayed ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                                → {targetDelivery.time}
                              </span>
                              {targetDelivery.delayed && (
                                <span className="text-[9px] text-red-500">
                                  ({targetDelivery.delayMinutes} dk gecikti)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-sm truncate">{order.restaurant_name}</span>
                        {/* Durum Dropdown - Tıkla değiştir */}
                        <Select 
                          value={order.status} 
                          onValueChange={(newValue) => {
                            if (newValue.startsWith('preparing_')) {
                              const prepTime = parseInt(newValue.split('_')[1]);
                              handleUpdateStatus(order.id, 'preparing', prepTime);
                            } else {
                              handleUpdateStatus(order.id, newValue);
                            }
                          }}
                        >
                          <SelectTrigger 
                            className={`${
                              order.status === 'preparing' && order.preparation_end_at && getCountdown(order.preparation_end_at)?.expired
                                ? 'bg-red-500'
                                : statusInfo.color
                            } text-white text-[11px] px-2 py-0 h-5 w-auto border-0 gap-0.5`}
                            
                          >
                            <SelectValue>
                              {order.status === 'preparing' && order.preparation_end_at
                                ? getCountdown(order.preparation_end_at)?.text
                                : statusInfo.label
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent >
                            <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">Hazırlanıyor</div>
                            {PREPARATION_TIMES.map(time => (
                              <SelectItem key={`preparing_${time.value}`} value={`preparing_${time.value}`} className="text-xs pl-4">
                                <div className="flex items-center gap-2">
                                  <Timer className="w-3 h-3 text-yellow-500" />
                                  {time.label}
                                </div>
                              </SelectItem>
                            ))}
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
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground truncate">{order.customer_name}</span>
                        <span className="text-xs text-muted-foreground truncate hidden lg:block">- {order.delivery_address}</span>
                      </div>
                      
                      {/* Sağ: Ödeme + Tutar + Kurye/Ata */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:block">{paymentInfo.label}</span>
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
                            
                          >
                            <Bike className="w-3 h-3 flex-shrink-0" />
                            <span>
                              {order.courier_name || "Kurye Ata"}
                            </span>
                          </SelectTrigger>
                          <SelectContent >
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
      <Dialog open={showOrderDetailModal} onOpenChange={(open) => {
        setShowOrderDetailModal(open);
        if (!open) {
          setOrderDetailTab("details");
          // Cleanup order map
          if (orderMapInstanceRef.current) {
            orderMapInstanceRef.current.remove();
            orderMapInstanceRef.current = null;
          }
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Sipariş Bilgileri
              {selectedOrder && (
                <Badge className={`${
                  selectedOrder.status === 'preparing' && selectedOrder.preparation_end_at && getCountdown(selectedOrder.preparation_end_at)?.expired
                    ? 'bg-red-500'
                    : ORDER_STATUSES[selectedOrder.status]?.color
                } text-white`}>
                  {selectedOrder.status === 'preparing' && selectedOrder.preparation_end_at
                    ? getCountdown(selectedOrder.preparation_end_at)?.text
                    : ORDER_STATUSES[selectedOrder.status]?.label
                  }
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <Tabs value={orderDetailTab} onValueChange={setOrderDetailTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Detaylar
                </TabsTrigger>
                <TabsTrigger value="location" className="flex items-center gap-2">
                  <Map className="w-4 h-4" />
                  Konum
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Geçmiş
                </TabsTrigger>
              </TabsList>
              
              {/* Detaylar Sekmesi */}
              <TabsContent value="details" className="flex-1 overflow-y-auto mt-4 space-y-4">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 bg-blue-100 rounded-full hover:bg-blue-200"
                    onClick={() => setOrderDetailTab("location")}
                  >
                    <Navigation className="w-4 h-4 text-blue-600" />
                  </Button>
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
              </TabsContent>
              
              {/* Konum Sekmesi */}
              <TabsContent value="location" className="flex-1 mt-4">
                <div className="space-y-3">
                  {/* Adres bilgisi */}
                  <div className="flex items-start gap-2 p-2 bg-orange-50 rounded-lg">
                    <MapPin className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{selectedOrder.delivery_address}</p>
                      <p className="text-xs text-muted-foreground">{selectedOrder.customer_name}</p>
                    </div>
                  </div>
                  
                  {/* Harita */}
                  <div 
                    ref={orderMapRef}
                    className="w-full h-[300px] rounded-lg border"
                    style={{ zIndex: 1 }}
                  />
                  
                  {/* Google Maps'te aç butonu */}
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedOrder.delivery_location?.latitude},${selectedOrder.delivery_location?.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Navigation className="w-4 h-4" />
                    Google Maps'te Yol Tarifi Al
                  </a>
                </div>
              </TabsContent>
              
              {/* Geçmiş Sekmesi */}
              <TabsContent value="history" className="flex-1 overflow-y-auto mt-4">
                <div className="space-y-1">
                  {selectedOrder.status_history && selectedOrder.status_history.length > 0 ? (
                    [...selectedOrder.status_history].reverse().map((entry, idx) => {
                      const statusColor = ORDER_STATUSES[entry.status]?.color || 'bg-slate-500';
                      const entryTime = new Date(entry.timestamp);
                      
                      return (
                        <div key={idx} className="flex items-start gap-3 p-3 border-l-2 border-slate-200 ml-2">
                          <div className={`w-3 h-3 rounded-full ${statusColor} mt-1 flex-shrink-0 -ml-[19px]`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm">{entry.label}</p>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {entryTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {entry.note && (
                              <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {entryTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                              </span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                entry.actor_type === 'auto' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : entry.actor_type === 'admin'
                                    ? 'bg-purple-100 text-purple-700'
                                    : entry.actor_type === 'courier'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-slate-100 text-slate-700'
                              }`}>
                                {entry.actor_type === 'auto' ? '🤖 Otomatik' : 
                                 entry.actor_type === 'admin' ? `👤 ${entry.actor_name}` :
                                 entry.actor_type === 'courier' ? `🏍️ ${entry.actor_name}` :
                                 entry.actor_name || 'Sistem'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Henüz geçmiş kaydı yok</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
