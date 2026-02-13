import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Plus, Trash2, Filter, Users, Timer, Map, History, ClipboardX, ListChecks
} from "lucide-react";
import GecmisSiparislerPage from "./GecmisSiparislerPage";
import IptalSiparislerPage from "./IptalSiparislerPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sipariş durumları
const ORDER_STATUSES = {
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-300/50", textColor: "text-yellow-700", bgLight: "bg-yellow-50" },
  ready: { label: "Hazır", color: "bg-orange-300/50", textColor: "text-orange-700", bgLight: "bg-orange-50" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-300/50", textColor: "text-purple-700", bgLight: "bg-purple-50" },
  confirmed: { label: "Onaylandı", color: "bg-blue-300/50", textColor: "text-blue-700", bgLight: "bg-blue-50" },
  on_the_way: { label: "Yolda", color: "bg-cyan-300/50", textColor: "text-cyan-700", bgLight: "bg-cyan-50" },
  delivered: { label: "Teslim Edildi", color: "bg-green-300/50", textColor: "text-green-700", bgLight: "bg-green-50" },
  cancelled: { label: "İptal Edildi", color: "bg-red-300/50", textColor: "text-red-700", bgLight: "bg-red-50" }
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

// Uzaklık hesaplama (Haversine formülü) - km cinsinden
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

// Kuryenin kalan mola süresini hesapla
const getRemainingBreakTime = (courier) => {
  const dailyLimit = courier.daily_break_limit || 30; // Varsayılan 30 dk
  let usedTime = courier.used_break_time || 0;
  
  // Şu an moladaysa, geçen süreyi de ekle
  if (courier.availability_status === 'on_break' && courier.break_start_time) {
    const startTime = new Date(courier.break_start_time);
    const now = new Date();
    const currentBreakMinutes = Math.floor((now - startTime) / 60000);
    usedTime += currentBreakMinutes;
  }
  
  const remaining = Math.max(0, dailyLimit - usedTime);
  return { remaining, dailyLimit, usedTime };
};

// Sipariş uzaklığını formatla
const getOrderDistance = (order) => {
  const restLat = order.restaurant_location?.latitude;
  const restLng = order.restaurant_location?.longitude;
  const delLat = order.delivery_location?.latitude;
  const delLng = order.delivery_location?.longitude;
  
  const distance = calculateDistance(restLat, restLng, delLat, delLng);
  
  if (distance === null) return null;
  
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
};

// Kuryeleri restorana yakınlığa ve paket sayısına göre sırala
const sortCouriersByDistanceAndLoad = (couriers, restaurantLocation, orders) => {
  // Her kurye için atanmış ve yolda paket sayısını hesapla
  const courierOrderCounts = {};
  orders.forEach(order => {
    if (order.courier_id) {
      if (!courierOrderCounts[order.courier_id]) {
        courierOrderCounts[order.courier_id] = { assigned: 0, onTheWay: 0 };
      }
      if (order.status === 'assigned' || order.status === 'confirmed') {
        courierOrderCounts[order.courier_id].assigned++;
      } else if (order.status === 'on_the_way') {
        courierOrderCounts[order.courier_id].onTheWay++;
      }
    }
  });
  
  return [...couriers].map(courier => {
    const distance = calculateDistance(
      restaurantLocation?.latitude,
      restaurantLocation?.longitude,
      courier.current_location?.latitude,
      courier.current_location?.longitude
    );
    const orderCounts = courierOrderCounts[courier.id] || { assigned: 0, onTheWay: 0 };
    const totalPackages = orderCounts.assigned + orderCounts.onTheWay;
    
    return { 
      ...courier, 
      distanceToRestaurant: distance,
      assignedCount: orderCounts.assigned,
      onTheWayCount: orderCounts.onTheWay,
      totalPackages
    };
  }).sort((a, b) => {
    // Önce paketsiz kuryeler
    if (a.totalPackages === 0 && b.totalPackages > 0) return -1;
    if (a.totalPackages > 0 && b.totalPackages === 0) return 1;
    
    // Paket sayısı aynıysa mesafeye göre sırala
    if (a.distanceToRestaurant === null) return 1;
    if (b.distanceToRestaurant === null) return -1;
    return a.distanceToRestaurant - b.distanceToRestaurant;
  });
};

// Mesafeyi formatla
const formatCourierDistance = (distance) => {
  if (distance === null || distance === undefined) return null;
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(1)} km`;
};

// Sipariş süresi hesapla (dakika cinsinden)
const getOrderAge = (order) => {
  if (!order.created_at) return null;
  
  try {
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return { text: "Yeni", mins: 0 };
    return { text: `${diffMins} dk`, mins: diffMins };
  } catch {
    return null;
  }
};


// Son konum bilgisi zamanını hesapla
const getLocationTimeAgo = (updatedAt) => {
  if (!updatedAt) return null;
  
  const now = new Date();
  const updateTime = new Date(updatedAt);
  const diffMs = now - updateTime;
  
  if (diffMs < 0) return "Şimdi";
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffSeconds < 30) return "Şimdi";
  if (diffSeconds < 60) return `${diffSeconds} sn önce`;
  if (diffMinutes < 60) return `${diffMinutes} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  
  return updateTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Sipariş notlarını parse et (CUSTOMER:, KITCHEN: gibi prefixleri temizle)
const parseOrderNotes = (notes) => {
  if (!notes) return null;
  
  const result = { customer: null, kitchen: null, other: null };
  
  // CUSTOMER: ve KITCHEN: formatını parse et
  const parts = notes.split('|');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('CUSTOMER:')) {
      result.customer = trimmed.replace('CUSTOMER:', '').trim();
    } else if (trimmed.startsWith('KITCHEN:')) {
      result.kitchen = trimmed.replace('KITCHEN:', '').trim();
    } else if (trimmed) {
      result.other = result.other ? `${result.other}, ${trimmed}` : trimmed;
    }
  });
  
  return result;
};

export default function SiparisYonetimiPage({ companyId, adminName, isSuperAdmin = false }) {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [couriersByStatus, setCouriersByStatus] = useState({ active: [], on_break: [], offline: [] });
  const [restaurants, setRestaurants] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [mainTab, setMainTab] = useState("active"); // active, delivered, cancelled
  const [, setTick] = useState(0); // Geri sayım için re-render
  
  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [showCourierDetailModal, setShowCourierDetailModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [orderDetailTab, setOrderDetailTab] = useState("details");
  
  // Map ref
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const courierMapRef = useRef(null);
  const courierMapInstanceRef = useRef(null);
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
      // Her kurye objesine availability_status ekle
      const activeList = (res.data.active || []).map(c => ({...c, availability_status: 'active'}));
      const onBreakList = (res.data.on_break || []).map(c => ({...c, availability_status: 'on_break'}));
      const offlineList = (res.data.offline || []).map(c => ({...c, availability_status: 'offline'}));
      
      setCouriersByStatus({
        active: activeList,
        on_break: onBreakList,
        offline: offlineList
      });
      // Tüm kuryeler (eski uyumluluk için)
      const allCouriers = [...activeList, ...onBreakList, ...offlineList];
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
    // Her 5 saniyede bir siparişleri ve kuryeleri güncelle (anlık takip için)
    const orderInterval = setInterval(fetchOrders, 5000);
    const courierInterval = setInterval(fetchCouriers, 5000);
    
    // Sayfa görünür olduğunda hemen güncelle
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchOrders();
        fetchCouriers();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(orderInterval);
      clearInterval(courierInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchAll, fetchOrders, fetchCouriers]);

  // Dağıtımda olan kuryeleri hesapla (yolda siparişi olanlar)
  const couriersOnDelivery = useMemo(() => {
    // Yolda siparişleri olan kurye ID'lerini bul
    const onTheWayCourierIds = new Set(
      orders
        .filter(o => o.status === 'on_the_way' && o.courier_id)
        .map(o => o.courier_id)
    );
    
    // Tüm kuryeler içinden yolda olanları filtrele
    const allCouriers = [
      ...couriersByStatus.active,
      ...couriersByStatus.on_break,
      ...couriersByStatus.offline
    ];
    
    return allCouriers.filter(c => onTheWayCourierIds.has(c.id));
  }, [orders, couriersByStatus]);

  // Dağıtımda olmayan kuryeleri hesapla (aktif listeden çıkar)
  const couriersNotOnDelivery = useMemo(() => {
    const onDeliveryIds = new Set(couriersOnDelivery.map(c => c.id));
    return {
      active: couriersByStatus.active.filter(c => !onDeliveryIds.has(c.id)),
      on_break: couriersByStatus.on_break.filter(c => !onDeliveryIds.has(c.id)),
      offline: couriersByStatus.offline.filter(c => !onDeliveryIds.has(c.id))
    };
  }, [couriersByStatus, couriersOnDelivery]);

  // Her kurye için paket sayılarını hesapla
  const courierPackageCounts = useMemo(() => {
    const counts = {};
    orders.forEach(order => {
      if (order.courier_id && !['delivered', 'cancelled'].includes(order.status)) {
        if (!counts[order.courier_id]) {
          counts[order.courier_id] = { assigned: 0, confirmed: 0, onTheWay: 0 };
        }
        if (order.status === 'on_the_way') {
          counts[order.courier_id].onTheWay++;
        } else if (order.status === 'assigned') {
          counts[order.courier_id].assigned++;
        } else if (['confirmed', 'preparing'].includes(order.status)) {
          counts[order.courier_id].confirmed++;
        }
      }
    });
    return counts;
  }, [orders]);

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
      
      // Teslimat noktası marker (mavi - kurye modalıyla aynı stil)
      const deliveryIcon = L.divIcon({
        className: 'order-marker',
        html: `<div style="background: #3b82f6; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [15, 15],
        iconAnchor: [7.5, 7.5]
      });
      
      L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon })
        .addTo(map)
        .bindPopup(`<b>Teslimat Adresi</b><br>${selectedOrder.delivery_address}`);
      
      // Restoran marker (gri, küçük, yuvarlak)
      if (restaurantLat && restaurantLng) {
        L.marker([restaurantLat, restaurantLng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:10px;height:10px;background:#9ca3af;border-radius:50% !important;-webkit-border-radius:50% !important;border:1px solid #6b7280;box-sizing:border-box;"></div>`,
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

  // Store orders in ref to avoid re-render issues
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Kurye detay modalı haritası - only triggered on modal open/courier change
  useEffect(() => {
    if (!showCourierDetailModal || !selectedCourier) return;
    
    // Leaflet yüklü değilse bekle
    if (!window.L) return;
    
    // Kurye baş harflerini al
    const getCourierInitials = (name) => {
      if (!name) return "?";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
      }
      const firstInitial = parts[0][0].toUpperCase();
      const lastInitial = parts[parts.length - 1][0].toUpperCase();
      return firstInitial + lastInitial;
    };
    
    const initCourierMap = () => {
      if (!courierMapRef.current) {
        // DOM henüz hazır değil, tekrar dene
        setTimeout(initCourierMap, 100);
        return;
      }
      
      // Mevcut haritayı temizle
      if (courierMapInstanceRef.current) {
        courierMapInstanceRef.current.remove();
        courierMapInstanceRef.current = null;
      }
      
      const L = window.L;
      const centerLat = company?.city_lat || 39.0;
      const centerLng = company?.city_lng || 35.0;
      
      const map = L.map(courierMapRef.current, {
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([centerLat, centerLng], 12);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
      
      const allPoints = [];
      
      // Kurye siparişlerini haritada göster (küçük ikonlar)
      const currentOrders = ordersRef.current;
      const courierOrders = currentOrders.filter(o => o.courier_id === selectedCourier.id && o.status !== 'delivered' && o.status !== 'cancelled');
      
      courierOrders.forEach((order, idx) => {
        if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
          const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
          const colorMap = {
            'bg-yellow-500': '#eab308',
            'bg-orange-500': '#f97316',
            'bg-purple-500': '#a855f7',
            'bg-blue-500': '#3b82f6',
            'bg-cyan-500': '#06b6d4',
            'bg-green-500': '#22c55e',
            'bg-red-500': '#ef4444'
          };
          const hexColor = colorMap[statusInfo.color] || '#3b82f6';
          
          // Küçük sipariş ikonu (kurye ikonu boyutunda)
          L.marker([order.delivery_location.latitude, order.delivery_location.longitude], {
            icon: L.divIcon({
              className: 'order-marker',
              html: `<div style="background: ${hexColor}; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 7px; font-weight: bold;">${idx + 1}</div>`,
              iconSize: [15, 15],
              iconAnchor: [7.5, 7.5]
            })
          }).addTo(map)
            .bindPopup(`<strong>${order.order_number}</strong><br/>${order.restaurant_name}<br/>${order.delivery_address}`);
          
          allPoints.push([order.delivery_location.latitude, order.delivery_location.longitude]);
        }
      });
      
      // Kuryenin kendi konumunu göster (animasyonlu ikon)
      if (selectedCourier.current_location?.latitude && selectedCourier.current_location?.longitude) {
        const isOnBreak = selectedCourier.availability_status === 'on_break';
        const bgColor = isOnBreak ? '#eab308' : '#22c55e';
        const initials = getCourierInitials(selectedCourier.name);
        
        L.marker([selectedCourier.current_location.latitude, selectedCourier.current_location.longitude], {
          icon: L.divIcon({
            className: 'courier-marker',
            html: `
              <div style="position: relative; width: 16px; height: 16px; border-radius: 50% !important; background: transparent !important;">
                <div class="courier-pulse-ring" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                <div class="courier-pulse-ring-delayed" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                <div style="
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                  background: ${bgColor};
                  width: 15px;
                  height: 15px;
                  border-radius: 50% !important;
                  -webkit-border-radius: 50% !important;
                  border: 2px solid white;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 6px;
                  font-weight: 700;
                ">${initials}</div>
              </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(map)
          .bindPopup(`<strong>🛵 ${selectedCourier.name}</strong><br/>${isOnBreak ? 'Molada' : 'Aktif'}`);
        
        allPoints.push([selectedCourier.current_location.latitude, selectedCourier.current_location.longitude]);
      }
      
      // Tüm noktalara odaklan (kurye + siparişler)
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
      
      courierMapInstanceRef.current = map;
      
      // Harita boyutunu düzelt
      setTimeout(() => map.invalidateSize(), 200);
    };
    
    // Biraz bekleyip başlat
    const timer = setTimeout(initCourierMap, 150);
    
    return () => {
      clearTimeout(timer);
      if (courierMapInstanceRef.current) {
        courierMapInstanceRef.current.remove();
        courierMapInstanceRef.current = null;
      }
    };
  }, [showCourierDetailModal, selectedCourier?.id, company?.city_lat, company?.city_lng]);

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
    const zoomLevel = company?.city_lat ? 13 : 6;
    
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

  // mainTab değiştiğinde haritayı yeniden boyutlandır
  useEffect(() => {
    if (mainTab === "active" && mapInstanceRef.current) {
      // Container'ın görünür olmasını bekle
      const mapContainer = mapRef.current;
      if (!mapContainer) return;
      
      const invalidateMap = () => {
        if (mapInstanceRef.current) {
          // Force reflow
          mapContainer.style.display = 'none';
          mapContainer.offsetHeight; // Force reflow
          mapContainer.style.display = '';
          
          mapInstanceRef.current.invalidateSize({ animate: false, pan: false });
        }
      };
      
      // requestAnimationFrame kullanarak render döngüsüne uygun zamanda çalıştır
      requestAnimationFrame(() => {
        invalidateMap();
        
        // Ek güvenlik için birkaç kez daha çağır
        setTimeout(invalidateMap, 100);
        setTimeout(invalidateMap, 300);
        setTimeout(invalidateMap, 600);
        
        // Şirket konumuna tekrar ortala
        if (company?.city_lat && company?.city_lng) {
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView([company.city_lat, company.city_lng], 13);
              mapInstanceRef.current.invalidateSize({ animate: false, pan: false });
            }
          }, 400);
        }
      });
    }
  }, [mainTab, company]);

  // Şirket verisi yüklenince haritayı şirketin iline ortala
  useEffect(() => {
    if (!company?.city_lat || !company?.city_lng) return;
    
    // Harita hazır olana kadar bekle
    const centerMap = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([company.city_lat, company.city_lng], 13);
        mapInstanceRef.current.invalidateSize();
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
  }, [orders, restaurants, couriers, couriersByStatus]);

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
              className: '',
              html: `<div style="width:12px;height:12px;background:#9ca3af;border-radius:50% !important;-webkit-border-radius:50% !important;border:1px solid #6b7280;box-sizing:border-box;"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })
          }).addTo(map);
          marker.bindPopup(`<strong>${r.name}</strong>`);
          markersRef.current.push(marker);
        } catch (e) {
          console.error("Restaurant marker error:", e);
        }
      }
    });

    // Sipariş marker'ları kaldırıldı - kurye modalında zaten gösteriliyor

    // Courier locations (active and on_break only) - with pulse animation
    const visibleCouriers = [
      ...(couriersByStatus.active || []),
      ...(couriersByStatus.on_break || [])
    ];
    
    // Helper function to get courier initials
    const getCourierInitials = (name) => {
      if (!name) return "?";
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
      }
      // İlk isim + son isim baş harfleri
      const firstInitial = parts[0][0].toUpperCase();
      const lastInitial = parts[parts.length - 1][0].toUpperCase();
      return firstInitial + lastInitial;
    };
    
    // Helper function to get courier color based on order status
    const getCourierColorByOrderStatus = (courier) => {
      // Kuryenin aktif siparişlerini bul
      const courierOrders = orders.filter(o => 
        o.courier_id === courier.id && 
        o.status !== 'delivered' && 
        o.status !== 'cancelled'
      );
      
      // Molada ise sarı
      if (courier.availability_status === 'on_break') {
        return { color: '#eab308', label: 'Molada' }; // Sarı
      }
      
      // Sipariş yoksa - Boş (Yeşil)
      if (courierOrders.length === 0) {
        return { color: '#22c55e', label: 'Boş' }; // Yeşil
      }
      
      // Sipariş durumlarına göre öncelik sırası
      const hasOnTheWay = courierOrders.some(o => o.status === 'on_the_way');
      const hasConfirmed = courierOrders.some(o => o.status === 'confirmed');
      const hasAssigned = courierOrders.some(o => o.status === 'assigned');
      
      if (hasOnTheWay) {
        return { color: '#06b6d4', label: 'Yolda' }; // Turkuaz
      }
      if (hasConfirmed) {
        return { color: '#1e3a8a', label: 'Onaylandı' }; // Lacivert
      }
      if (hasAssigned) {
        return { color: '#a855f7', label: 'Onay Bekliyor' }; // Mor
      }
      
      // Default - Aktif (Yeşil)
      return { color: '#22c55e', label: 'Aktif' };
    };
    
    visibleCouriers.forEach(courier => {
      if (courier.current_location?.latitude && courier.current_location?.longitude) {
        try {
          const { color: bgColor, label: statusLabel } = getCourierColorByOrderStatus(courier);
          const initials = getCourierInitials(courier.name);
          
          // Kuryenin aktif sipariş sayısı
          const orderCount = orders.filter(o => 
            o.courier_id === courier.id && 
            o.status !== 'delivered' && 
            o.status !== 'cancelled'
          ).length;
          
          const marker = L.marker([courier.current_location.latitude, courier.current_location.longitude], {
            icon: L.divIcon({
              className: 'courier-marker',
              html: `
                <div style="position: relative; width: 22px; height: 22px; border-radius: 50% !important; background: transparent !important;">
                  <div class="courier-pulse-ring" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                  <div class="courier-pulse-ring-delayed" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                  <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: ${bgColor};
                    width: 20px;
                    height: 20px;
                    border-radius: 50% !important;
                    -webkit-border-radius: 50% !important;
                    -moz-border-radius: 50% !important;
                    border: 2px solid white;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 8px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                  ">${initials}</div>
                </div>
              `,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            })
          }).addTo(map);
          // Popup kaldırıldı - tıklayınca modal açılıyor
          marker.on('click', () => {
            setSelectedCourier(courier);
            setShowCourierDetailModal(true);
          });
          markersRef.current.push(marker);
        } catch (e) {
          console.error("Courier marker error:", e);
        }
      }
    });
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

  // Update courier availability status
  const handleUpdateCourierStatus = async (courierId, newStatus) => {
    try {
      await axios.put(`${API}/couriers/${courierId}/availability`, {
        availability_status: newStatus,
        force: true  // Admin limit kontrolünü bypass eder
      });
      // Kurye listesini yenile
      fetchCouriers();
      // Modal'daki kurye bilgisini güncelle
      if (selectedCourier && selectedCourier.id === courierId) {
        setSelectedCourier({...selectedCourier, availability_status: newStatus});
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye durumu güncellenemedi");
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
      fetchOrders();
    } catch (err) {
      toast.error("Kurye atanamadı");
    }
  };

  // Kurye detay modalını aç
  // Haritayı kuryeye odakla (hover veya tıklama ile)
  const focusMapOnCourier = useCallback((courier) => {
    if (!mapInstanceRef.current || !courier.current_location?.latitude || !courier.current_location?.longitude) {
      return;
    }
    
    const map = mapInstanceRef.current;
    map.setView(
      [courier.current_location.latitude, courier.current_location.longitude],
      14, // Yakınlaştırma seviyesi (2 tık azaltıldı)
      { animate: true, duration: 0.5 }
    );
  }, []);

  const handleCourierClick = (courier) => {
    // Çevrimdışı kuryeler için haritada zoom yapma
    if (courier.availability_status !== 'offline') {
      focusMapOnCourier(courier);
    }
    // Modal her durumda açılsın
    setSelectedCourier(courier);
    setShowCourierDetailModal(true);
  };

  // Hover ile sadece haritayı odakla (modal açma)
  // Sadece aktif ve molada kuryeler için çalışır
  const handleCourierHover = useCallback((courier) => {
    // Çevrimdışı kuryeler için zoom yapma
    if (courier.availability_status === 'offline') {
      return;
    }
    focusMapOnCourier(courier);
  }, [focusMapOnCourier]);

  // Seçilen kuryenin aktif siparişleri
  const selectedCourierOrders = selectedCourier 
    ? orders.filter(o => o.courier_id === selectedCourier.id && o.status !== 'delivered' && o.status !== 'cancelled')
    : [];

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
      {/* Header with tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-heading text-xl font-bold tracking-tight">Sipariş Yönetimi</h2>
          {/* Sub Tabs */}
          <div className="flex border-2 rounded-lg overflow-hidden">
            <button
              onClick={() => setMainTab("active")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                mainTab === "active" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-background hover:bg-muted"
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Aktif
            </button>
            <button
              onClick={() => setMainTab("delivered")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors border-l flex items-center justify-center gap-1.5 ${
                mainTab === "delivered" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-background hover:bg-muted"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Geçmiş
            </button>
            <button
              onClick={() => setMainTab("cancelled")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors border-l flex items-center justify-center gap-1.5 ${
                mainTab === "cancelled" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-background hover:bg-muted"
              }`}
            >
              <ClipboardX className="w-3.5 h-3.5" />
              İptal
            </button>
          </div>
        </div>
        {mainTab === "active" && (
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
        )}
      </div>

      {/* Render sub-pages based on tab */}
      {mainTab === "delivered" && (
        <GecmisSiparislerPage 
          key="gecmis" 
          companyId={companyId} 
          onOrderSelect={(order) => {
            setSelectedOrder(order);
            setShowOrderDetailModal(true);
          }}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      {mainTab === "cancelled" && (
        <IptalSiparislerPage 
          key="iptal" 
          companyId={companyId}
          onOrderSelect={(order) => {
            setSelectedOrder(order);
            setShowOrderDetailModal(true);
          }}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      
      {/* Active tab content - always in DOM but hidden when not active */}
      <div style={{ display: mainTab === "active" ? "block" : "none" }}>
      {/* Inline Stats - only for active tab */}
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 px-2 py-1 bg-slate-50/70 rounded-full">
          <Package className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-semibold text-slate-600">{stats.total}</span>
        </span>
        {stats.unassigned > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-orange-50/70 rounded-full text-orange-600">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="font-semibold">{stats.unassigned}</span>
            <span className="text-xs">bekliyor</span>
          </span>
        )}
        {stats.onTheWay > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-cyan-50/70 rounded-full text-cyan-600">
            <Bike className="w-3.5 h-3.5" />
            <span className="font-semibold">{stats.onTheWay}</span>
            <span className="text-xs">yolda</span>
          </span>
        )}
        {stats.delivered > 0 && (
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-50/70 rounded-full text-green-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-semibold">{stats.delivered}</span>
          </span>
        )}
      </div>

      {/* Mobile Courier Status List */}
      <Card className="lg:hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Kuryeler
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-2">
          {/* Aktif Kuryeler */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 bg-green-50 rounded text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Aktif ({couriersNotOnDelivery.active.length})
              </div>
              <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              {couriersNotOnDelivery.active.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">-</p>
              ) : (
                couriersNotOnDelivery.active.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-green-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                      onMouseEnter={() => handleCourierHover(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Bike className="w-3 h-3 text-green-600" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {counts.assigned > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                        )}
                        {counts.confirmed > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </CollapsibleContent>
          </Collapsible>
          
          {/* Dağıtımda Kuryeler */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 bg-cyan-50 rounded text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                Dağıtımda ({couriersOnDelivery.length})
              </div>
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              {couriersOnDelivery.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">-</p>
              ) : (
                couriersOnDelivery.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-cyan-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                    onMouseEnter={() => handleCourierHover(c)}
                  >
                    <div className="flex items-center gap-2">
                      <Bike className="w-3 h-3 text-cyan-600" />
                      <span className="truncate">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {counts.assigned > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                      )}
                      {counts.confirmed > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                      )}
                      {counts.onTheWay > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">{counts.onTheWay}</span>
                      )}
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                  );
                })
              )}
            </CollapsibleContent>
          </Collapsible>
          
          {/* Moladaki Kuryeler */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 bg-yellow-50 rounded text-xs font-semibold text-yellow-700 hover:bg-yellow-100 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Molada ({couriersNotOnDelivery.on_break.length})
              </div>
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              {couriersNotOnDelivery.on_break.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">-</p>
              ) : (
                couriersNotOnDelivery.on_break.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  const breakInfo = getRemainingBreakTime(c);
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-yellow-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                      onMouseEnter={() => handleCourierHover(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Bike className="w-3 h-3 text-yellow-600" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">{breakInfo.remaining}dk</span>
                        {counts.assigned > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                        )}
                        {counts.confirmed > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </CollapsibleContent>
          </Collapsible>
          
          {/* Çevrimdışı Kuryeler */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 bg-slate-100 rounded text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                Çevrimdışı ({couriersNotOnDelivery.offline.length})
              </div>
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              {couriersNotOnDelivery.offline.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-1">-</p>
              ) : (
                couriersNotOnDelivery.offline.map(c => (
                  <div 
                    key={c.id} 
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 rounded cursor-pointer text-muted-foreground"
                    onClick={() => handleCourierClick(c)}
                    onMouseEnter={() => handleCourierHover(c)}
                  >
                    <div className="flex items-center gap-2">
                      <Bike className="w-3 h-3" />
                      <span className="truncate">{c.name}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
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
                Aktif ({couriersNotOnDelivery.active.length})
              </div>
              {couriersNotOnDelivery.active.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersNotOnDelivery.active.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-green-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                      onMouseEnter={() => handleCourierHover(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Bike className="w-3 h-3 text-green-600" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {counts.assigned > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                        )}
                        {counts.confirmed > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Dağıtımda Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-cyan-50 rounded text-xs font-semibold text-cyan-700 mb-1">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                Dağıtımda ({couriersOnDelivery.length})
              </div>
              {couriersOnDelivery.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersOnDelivery.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-cyan-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                      onMouseEnter={() => handleCourierHover(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Bike className="w-3 h-3 text-cyan-600" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {counts.assigned > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                        )}
                        {counts.confirmed > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                        )}
                        {counts.onTheWay > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">{counts.onTheWay}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Moladaki Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-yellow-50 rounded text-xs font-semibold text-yellow-700 mb-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                Molada ({couriersNotOnDelivery.on_break.length})
              </div>
              {couriersNotOnDelivery.on_break.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersNotOnDelivery.on_break.map(c => {
                  const counts = courierPackageCounts[c.id] || { assigned: 0, confirmed: 0, onTheWay: 0 };
                  const breakInfo = getRemainingBreakTime(c);
                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-yellow-50 rounded cursor-pointer"
                      onClick={() => handleCourierClick(c)}
                      onMouseEnter={() => handleCourierHover(c)}
                    >
                      <div className="flex items-center gap-2">
                        <Bike className="w-3 h-3 text-yellow-600" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">{breakInfo.remaining}dk</span>
                        {counts.assigned > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{counts.assigned}</span>
                        )}
                        {counts.confirmed > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{counts.confirmed}</span>
                        )}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Çevrimdışı Kuryeler */}
            <div>
              <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-600 mb-1">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                Çevrimdışı ({couriersNotOnDelivery.offline.length})
              </div>
              {couriersNotOnDelivery.offline.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2">-</p>
              ) : (
                couriersNotOnDelivery.offline.map(c => (
                  <div 
                    key={c.id} 
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 rounded cursor-pointer text-muted-foreground"
                    onClick={() => handleCourierClick(c)}
                    onMouseEnter={() => handleCourierHover(c)}
                  >
                    <div className="flex items-center gap-2">
                      <Bike className="w-3 h-3" />
                      <span className="truncate">{c.name}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
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
            <div className="space-y-2">
              {orders.map((order) => {
                const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                const targetDelivery = getTargetDelivery(order.created_at);
                
                return (
                  <div 
                    key={order.id}
                    className={`p-3 rounded-lg border bg-white cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={(e) => {
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
                    {/* Üst: Saat + Süre + Restoran + Fiyat/Ödeme */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-xs text-muted-foreground">
                          <span>{formatTime(order.created_at)}</span>
                          {!['delivered', 'cancelled'].includes(order.status) && getOrderAge(order) && (
                            <span className={`font-medium ${
                              getOrderAge(order).mins > 35 ? 'text-red-600' : 'text-slate-600'
                            }`}>
                              {getOrderAge(order).text}
                            </span>
                          )}
                        </div>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-sm font-medium rounded border border-slate-200">
                          {order.restaurant_name}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-semibold text-sm">{formatCurrency(order.total_amount)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          order.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 
                          order.payment_method === 'online' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {order.payment_method === 'cash' ? 'Nakit' : order.payment_method === 'online' ? 'Online' : 'Kart'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Orta: Müşteri + Adres + Mesafe */}
                    <div className="mb-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{order.customer_name}</span>
                        {getOrderDistance(order) && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                            {getOrderDistance(order)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">{order.delivery_address}</p>
                    </div>
                    
                    {/* Alt: Durum + Kurye yan yana */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t">
                      {/* Durum Badge - Tıklanabilir */}
                      <Select 
                        value={order.status} 
                        onValueChange={(newValue) => {
                          if (newValue.startsWith('preparing_')) {
                            handleUpdateStatus(order.id, 'preparing', parseInt(newValue.split('_')[1]));
                          } else {
                            handleUpdateStatus(order.id, newValue);
                          }
                        }}
                      >
                        <SelectTrigger className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-0.5 h-7 border border-slate-300/50 min-w-[90px] shadow-sm justify-center text-center`}>
                          <SelectValue>
                            {order.status === 'preparing' && order.preparation_end_at
                              ? getCountdown(order.preparation_end_at)?.text
                              : statusInfo.label}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">Hazırlanıyor</div>
                          {PREPARATION_TIMES.map(time => (
                            <SelectItem key={`prep_${time.value}`} value={`preparing_${time.value}`} className="text-xs">
                              {time.label}
                            </SelectItem>
                          ))}
                          <div className="border-t my-1" />
                          {Object.entries(ORDER_STATUSES)
                            .filter(([key]) => !COURIER_ONLY_STATUSES.includes(key) && key !== 'preparing')
                            .map(([key, value]) => (
                            <SelectItem key={key} value={key} className="text-xs">{value.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Kurye */}
                      <Select 
                        value={order.courier_id || ""}
                        onValueChange={(value) => {
                          if (value === "__remove__") handleUnassignCourier(order.id);
                          else if (value) handleReassignCourier(order.id, value);
                        }}
                      >
                        <SelectTrigger 
                          className={`h-7 px-2 text-xs min-w-[100px] ${
                            order.courier_name 
                              ? "bg-green-200/40 border border-slate-300/50 text-slate-700 font-medium shadow-sm" 
                              : "bg-slate-50 border border-slate-200"
                          }`}
                        >
                          <Bike className="w-3 h-3 mr-1" />
                          <span className={order.courier_name ? "font-semibold" : ""}>{order.courier_name || "Kurye Ata"}</span>
                        </SelectTrigger>
                        <SelectContent className="min-w-[280px]">
                          {(() => {
                            const sortedActive = sortCouriersByDistanceAndLoad(couriersByStatus.active, order.restaurant_location, orders);
                            const sortedOnBreak = sortCouriersByDistanceAndLoad(couriersByStatus.on_break, order.restaurant_location, orders);
                            const sortedOffline = sortCouriersByDistanceAndLoad(couriersByStatus.offline, order.restaurant_location, orders);
                            
                            const renderCourierItem = (c) => (
                              <SelectItem key={c.id} value={c.id} className="text-slate-900 hover:!bg-orange-500 hover:!text-white focus:!bg-orange-500 focus:!text-white pr-10">
                                <div className="flex items-center justify-between w-full gap-2">
                                  <span className="font-medium">{c.name}</span>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {formatCourierDistance(c.distanceToRestaurant) && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">{formatCourierDistance(c.distanceToRestaurant)}</span>
                                    )}
                                    {c.assignedCount > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">{c.assignedCount} Atanmış</span>
                                    )}
                                    {c.onTheWayCount > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded font-medium">{c.onTheWayCount} Yolda</span>
                                    )}
                                  </div>
                                </div>
                              </SelectItem>
                            );
                            
                            return (
                              <>
                                {sortedActive.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">Aktif</div>
                                    {sortedActive.map(renderCourierItem)}
                                  </>
                                )}
                                {sortedOnBreak.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">Molada</div>
                                    {sortedOnBreak.map(renderCourierItem)}
                                  </>
                                )}
                                {sortedOffline.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1">Çevrimdışı</div>
                                    {sortedOffline.map(renderCourierItem)}
                                  </>
                                )}
                              </>
                            );
                          })()}
                          {order.courier_id && order.status !== 'on_the_way' && order.status !== 'delivered' && (
                            <>
                              <div className="border-t my-1" />
                              <SelectItem value="__remove__" className="text-red-600">Kaldır</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
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
              <SelectContent className="min-w-[350px]">
                {(() => {
                  const sortedActive = sortCouriersByDistanceAndLoad(couriersByStatus.active, selectedOrder?.restaurant_location, orders);
                  const sortedOnBreak = sortCouriersByDistanceAndLoad(couriersByStatus.on_break, selectedOrder?.restaurant_location, orders);
                  const sortedOffline = sortCouriersByDistanceAndLoad(couriersByStatus.offline, selectedOrder?.restaurant_location, orders);
                  
                  const renderCourierItem = (courier, statusColor) => (
                    <SelectItem key={courier.id} value={courier.id} className="text-slate-900 hover:!bg-orange-500 hover:!text-white focus:!bg-orange-500 focus:!text-white pr-10">
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                          <span className="font-medium">{courier.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {formatCourierDistance(courier.distanceToRestaurant) && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">{formatCourierDistance(courier.distanceToRestaurant)}</span>
                          )}
                          {courier.assignedCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">{courier.assignedCount} Atanmış</span>
                          )}
                          {courier.onTheWayCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded font-medium">{courier.onTheWayCount} Yolda</span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  );
                  
                  return (
                    <>
                      {/* Aktif Kuryeler */}
                      {sortedActive.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">
                            Aktif Kuryeler
                          </div>
                          {sortedActive.map(c => renderCourierItem(c, 'bg-green-500'))}
                        </>
                      )}
                      {/* Moladaki Kuryeler */}
                      {sortedOnBreak.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">
                            Molada
                          </div>
                          {sortedOnBreak.map(c => renderCourierItem(c, 'bg-yellow-500'))}
                        </>
                      )}
                      {/* Çevrimdışı Kuryeler */}
                      {sortedOffline.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1">
                            Çevrimdışı
                          </div>
                          {sortedOffline.map(c => renderCourierItem(c, 'bg-slate-400'))}
                        </>
                      )}
                    </>
                  );
                })()}
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
                  <MapPin className="w-3 h-3 text-orange-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{selectedOrder.delivery_address}</p>
                    {selectedOrder.notes && (() => {
                      const parsedNotes = parseOrderNotes(selectedOrder.notes);
                      return (
                        <div className="mt-2 space-y-1">
                          {parsedNotes.customer && (
                            <p className="text-sm text-blue-600">
                              <span className="font-medium">Müşteri Notu:</span> {parsedNotes.customer}
                            </p>
                          )}
                          {parsedNotes.kitchen && (
                            <p className="text-sm text-orange-600">
                              <span className="font-medium">Mutfak Notu:</span> {parsedNotes.kitchen}
                            </p>
                          )}
                          {parsedNotes.other && (
                            <p className="text-sm text-slate-600">
                              <span className="font-medium">Not:</span> {parsedNotes.other}
                            </p>
                          )}
                        </div>
                      );
                    })()}
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
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Ödeme Yöntemi</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      selectedOrder.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {selectedOrder.payment_method === 'cash' ? 'Nakit' : 'Kart'}
                    </span>
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
                  {/* Harita */}
                  <div 
                    ref={orderMapRef}
                    className="w-full h-[350px] rounded-lg border"
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
              
              {/* Super Admin için Durum Değiştirme */}
              {isSuperAdmin && (selectedOrder.status === 'delivered' || selectedOrder.status === 'cancelled') && (
                <div className="mt-4 pt-4 border-t">
                  <Label className="text-xs text-muted-foreground mb-2 block">Sipariş Durumunu Değiştir (Süper Admin)</Label>
                  <Select
                    value={selectedOrder.status}
                    onValueChange={async (newStatus) => {
                      try {
                        await axios.put(`${API}/orders/${companyId}/${selectedOrder.id}/status`, {
                          status: newStatus,
                          actor_type: 'admin',
                          actor_name: adminName
                        });
                        fetchOrders();
                        setShowOrderDetailModal(false);
                      } catch (err) {
                        console.error("Status update error:", err);
                        alert("Durum güncellenirken hata oluştu");
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Beklemede</SelectItem>
                      <SelectItem value="preparing">Hazırlanıyor</SelectItem>
                      <SelectItem value="ready">Hazır</SelectItem>
                      <SelectItem value="assigned">Atandı</SelectItem>
                      <SelectItem value="picked_up">Yolda</SelectItem>
                      <SelectItem value="delivered">Teslim Edildi</SelectItem>
                      <SelectItem value="cancelled">İptal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Courier Detail Modal */}
      <Dialog open={showCourierDetailModal} onOpenChange={setShowCourierDetailModal}>
        <DialogContent className="w-[92vw] max-w-[360px] sm:max-w-[500px] lg:max-w-[550px] p-3 sm:p-5 overflow-hidden">
          <DialogHeader className="pb-1 sm:pb-2 pr-8">
            <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
              <Bike className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="truncate flex-1">{selectedCourier?.name}</span>
            </DialogTitle>
            <div className="mt-2">
              <Select
                value={selectedCourier?.availability_status || 'offline'}
                onValueChange={(value) => handleUpdateCourierStatus(selectedCourier.id, value)}
              >
                <SelectTrigger className={`h-7 w-fit text-xs px-3 gap-1 ${
                  selectedCourier?.availability_status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                  selectedCourier?.availability_status === 'on_break' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  <SelectValue>
                    {selectedCourier?.availability_status === 'active' ? 'Aktif' : 
                     selectedCourier?.availability_status === 'on_break' ? 'Molada' : 'Çevrimdışı'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-xs">Aktif</SelectItem>
                  <SelectItem value="on_break" className="text-xs">Molada</SelectItem>
                  <SelectItem value="offline" className="text-xs">Çevrimdışı</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogHeader>
          
          {selectedCourier && (
            <div className="space-y-2 sm:space-y-3 w-full overflow-hidden">
              {/* Harita */}
              <div className="rounded-lg overflow-hidden border w-full">
                <div ref={courierMapRef} className="h-[150px] sm:h-[200px] w-full bg-slate-100" />
              </div>
              
              {/* Son Konum */}
              <div className="flex items-center justify-between px-2 py-1.5 sm:py-2 bg-slate-50 rounded text-xs sm:text-sm">
                <span className="text-muted-foreground">Son Konum</span>
                <span className={`font-medium px-1.5 sm:px-2 py-0.5 rounded text-xs ${
                  selectedCourier.current_location?.updated_at 
                    ? (() => {
                        const timeAgo = getLocationTimeAgo(selectedCourier.current_location.updated_at);
                        if (timeAgo === "Şimdi" || timeAgo?.includes("sn")) return "bg-green-100 text-green-700";
                        if (timeAgo?.includes("dk") && parseInt(timeAgo) <= 5) return "bg-green-100 text-green-700";
                        return "bg-yellow-100 text-yellow-700";
                      })()
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {selectedCourier.current_location?.updated_at 
                    ? getLocationTimeAgo(selectedCourier.current_location.updated_at)
                    : "Yok"}
                </span>
              </div>
              
              {/* Sipariş Listesi */}
              <div className="w-full overflow-hidden">
                <div className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2 px-1">
                  Siparişler ({selectedCourierOrders.length})
                </div>
                <div className="space-y-1.5 sm:space-y-2 max-h-[180px] sm:max-h-[250px] overflow-y-auto overflow-x-hidden w-full">
                  {selectedCourierOrders.length === 0 ? (
                    <div className="text-center py-4 sm:py-6 text-muted-foreground text-xs sm:text-sm">
                      Aktif sipariş yok
                    </div>
                  ) : (
                    selectedCourierOrders.map((order, idx) => {
                      const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                      return (
                        <div 
                          key={order.id} 
                          className={`p-2 sm:p-3 rounded border ${statusInfo.bgLight} cursor-pointer hover:shadow-sm transition-shadow w-full overflow-hidden`}
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowCourierDetailModal(false);
                            setShowOrderDetailModal(true);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full ${statusInfo.color} text-white flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center justify-between">
                                <div className="text-xs sm:text-sm font-medium truncate">{order.restaurant_name}</div>
                                <div className="flex flex-col items-end text-[10px] sm:text-xs text-muted-foreground">
                                  <span>{formatTime(order.created_at)}</span>
                                  {getOrderAge(order) && (
                                    <span className={getOrderAge(order).mins > 35 ? 'text-red-600 font-medium' : ''}>
                                      {getOrderAge(order).text}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{order.customer_name}</div>
                              <div className="text-[10px] sm:text-xs text-slate-600 truncate">{order.delivery_address}</div>
                              <div className="flex items-center gap-2 text-[10px] sm:text-xs mt-1">
                                <span className="font-medium">{formatCurrency(order.total_amount)}</span>
                                <span className={`px-1 sm:px-1.5 py-0.5 rounded ${
                                  order.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {order.payment_method === 'cash' ? 'Nakit' : 'Kart'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
