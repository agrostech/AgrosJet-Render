import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  MapPin,
  Phone,
  Clock,
  CreditCard,
  Banknote,
  Eye,
  Truck,
  CheckCircle,
  Navigation,
  Store,
  User,
  FileText,
  RefreshCw,
  Route,
  ClipboardList,
  Bike,
  BellOff,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// Ortak utility fonksiyonları import et
import {
  formatTime,
  formatCurrency,
  calculateDistance,
  getOrderDistance,
  getOrderAge,
} from "@/utils/orderUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Tarih formatı (kurye paneline özel)
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

// Sipariş durumları (kurye paneline özel renkler)
const ORDER_STATUS_CONFIG = {
  assigned: { label: "Yeni Sipariş", color: "bg-purple-500", textColor: "text-purple-600" },
  confirmed: { label: "Onaylandı", color: "bg-blue-500", textColor: "text-blue-600" },
  on_the_way: { label: "Yolda", color: "bg-cyan-500", textColor: "text-cyan-600" },
  delivered: { label: "Teslim Edildi", color: "bg-green-500", textColor: "text-green-600" },
};

// Ödeme yöntemi (kurye paneline özel - icon ile)
const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: Banknote, color: "text-green-600", bg: "bg-green-50" },
  card: { label: "Kart", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
  meal_card: { label: "Yemek Kartı", icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
  online_meal_card: { label: "Online Y.K.", icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
  online: { label: "Online", icon: CreditCard, color: "text-purple-600", bg: "bg-purple-50" },
};

// Ödeme label'ını al
const getPaymentLabel = (order) => {
  const method = order.payment_method;
  if ((method === 'meal_card' || method === 'online_meal_card') && order.payment_method_detail) {
    return order.payment_method_detail;
  }
  return PAYMENT_METHODS[method]?.label || method;
};

// Sipariş yaşını formatla (kurye paneli için string döndürür)
const getOrderAgeText = (order) => {
  const age = getOrderAge(order);
  if (!age) return null;
  return age.text;
};

export default function CourierSiparisPage({ courierId, companyId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [showOnlineDeliveryConfirmModal, setShowOnlineDeliveryConfirmModal] = useState(false);
  const [pendingDeliveryOrder, setPendingDeliveryOrder] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "route"
  const [expandedPickups, setExpandedPickups] = useState(new Set());
  const [showNotReadyModal, setShowNotReadyModal] = useState(false);
  const [pendingNotReadyOrder, setPendingNotReadyOrder] = useState(null);
  const [permissions, setPermissions] = useState({ can_mark_not_ready: true });
  const [smartRouteData, setSmartRouteData] = useState([]); // Akıllı rota adımları
  const [smartRouteTotalDistance, setSmartRouteTotalDistance] = useState(0);
  const wakeLockRef = useRef(null);

  // Wake Lock API - ekranın kapanmasını önle ve arka plan işlemlerini sürdür
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('Wake Lock aktif - ekran açık kalacak');
        
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock serbest bırakıldı');
        });
      }
    } catch (err) {
      console.log('Wake Lock alınamadı:', err.message);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  // Native konum verisi için ref
  const lastLocationRef = useRef({ lat: 0, lng: 0, time: 0 });

  // Native konum mesajlarını dinle
  useEffect(() => {
    const handleLocationMessage = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'LOCATION_UPDATE' && msg?.data) {
          const { latitude, longitude } = msg.data;
          if (latitude && longitude) {
            lastLocationRef.current = { lat: latitude, lng: longitude, time: Date.now() };
          }
        }
      } catch (e) {}
    };
    const handleCustomEvent = (e) => handleLocationMessage({ data: e.detail });
    window.addEventListener('message', handleLocationMessage);
    window.addEventListener('nativeMessage', handleCustomEvent);
    return () => {
      window.removeEventListener('message', handleLocationMessage);
      window.removeEventListener('nativeMessage', handleCustomEvent);
    };
  }, []);


  // Rota aktifken yeni sipariş gelirse otomatik rotaya ekle
  useEffect(() => {
    if (smartRouteData.length === 0) return;
    const routeOrderIds = smartRouteData.flatMap(s => s.orderIds);
    const newOrders = orders.filter(o => 
      ["assigned", "confirmed", "on_the_way"].includes(o.status) && !routeOrderIds.includes(o.id)
    );
    if (newOrders.length > 0) {
      addToSmartRoute();
    }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps


  // Akıllı Rota Oluştur - tüm aktif siparişleri birleştir (atanmış + yolda)
  const createSmartRoute = useCallback(async () => {
    const assignedOrs = orders.filter(o => ["assigned", "confirmed"].includes(o.status));
    const onTheWayOrs = orders.filter(o => o.status === "on_the_way");
    const allActive = [...assignedOrs, ...onTheWayOrs];
    
    if (allActive.length < 2) {
      toast.error("Akıllı rota için en az 2 sipariş gerekli");
      return;
    }

    const validAssigned = assignedOrs.filter(
      o => o.delivery_location?.latitude && o.delivery_location?.longitude &&
           o.restaurant_location?.latitude && o.restaurant_location?.longitude
    );
    const validOnTheWay = onTheWayOrs.filter(
      o => o.delivery_location?.latitude && o.delivery_location?.longitude
    );

    if ((validAssigned.length + validOnTheWay.length) < 2) {
      toast.error("Yeterli konum bilgisi yok");
      return;
    }

    // Başlangıç noktası
    let startLat, startLng;
    if (lastLocationRef.current.lat && lastLocationRef.current.lng && 
        (Date.now() - lastLocationRef.current.time) < 300000) {
      startLat = lastLocationRef.current.lat;
      startLng = lastLocationRef.current.lng;
    } else {
      try {
        const res = await axios.get(`${API}/couriers/${courierId}`);
        const loc = res.data?.current_location;
        if (loc?.latitude && loc?.longitude) { startLat = loc.latitude; startLng = loc.longitude; }
      } catch (e) {}
    }
    if (!startLat || !startLng) {
      const first = validAssigned[0] || validOnTheWay[0];
      startLat = first.restaurant_location?.latitude || first.delivery_location.latitude;
      startLng = first.restaurant_location?.longitude || first.delivery_location.longitude;
    }

    // Durakları oluştur
    const stops = [];

    // Atanmış siparişleri restoran bazında grupla
    const restaurantGroups = {};
    validAssigned.forEach((order) => {
      const rId = order.restaurant_id;
      if (!restaurantGroups[rId]) {
        restaurantGroups[rId] = {
          restaurant_name: order.restaurant_name,
          restaurant_phone: order.restaurant_phone,
          lat: order.restaurant_location.latitude,
          lng: order.restaurant_location.longitude,
          orderIds: [],
          orderLabels: [],
        };
      }
      restaurantGroups[rId].orderIds.push(order.id);
      restaurantGroups[rId].orderLabels.push(order.customer_name || order.delivery_address);
    });

    const pickupGroupMap = {};
    Object.values(restaurantGroups).forEach((group, gIdx) => {
      group.orderIds.forEach(oId => { pickupGroupMap[oId] = gIdx; });
      stops.push({
        type: 'pickup',
        groupId: gIdx,
        orderIds: group.orderIds,
        label: group.restaurant_name,
        subLabels: group.orderLabels,
        phone: group.restaurant_phone,
        lat: group.lat,
        lng: group.lng,
      });
    });

    // Atanmış siparişler - delivery durakları
    validAssigned.forEach((order) => {
      stops.push({
        type: 'delivery',
        groupId: pickupGroupMap[order.id],
        orderIds: [order.id],
        label: order.customer_name || order.delivery_address,
        address: order.delivery_address,
        phone: order.customer_phone,
        lat: order.delivery_location.latitude,
        lng: order.delivery_location.longitude,
      });
    });

    // Yolda siparişler - sadece delivery (pickup zaten yapılmış)
    validOnTheWay.forEach((order) => {
      stops.push({
        type: 'delivery',
        groupId: -1,
        orderIds: [order.id],
        label: order.customer_name || order.delivery_address,
        address: order.delivery_address,
        phone: order.customer_phone,
        lat: order.delivery_location.latitude,
        lng: order.delivery_location.longitude,
      });
    });

    // Geçerlilik kontrolü
    const isValidRoute = (route) => {
      const pickedUpGroups = new Set();
      for (const stop of route) {
        if (stop.type === 'pickup') pickedUpGroups.add(stop.groupId);
        else if (stop.groupId >= 0 && !pickedUpGroups.has(stop.groupId)) return false;
      }
      return true;
    };

    const calcRouteDist = (route, sLat, sLng) => {
      let total = 0, pLat = sLat, pLng = sLng;
      for (const s of route) {
        total += calculateDistance(pLat, pLng, s.lat, s.lng) || 0;
        pLat = s.lat; pLng = s.lng;
      }
      return total;
    };

    let bestRoute;

    if (stops.length <= 8) {
      const permute = (arr) => {
        if (arr.length <= 1) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const perm of permute(rest)) result.push([arr[i], ...perm]);
        }
        return result;
      };
      let bestDist = Infinity;
      for (const route of permute(stops)) {
        if (!isValidRoute(route)) continue;
        const dist = calcRouteDist(route, startLat, startLng);
        if (dist < bestDist) { bestDist = dist; bestRoute = route; }
      }
    } else {
      const remaining = [...stops];
      bestRoute = [];
      let cLat = startLat, cLng = startLng;
      const pickedUpGroups = new Set();
      while (remaining.length > 0) {
        const eligible = remaining.filter(s => 
          s.type === 'pickup' || s.groupId < 0 || pickedUpGroups.has(s.groupId)
        );
        let nIdx = -1, nDist = Infinity;
        for (const s of eligible) {
          const rIdx = remaining.indexOf(s);
          const dist = calculateDistance(cLat, cLng, s.lat, s.lng);
          if (dist !== null && dist < nDist) { nDist = dist; nIdx = rIdx; }
        }
        if (nIdx === -1) break;
        const chosen = remaining.splice(nIdx, 1)[0];
        bestRoute.push(chosen);
        if (chosen.type === 'pickup') pickedUpGroups.add(chosen.groupId);
        cLat = chosen.lat; cLng = chosen.lng;
      }
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < bestRoute.length - 1; i++) {
          for (let j = i + 2; j < bestRoute.length; j++) {
            const newRoute = [...bestRoute.slice(0, i + 1), ...bestRoute.slice(i + 1, j + 1).reverse(), ...bestRoute.slice(j + 1)];
            if (!isValidRoute(newRoute)) continue;
            if (calcRouteDist(newRoute, startLat, startLng) < calcRouteDist(bestRoute, startLat, startLng)) {
              bestRoute = newRoute; improved = true;
            }
          }
        }
      }
    }

    if (!bestRoute || bestRoute.length === 0) {
      toast.error("Rota oluşturulamadı");
      return;
    }

    // Her adıma gecikme bilgisi ekle
    const routeData = bestRoute.map((stop, i) => {
      let delayMin = null;
      const stepOrders = stop.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
      if (stop.type === 'pickup') {
        const maxAge = Math.max(...stepOrders.map(o => o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) : 0));
        if (maxAge > 15) delayMin = maxAge;
      } else {
        const maxAge = Math.max(...stepOrders.map(o => o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) : 0));
        if (maxAge > 35) delayMin = maxAge;
      }
      return { ...stop, step: i + 1, delayMin };
    });

    setSmartRouteData(routeData);
    setSmartRouteTotalDistance(calcRouteDist(bestRoute, startLat, startLng));
    setViewMode("route");
  }, [orders, courierId]);

  // Akıllı rotada "Haritada Gör" - kalan adımlardan rota oluştur
  const openSmartRouteInMaps = useCallback(() => {
    const remainingSteps = smartRouteData.filter(step => {
      const stepOrders = step.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
      if (step.type === 'pickup') {
        return !stepOrders.every(o => ['on_the_way', 'delivered'].includes(o.status));
      } else {
        return !stepOrders.every(o => o.status === 'delivered');
      }
    });

    if (remainingSteps.length === 0) {
      toast.info("Tüm adımlar tamamlandı");
      return;
    }

    const dest = `${remainingSteps[remainingSteps.length - 1].lat},${remainingSteps[remainingSteps.length - 1].lng}`;
    const wps = remainingSteps.slice(0, -1).map(s => `${s.lat},${s.lng}`).join("|");
    let gUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    if (wps) gUrl += `&waypoints=${encodeURIComponent(wps)}`;
    const aStops = remainingSteps.map(s => `${s.lat},${s.lng}`).join("+to:");
    const aUrl = `maps://?daddr=${aStops}&dirflg=d`;

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OPEN_ROUTE',
        data: {
          destination: { lat: remainingSteps[remainingSteps.length - 1].lat, lng: remainingSteps[remainingSteps.length - 1].lng },
          waypoints: remainingSteps.slice(0, -1).map(s => ({ lat: s.lat, lng: s.lng, address: s.label })),
          mapsUrl: gUrl,
          appleMapsUrl: aUrl
        }
      }));
    } else {
      window.open(gUrl, "_blank");
    }
  }, [smartRouteData, orders]);

  // Rotaya yeni sipariş ekle - tamamlanan adımları koru, kalanları + yenileri optimize et
  const addToSmartRoute = useCallback(async () => {
    // Tamamlanan ve kalan adımları ayır
    const completedSteps = [];
    const remainingSteps = [];
    
    for (const step of smartRouteData) {
      const stepOrders = step.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
      const isCompleted = step.type === 'pickup'
        ? stepOrders.every(o => ['on_the_way', 'delivered'].includes(o.status))
        : stepOrders.every(o => o.status === 'delivered');
      
      if (isCompleted) completedSteps.push(step);
      else remainingSteps.push(step);
    }

    // Rotada olan sipariş ID'leri
    const routeOrderIds = smartRouteData.flatMap(s => s.orderIds);
    
    // Yeni siparişler (rotada olmayanlar)
    const newAssigned = orders.filter(o => 
      ["assigned", "confirmed"].includes(o.status) && !routeOrderIds.includes(o.id) &&
      o.delivery_location?.latitude && o.restaurant_location?.latitude
    );
    const newOnTheWay = orders.filter(o => 
      o.status === "on_the_way" && !routeOrderIds.includes(o.id) &&
      o.delivery_location?.latitude
    );

    if (newAssigned.length === 0 && newOnTheWay.length === 0) {
      toast.info("Eklenecek yeni sipariş yok");
      return;
    }

    // Başlangıç noktası - son tamamlanan adımın konumu veya kurye konumu
    let startLat, startLng;
    if (completedSteps.length > 0) {
      const lastCompleted = completedSteps[completedSteps.length - 1];
      startLat = lastCompleted.lat;
      startLng = lastCompleted.lng;
    } else if (lastLocationRef.current.lat && lastLocationRef.current.lng && 
        (Date.now() - lastLocationRef.current.time) < 300000) {
      startLat = lastLocationRef.current.lat;
      startLng = lastLocationRef.current.lng;
    } else {
      try {
        const res = await axios.get(`${API}/couriers/${courierId}`);
        const loc = res.data?.current_location;
        if (loc?.latitude && loc?.longitude) { startLat = loc.latitude; startLng = loc.longitude; }
      } catch (e) {}
    }
    if (!startLat || !startLng) {
      const first = newAssigned[0] || newOnTheWay[0] || remainingSteps[0];
      startLat = first.restaurant_location?.latitude || first.lat || first.delivery_location?.latitude;
      startLng = first.restaurant_location?.longitude || first.lng || first.delivery_location?.longitude;
    }

    // Kalan adımları + yeni siparişleri birlikte durak listesine çevir
    const stops = [];

    // Kalan mevcut adımları ekle - groupId'leri yeniden ata (tutarlılık için)
    const existingPickupMap = {}; // orderId -> yeni groupId
    let groupCounter = 0;
    
    remainingSteps.forEach(step => {
      if (step.type === 'pickup') {
        const newGid = groupCounter++;
        const newStep = { ...step, groupId: newGid };
        stops.push(newStep);
        step.orderIds.forEach(oid => { existingPickupMap[oid] = newGid; });
      }
    });
    remainingSteps.forEach(step => {
      if (step.type === 'delivery') {
        // Bu delivery hangi pickup grubuna ait? orderIds'den bul
        const oid = step.orderIds[0];
        const matchedGid = existingPickupMap[oid];
        stops.push({ ...step, groupId: matchedGid !== undefined ? matchedGid : -1 });
      }
    });

    // Yeni atanmış siparişleri restoran bazında grupla
    const restaurantGroups = {};
    newAssigned.forEach((order) => {
      const rId = order.restaurant_id;
      if (!restaurantGroups[rId]) {
        restaurantGroups[rId] = {
          restaurant_name: order.restaurant_name,
          restaurant_phone: order.restaurant_phone,
          lat: order.restaurant_location.latitude,
          lng: order.restaurant_location.longitude,
          orderIds: [],
          orderLabels: [],
        };
      }
      restaurantGroups[rId].orderIds.push(order.id);
      restaurantGroups[rId].orderLabels.push(order.customer_name || order.delivery_address);
    });

    // Mevcut pickup durakları ile aynı restorandan yeni sipariş varsa birleştir
    Object.entries(restaurantGroups).forEach(([rId, group]) => {
      const existingPickup = stops.find(s => s.type === 'pickup' && 
        orders.find(o => o.id === s.orderIds[0])?.restaurant_id === rId);
      
      if (existingPickup) {
        existingPickup.orderIds.push(...group.orderIds);
        existingPickup.subLabels = [...(existingPickup.subLabels || []), ...group.orderLabels];
        // Yeni delivery'ler bu pickup'ın groupId'sini kullanacak
        group._groupId = existingPickup.groupId;
      } else {
        const newGid = groupCounter++;
        stops.push({
          type: 'pickup',
          groupId: newGid,
          orderIds: group.orderIds,
          label: group.restaurant_name,
          subLabels: group.orderLabels,
          phone: group.restaurant_phone,
          lat: group.lat,
          lng: group.lng,
        });
        group._groupId = newGid;
      }
    });

    // Yeni atanmış siparişlerin delivery durakları
    newAssigned.forEach((order) => {
      const rId = order.restaurant_id;
      const groupId = restaurantGroups[rId]?._groupId ?? -1;
      stops.push({
        type: 'delivery',
        groupId: groupId,
        orderIds: [order.id],
        label: order.customer_name || order.delivery_address,
        address: order.delivery_address,
        phone: order.customer_phone,
        lat: order.delivery_location.latitude,
        lng: order.delivery_location.longitude,
      });
    });

    // Yeni yolda siparişlerin delivery durakları
    newOnTheWay.forEach((order) => {
      stops.push({
        type: 'delivery',
        groupId: -1,
        orderIds: [order.id],
        label: order.customer_name || order.delivery_address,
        address: order.delivery_address,
        phone: order.customer_phone,
        lat: order.delivery_location.latitude,
        lng: order.delivery_location.longitude,
      });
    });

    // Optimize et
    const isValidRoute = (route) => {
      const pickedUpGroups = new Set();
      for (const stop of route) {
        if (stop.type === 'pickup') pickedUpGroups.add(stop.groupId);
        else if (stop.groupId >= 0 && !pickedUpGroups.has(stop.groupId)) return false;
      }
      return true;
    };

    const calcRouteDist = (route, sLat, sLng) => {
      let total = 0, pLat = sLat, pLng = sLng;
      for (const s of route) {
        total += calculateDistance(pLat, pLng, s.lat, s.lng) || 0;
        pLat = s.lat; pLng = s.lng;
      }
      return total;
    };

    let bestRoute;
    if (stops.length <= 8) {
      const permute = (arr) => {
        if (arr.length <= 1) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const perm of permute(rest)) result.push([arr[i], ...perm]);
        }
        return result;
      };
      let bestDist = Infinity;
      for (const route of permute(stops)) {
        if (!isValidRoute(route)) continue;
        const dist = calcRouteDist(route, startLat, startLng);
        if (dist < bestDist) { bestDist = dist; bestRoute = route; }
      }
    } else {
      const remaining = [...stops];
      bestRoute = [];
      let cLat = startLat, cLng = startLng;
      const pickedUpGroups = new Set();
      while (remaining.length > 0) {
        const eligible = remaining.filter(s => 
          s.type === 'pickup' || s.groupId < 0 || pickedUpGroups.has(s.groupId)
        );
        let nIdx = -1, nDist = Infinity;
        for (const s of eligible) {
          const rIdx = remaining.indexOf(s);
          const dist = calculateDistance(cLat, cLng, s.lat, s.lng);
          if (dist !== null && dist < nDist) { nDist = dist; nIdx = rIdx; }
        }
        if (nIdx === -1) break;
        const chosen = remaining.splice(nIdx, 1)[0];
        bestRoute.push(chosen);
        if (chosen.type === 'pickup') pickedUpGroups.add(chosen.groupId);
        cLat = chosen.lat; cLng = chosen.lng;
      }
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < bestRoute.length - 1; i++) {
          for (let j = i + 2; j < bestRoute.length; j++) {
            const newRoute = [...bestRoute.slice(0, i + 1), ...bestRoute.slice(i + 1, j + 1).reverse(), ...bestRoute.slice(j + 1)];
            if (!isValidRoute(newRoute)) continue;
            if (calcRouteDist(newRoute, startLat, startLng) < calcRouteDist(bestRoute, startLat, startLng)) {
              bestRoute = newRoute; improved = true;
            }
          }
        }
      }
    }

    if (!bestRoute || bestRoute.length === 0) {
      toast.error("Rota güncellenemedi");
      return;
    }

    // Gecikme bilgisi ekle
    const optimizedSteps = bestRoute.map((stop, i) => {
      let delayMin = null;
      const stepOrders = stop.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
      if (stop.type === 'pickup') {
        const maxAge = Math.max(0, ...stepOrders.map(o => o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) : 0));
        if (maxAge > 15) delayMin = maxAge;
      } else {
        const maxAge = Math.max(0, ...stepOrders.map(o => o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) : 0));
        if (maxAge > 35) delayMin = maxAge;
      }
      return { ...stop, step: i + 1, delayMin };
    });

    // Tamamlanan adımlar + optimize edilmiş kalan adımlar
    const finalRoute = [
      ...completedSteps.map((s, i) => ({ ...s, step: i + 1 })),
      ...optimizedSteps.map((s, i) => ({ ...s, step: completedSteps.length + i + 1 }))
    ];

    setSmartRouteData(finalRoute);
    setSmartRouteTotalDistance(calcRouteDist(bestRoute, startLat, startLng));
    setViewMode("route");
    toast.success(`${newAssigned.length + newOnTheWay.length} yeni sipariş rotaya eklendi`);
  }, [smartRouteData, orders, courierId]);

  // Siparişleri getir
  const fetchOrders = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      // Yeni merkezi endpoint kullan
      const res = await axios.get(`${API}/orders/v2/list`, {
        params: {
          panel: 'courier',
          courier_id: courierId,
          status: 'active',
          limit: 50
        }
      });
      const newOrders = res.data.orders || [];
      setOrders(newOrders);
      
    } catch (err) {
      // Sessizce başarısız ol - arka planda veya ağ kesintisinde toast gösterme
      console.log("Siparişler yüklenemedi:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) {
      fetchOrders(false);
      
      // Yetkileri çek
      axios.get(`${API}/couriers/${courierId}/permissions`)
        .then(res => setPermissions(res.data.permissions || { can_mark_not_ready: true }))
        .catch(() => {});
      
      // Wake Lock al - ekranın kapanmasını önle
      requestWakeLock();
      
      // Her 2 saniyede bir siparişleri güncelle
      const interval = setInterval(() => fetchOrders(false), 2000);
      
      // Sayfa tekrar görünür olduğunda hemen fetch yap (arka plandan dönünce)
      const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible') {
          console.log("Sayfa görünür oldu, siparişler yenileniyor...");
          fetchOrders(false);
          
          // Wake Lock'ı yeniden al (arka plandan dönünce kaybolabilir)
          await requestWakeLock();
        } else {
          // Sayfa gizlendiğinde - arka plan işlemleri devam etsin
          console.log("Sayfa gizlendi, arka plan görevleri devam ediyor...");
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        releaseWakeLock();
      };
    }
  }, [courierId, fetchOrders, requestWakeLock, releaseWakeLock]);

  // Siparişi onayla (Gördüm)
  const handleConfirmOrder = async (orderId) => {
    setActionLoading(orderId);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${orderId}/confirm`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Siparişi yola çıkar
  const handlePickupOrder = async (orderId) => {
    setActionLoading(orderId);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${orderId}/pickup`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Toplu yola çıkarma - aynı restorandan siparişler için
  const handleBulkPickup = async (orderIds) => {
    setActionLoading("bulk");
    try {
      await axios.post(`${API}/orders/courier/${courierId}/bulk-pickup`, {
        order_ids: orderIds
      });
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Sipariş hazır değil - önce onay al
  const handleNotReady = (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setPendingNotReadyOrder(order);
      setShowNotReadyModal(true);
    }
  };

  // Hazır değil onaylandı - API çağrısı yap
  const executeNotReady = async () => {
    if (!pendingNotReadyOrder) return;
    
    setActionLoading(pendingNotReadyOrder.id);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${pendingNotReadyOrder.id}/not-ready`);
      toast.success("Sipariş hazırlanıyor olarak işaretlendi");
      fetchOrders();
      setShowNotReadyModal(false);
      setPendingNotReadyOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Siparişi teslim et - ödeme kontrolü ile
  const handleDeliverOrder = async (orderId) => {
    // Siparişi bul
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Nakit veya kart ödeme ise önce onay al
    if (order.payment_method === 'cash' || order.payment_method === 'card') {
      setPendingDeliveryOrder(order);
      setShowPaymentConfirmModal(true);
      return;
    }
    
    // Online ödeme ise onay modalı göster
    setPendingDeliveryOrder(order);
    setShowOnlineDeliveryConfirmModal(true);
  };

  // Gerçek teslim işlemi
  const executeDelivery = async (orderId, paymentDetails = null) => {
    setActionLoading(orderId);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${orderId}/deliver`, paymentDetails);
      fetchOrders();
      setShowDetailModal(false);
      setShowPaymentConfirmModal(false);
      setShowOnlineDeliveryConfirmModal(false);
      setPendingDeliveryOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Ödeme onaylandı - teslim et
  const handlePaymentConfirmed = (paymentDetails) => {
    if (pendingDeliveryOrder) {
      executeDelivery(pendingDeliveryOrder.id, paymentDetails);
    }
  };

  // Ödeme onayı iptal
  const handlePaymentCancelled = () => {
    setShowPaymentConfirmModal(false);
    setPendingDeliveryOrder(null);
  };

  // Online teslimat onaylandı
  const handleOnlineDeliveryConfirmed = () => {
    if (pendingDeliveryOrder) {
      executeDelivery(pendingDeliveryOrder.id);
    }
  };

  // Online teslimat iptal
  const handleOnlineDeliveryCancelled = () => {
    setShowOnlineDeliveryConfirmModal(false);
    setPendingDeliveryOrder(null);
  };

  // Haritada aç
  const openInMaps = (lat, lng, label) => {
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const appleUrl = `maps://?daddr=${lat},${lng}&dirflg=d`;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OPEN_NAVIGATION',
        data: {
          destination: { lat, lng, label },
          mapsUrl: googleUrl,
          appleMapsUrl: appleUrl
        }
      }));
    } else {
      window.open(googleUrl, "_blank");
    }
  };

  // Telefonu ara
  const callPhone = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  if (loading) {
    return <PageLoading />;
  }

  // Siparişleri grupla - atanmış + yolda birlikte gösterilecek
  const assignedOrders = orders.filter((o) => ["assigned", "confirmed", "on_the_way"].includes(o.status));
  const smartRouteRemainingCount = smartRouteData.filter(step => {
    const stepOrders = step.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
    if (step.type === 'pickup') return !stepOrders.every(o => ['on_the_way', 'delivered'].includes(o.status));
    return !stepOrders.every(o => o.status === 'delivered');
  }).length;

  return (
    <div className="space-y-3" data-testid="courier-siparis-page">
      {/* Görünüm Toggle - Liste / Rota */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setViewMode("list")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            viewMode === "list"
              ? "bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-300 shadow-md border border-purple-200 dark:border-purple-500"
              : "bg-slate-200/60 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100"
          }`}
          data-testid="view-mode-list"
        >
          <ClipboardList className="w-4 h-4" />
          Liste
          {assignedOrders.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              viewMode === "list" ? "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200" : "bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-200"
            }`}>
              {assignedOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            if (smartRouteData.length === 0 && assignedOrders.length >= 2) {
              createSmartRoute();
            } else {
              setViewMode("route");
            }
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            viewMode === "route"
              ? "bg-white dark:bg-slate-600 text-indigo-700 dark:text-indigo-300 shadow-md border border-indigo-200 dark:border-indigo-500"
              : "bg-slate-200/60 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100"
          }`}
          data-testid="view-mode-route"
        >
          <Route className="w-4 h-4" />
          Rota
          {smartRouteData.length > 0 && smartRouteRemainingCount > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              viewMode === "route" ? "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200" : "bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-200"
            }`}>
              {smartRouteRemainingCount}
            </span>
          )}
        </button>
      </div>

      {/* Liste Görünümü */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {assignedOrders.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg mb-1">Sipariş yok</h3>
              <p className="text-sm text-muted-foreground">
                Size sipariş atandığında burada görünecek
              </p>
            </div>
          ) : (
            <>
              {/* Toplu Yola Çıkar Butonu */}
              {(() => {
                const confirmedOrders = assignedOrders.filter(o => o.status === "confirmed");
                if (confirmedOrders.length >= 2) {
                  const restaurantIds = [...new Set(confirmedOrders.map(o => o.restaurant_id))];
                  if (restaurantIds.length === 1) {
                    const restaurantName = confirmedOrders[0].restaurant_name;
                    const totalFee = confirmedOrders.reduce((sum, o) => sum + (o.courier_fee || 0), 0);
                    return (
                      <div className="bg-cyan-50 border border-cyan-300 rounded-xl p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-cyan-700">
                            <Store className="w-5 h-5" />
                            <span className="font-semibold text-sm">
                              {restaurantName} - {confirmedOrders.length} sipariş
                            </span>
                          </div>
                          {totalFee > 0 && (
                            <div className="flex items-center gap-1.5 text-green-700 text-sm">
                              <Banknote className="w-4 h-4" />
                              <span>Bu {confirmedOrders.length} siparişten {formatCurrency(totalFee)} kazanacaksınız</span>
                            </div>
                          )}
                          <Button
                            onClick={() => handleBulkPickup(confirmedOrders.map(o => o.id))}
                            disabled={actionLoading === "bulk"}
                            className="w-full bg-cyan-600 hover:bg-cyan-700"
                            data-testid="bulk-pickup-btn"
                          >
                            {actionLoading === "bulk" ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Truck className="w-4 h-4 mr-2" />
                            )}
                            Tümünü Yola Çıkar ({confirmedOrders.length} sipariş)
                          </Button>
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              {assignedOrders.map((order) => (
                  order.status === "assigned" ? (
                    <NewOrderCard
                      key={order.id}
                      order={order}
                      onConfirm={() => handleConfirmOrder(order.id)}
                      loading={actionLoading === order.id}
                    />
                  ) : (
                    <ActiveOrderCard
                      key={order.id}
                      order={order}
                      onPickup={() => handlePickupOrder(order.id)}
                      onDeliver={() => handleDeliverOrder(order.id)}
                      onNotReady={() => handleNotReady(order.id)}
                      canMarkNotReady={permissions.can_mark_not_ready}
                      onViewDetails={() => {
                        setSelectedOrder(order);
                        setShowDetailModal(true);
                      }}
                      onOpenMaps={() =>
                        openInMaps(
                          order.delivery_location?.latitude,
                          order.delivery_location?.longitude,
                          order.delivery_address
                        )
                      }
                      onOpenRestaurantMaps={() =>
                        openInMaps(
                          order.restaurant_location?.latitude,
                          order.restaurant_location?.longitude,
                          order.restaurant_name
                        )
                      }
                      onCall={() => callPhone(order.customer_phone)}
                      loading={actionLoading === order.id}
                    />
                  )
                ))}
            </>
          )}
        </div>
      )}

      {/* Rota Görünümü */}
      {viewMode === "route" && (
        <div className="space-y-3">
          {smartRouteData.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Route className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg mb-1">Rota oluşturuluyor...</h3>
              <p className="text-sm text-muted-foreground mb-4">
                En az 2 sipariş gerekli
              </p>
              <Button variant="outline" onClick={() => setViewMode("list")}>
                <ClipboardList className="w-4 h-4 mr-2" />
                Listeye Dön
              </Button>
            </div>
          ) : (
            <>
              {/* Haritada Gör + Rotaya Ekle */}
              <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {smartRouteData.length} durak · ~{smartRouteTotalDistance.toFixed(1)} km
                  </span>
                  <span className="text-xs text-indigo-500 dark:text-indigo-400">
                    {smartRouteRemainingCount} kalan
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={openSmartRouteInMaps}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    data-testid="smart-route-maps-btn"
                    disabled={smartRouteRemainingCount === 0}
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Haritada Gör
                  </Button>
                  {(() => {
                    const routeOrderIds = smartRouteData.flatMap(s => s.orderIds);
                    const newOrders = assignedOrders.filter(o => !routeOrderIds.includes(o.id));
                    if (newOrders.length > 0) {
                      return (
                        <Button
                          onClick={addToSmartRoute}
                          className="bg-amber-600 hover:bg-amber-700"
                          data-testid="smart-route-add-btn"
                        >
                          <Route className="w-4 h-4 mr-1" />
                          +{newOrders.length}
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Rota Adımları */}
              <div className="space-y-2">
                {smartRouteData.map((step, i) => {
                  const stepOrders = step.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean);
                  const isCompleted = step.type === 'pickup'
                    ? stepOrders.every(o => ['on_the_way', 'delivered'].includes(o.status))
                    : stepOrders.every(o => o.status === 'delivered');
                  const isPickupExpanded = expandedPickups.has(i);
                  
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border transition-all ${
                        isCompleted
                          ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-40'
                          : step.type === 'pickup'
                            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700'
                            : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                      }`}
                      data-testid={`smart-route-step-${i}`}
                    >
                      {/* Ana içerik */}
                      <div className="flex items-start gap-3 p-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCompleted
                            ? 'bg-slate-200 dark:bg-slate-600 text-slate-500'
                            : step.type === 'pickup'
                              ? 'bg-orange-100 text-orange-600 border-2 border-orange-300'
                              : 'bg-green-100 text-green-600 border-2 border-green-300'
                        }`}>
                          {isCompleted ? <Check className="w-4 h-4" /> : step.type === 'pickup' ? <Store className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${
                              isCompleted ? 'text-slate-400' : step.type === 'pickup' ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {step.type === 'pickup' ? 'AL' : 'TESLİM ET'}
                            </span>
                            {step.delayMin && !isCompleted && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {step.delayMin} dk
                              </span>
                            )}
                          </div>
                          <p className={`text-sm font-medium ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                            {step.label}
                          </p>

                          {/* DELIVERY: Tüm detaylar direkt göster */}
                          {step.type === 'delivery' && !isCompleted && stepOrders[0] && (
                            <div className="mt-1.5 space-y-1">
                              <p className="text-[12px] text-slate-600 dark:text-slate-400">{step.address}</p>
                              <div className="flex items-center gap-2 text-[12px]">
                                <span className={`font-semibold ${stepOrders[0].payment_type === 'online' ? 'text-blue-600' : 'text-amber-600'}`}>
                                  {stepOrders[0].payment_type === 'online' ? 'Online Ödendi' : stepOrders[0].payment_type === 'credit_card' ? 'Kapıda Kart' : 'Kapıda Nakit'}
                                </span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{formatCurrency(stepOrders[0].total_amount || stepOrders[0].amount || 0)}</span>
                              </div>
                              {stepOrders[0].items && stepOrders[0].items.length > 0 && (
                                <p className="text-[11px] text-slate-500 truncate">
                                  {stepOrders[0].items.map(item => `${item.quantity || 1}x ${item.name}`).join(', ')}
                                </p>
                              )}
                              {stepOrders[0].customer_note && (
                                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 truncate">
                                  Not: {stepOrders[0].customer_note}
                                </p>
                              )}
                            </div>
                          )}

                          {/* PICKUP: Özet + expand butonu */}
                          {step.type === 'pickup' && !isCompleted && (
                            <>
                              {step.subLabels && step.subLabels.length > 0 && (
                                <p className="text-[11px] text-slate-500">{step.subLabels.join(', ')}</p>
                              )}
                              {stepOrders.length > 0 && (
                                <button
                                  className="text-[11px] text-orange-600 font-medium mt-1 flex items-center gap-1"
                                  onClick={() => {
                                    const next = new Set(expandedPickups);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    setExpandedPickups(next);
                                  }}
                                  data-testid={`smart-route-expand-${i}`}
                                >
                                  {isPickupExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  {isPickupExpanded ? 'Detayları gizle' : `${stepOrders.length} sipariş detayı`}
                                </button>
                              )}
                            </>
                          )}

                          {/* Aksiyonlar */}
                          {!isCompleted && (
                            <div className="flex items-center gap-2 mt-2">
                              {step.phone && (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => callPhone(step.phone)} data-testid={`smart-route-call-${i}`}>
                                  <Phone className="w-3 h-3 mr-1" /> Ara
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                onClick={() => openInMaps(step.lat, step.lng, step.label)} data-testid={`smart-route-nav-${i}`}>
                                <Navigation className="w-3 h-3 mr-1" /> Git
                              </Button>
                              {step.type === 'pickup' ? (
                                <Button size="sm" className="h-7 px-3 text-xs bg-orange-600 hover:bg-orange-700 ml-auto"
                                  onClick={async () => { for (const oid of step.orderIds) await handlePickupOrder(oid); }}
                                  disabled={actionLoading} data-testid={`smart-route-pickup-${i}`}>
                                  {actionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3 mr-1" />}
                                  Aldım
                                </Button>
                              ) : (
                                <Button size="sm" className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 ml-auto"
                                  onClick={() => handleDeliverOrder(step.orderIds[0])}
                                  disabled={actionLoading} data-testid={`smart-route-deliver-${i}`}>
                                  {actionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                                  Teslim Et
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* PICKUP Expand: Sipariş detayları */}
                      {step.type === 'pickup' && isPickupExpanded && !isCompleted && (
                        <div className="border-t border-orange-200 dark:border-orange-700 px-3 pb-3 pt-2 space-y-2">
                          {stepOrders.map((order, oIdx) => (
                            <div key={order.id} className="bg-white dark:bg-slate-800 rounded-md p-2.5 border border-orange-100 dark:border-orange-800">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{order.customer_name || order.delivery_address}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  order.payment_type === 'online' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {order.payment_type === 'online' ? 'Online' : order.payment_type === 'credit_card' ? 'Kart' : 'Nakit'}
                                  {' '}{formatCurrency(order.total_amount || order.amount || 0)}
                                </span>
                              </div>
                              {order.items && order.items.length > 0 && (
                                <p className="text-[11px] text-slate-500 mt-1 truncate">
                                  {order.items.map(item => `${item.quantity || 1}x ${item.name}`).join(', ')}
                                </p>
                              )}
                              {order.customer_note && (
                                <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 truncate">
                                  Not: {order.customer_note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tüm adımlar tamamlandıysa */}
              {smartRouteRemainingCount === 0 && (
                <div className="border-2 border-dashed border-green-300 dark:border-green-600 rounded-lg p-6 text-center">
                  <CheckCircle className="w-10 h-10 mx-auto text-green-500 mb-2" />
                  <h3 className="font-semibold text-green-700 dark:text-green-400 mb-1">Rota tamamlandı!</h3>
                  <Button variant="outline" className="mt-2"
                    onClick={() => { setSmartRouteData([]); setViewMode("list"); }}>
                    Listeye Dön
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Sipariş Detay Modal */}
      <OrderDetailModal
        order={selectedOrder}
        open={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onPickup={() => selectedOrder && handlePickupOrder(selectedOrder.id)}
        onDeliver={() => selectedOrder && handleDeliverOrder(selectedOrder.id)}
        onOpenMaps={() =>
          selectedOrder &&
          openInMaps(
            selectedOrder.delivery_location?.latitude,
            selectedOrder.delivery_location?.longitude,
            selectedOrder.delivery_address
          )
        }
        onCall={() => selectedOrder && callPhone(selectedOrder.customer_phone)}
        loading={actionLoading === selectedOrder?.id}
      />

      {/* Ödeme Onay Modalı */}
      <PaymentConfirmModal
        order={pendingDeliveryOrder}
        open={showPaymentConfirmModal}
        onConfirm={handlePaymentConfirmed}
        onCancel={handlePaymentCancelled}
        loading={actionLoading === pendingDeliveryOrder?.id}
      />

      {/* Online Ödeme Teslimat Onay Modalı */}
      <Dialog open={showOnlineDeliveryConfirmModal} onOpenChange={setShowOnlineDeliveryConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Teslimat Onayı
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong>{pendingDeliveryOrder?.customer_name}</strong> adına siparişi teslim etmek istediğinize emin misiniz?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleOnlineDeliveryCancelled}
              disabled={actionLoading === pendingDeliveryOrder?.id}
            >
              İptal
            </Button>
            <Button
              onClick={handleOnlineDeliveryConfirmed}
              disabled={actionLoading === pendingDeliveryOrder?.id}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading === pendingDeliveryOrder?.id ? "Teslim Ediliyor..." : "Teslim Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hazır Değil Onay Modalı */}
      <Dialog open={showNotReadyModal} onOpenChange={setShowNotReadyModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <Clock className="w-5 h-5" />
              Sipariş Hazır Değil
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Bu siparişe <strong>5 dakika</strong> bekleme süresi eklenecek ve siparişe 5 dakika sonra <strong>farklı bir kurye</strong> atanacak.
            </p>
            <p className="text-sm font-medium mt-3">
              Siparişi almadan devam etmeyi onaylıyor musun?
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowNotReadyModal(false);
                setPendingNotReadyOrder(null);
              }}
            >
              Vazgeç
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              onClick={executeNotReady}
              disabled={actionLoading === pendingNotReadyOrder?.id}
            >
              {actionLoading === pendingNotReadyOrder?.id ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Evet, Onayla
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// Yeni Sipariş Kartı (Onay Bekleyen)
function NewOrderCard({ order, onConfirm, loading }) {
  const courierFee = order.courier_fee || 0;
  const distance = getOrderDistance(order);
  const age = getOrderAgeText(order);
  
  return (
    <div className="rounded-lg border border-purple-200 bg-white overflow-hidden" data-testid={`new-order-card-${order.id}`}>
      <div className="bg-purple-600 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold text-white bg-white/20 px-2 py-px rounded-full">YENİ{age ? ` · ${age}` : ''}</span>
        {courierFee > 0 && <span className="text-[12px] font-bold text-white">{formatCurrency(courierFee)}</span>}
      </div>
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Store className="w-4 h-4 text-purple-500 flex-shrink-0" />
        <span className="text-[13px] font-semibold text-slate-800 truncate flex-1">{order.restaurant_name}</span>
        {distance && <span className="text-[11px] text-purple-600 font-medium flex-shrink-0">{distance}</span>}
      </div>
      <div className="px-3 pb-3">
        <button onClick={onConfirm} disabled={loading} className="w-full h-10 rounded-lg bg-purple-600 active:bg-purple-700 active:scale-[0.98] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50" data-testid={`confirm-order-btn-${order.id}`}>
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Siparişi Gördüm
        </button>
      </div>
    </div>
  );
}

// Aktif Sipariş Kartı
function ActiveOrderCard({ order, onPickup, onDeliver, onNotReady, onViewDetails, onOpenMaps, onOpenRestaurantMaps, onCall, loading, canMarkNotReady = true }) {
  const sc = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.confirmed;
  const pi = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const PI = pi.icon;
  const isConfirmed = order.status === "confirmed";
  const isOnTheWay = order.status === "on_the_way";
  const age = getOrderAgeText(order);
  const dist = getOrderDistance(order);

  // Süre uyarısı: onaylandı >15dk, yolda >35dk
  const ageMinutes = order.created_at ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000) : 0;
  const isLate = (isConfirmed && ageMinutes > 15) || (isOnTheWay && ageMinutes > 35);

  const callRest = () => order.restaurant_phone ? (window.location.href = `tel:${order.restaurant_phone}`) : alert("Telefon bulunamadı");

  const note = order.notes?.includes("CUSTOMER:") ? (() => {
    const m = order.notes.match(/CUSTOMER:([^|]*)/);
    return m ? m[1].split(";").filter(n => n.trim()).join(" · ").substring(0, 55) : null;
  })() : null;

  // Satır içi ikon buton
  const Ic = ({ onClick, icon: I, cls, tid }) => (
    <button onClick={onClick} className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${cls}`} data-testid={tid}>
      <I className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid={`active-order-card-${order.id}`}>
      {/* Status bar: durum · süre | ödeme · tutar */}
      <div className={`${sc.color} px-3 py-1.5 flex items-center justify-between`}>
        <span className="text-[11px] font-bold text-white flex items-center gap-1">
          {sc.label}
          {age && (isLate
            ? <span className="flex items-center gap-1">· <span className="bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full inline-flex items-center justify-center animate-pulse leading-none">!</span> {age}</span>
            : <span>· {age}</span>
          )}
        </span>
        <span className="text-[11px] font-bold text-white flex items-center gap-2">
          {order.payment_method === 'online' ? (
            <span className="text-[10px] text-white/80">Online</span>
          ) : (
            <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              order.payment_method === 'cash' ? 'bg-green-500 text-white' :
              order.payment_method === 'card' ? 'bg-blue-500 text-white' :
              (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? 'bg-yellow-500 text-white' :
              'bg-purple-500 text-white'
            }`}><PI className="w-3 h-3" />{getPaymentLabel(order)}</span>
          )}
          {formatCurrency(order.total_amount)}
        </span>
      </div>

      <div className="px-3 py-2">
        {/* Restoran satırı */}
        <div className="flex items-center h-8">
          <Store className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mr-2" />
          <span className="text-[13px] font-semibold text-slate-800 truncate flex-1">{order.restaurant_name}</span>
          <Ic onClick={callRest} icon={Phone} cls="bg-orange-50 text-orange-500" tid={`call-restaurant-btn-${order.id}`} />
          <Ic onClick={onOpenRestaurantMaps} icon={Navigation} cls="bg-orange-50 text-orange-500 ml-1" tid={`navigate-restaurant-btn-${order.id}`} />
        </div>

        <div className="border-t border-dashed border-slate-200 my-1.5" />

        {/* Müşteri satırı */}
        <div className="flex items-center h-8">
          <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mr-2" />
          <span className="text-[13px] font-medium text-slate-700 truncate">{order.customer_name}</span>
          {dist && <span className="text-[11px] text-slate-600 font-medium ml-1.5 flex-shrink-0">{dist}</span>}
          <span className="flex-1" />
          <Ic onClick={onCall} icon={Phone} cls="bg-blue-50 text-blue-500" tid={`call-customer-btn-${order.id}`} />
          <Ic onClick={onOpenMaps} icon={Navigation} cls="bg-blue-50 text-blue-500 ml-1" tid={`navigate-customer-btn-${order.id}`} />
        </div>

        {/* Adres (varsa) */}
        {order.delivery_address && (
          <div className="text-[11px] text-slate-600 pl-[22px] mt-0.5 leading-relaxed line-clamp-2">{order.delivery_address}</div>
        )}

        {/* Müşteri notu */}
        {note && <div className="text-[10px] text-red-500 font-medium truncate pl-[22px] mt-0.5 leading-tight"><AlertCircle className="w-2.5 h-2.5 inline -mt-px mr-0.5" />{note}</div>}

        <div className="border-t border-slate-100 mt-2 mb-1.5" />

        {/* Aksiyonlar — tek satır */}
        <div className="flex gap-1.5">
          <button onClick={onViewDetails} className="h-9 px-3 rounded-md border border-slate-200 text-slate-500 text-[11px] font-medium flex items-center gap-1 active:bg-slate-50" data-testid={`view-detail-btn-${order.id}`}>
            <Eye className="w-3.5 h-3.5" />Detay
          </button>
          {isConfirmed && canMarkNotReady && (
            <button onClick={onNotReady} disabled={loading} className="h-9 px-3 rounded-md border border-orange-200 text-orange-500 text-[11px] font-medium flex items-center gap-1 active:bg-orange-50 disabled:opacity-50" data-testid={`not-ready-btn-${order.id}`}>
              <Clock className="w-3.5 h-3.5" />Hazır Değil
            </button>
          )}
          {isConfirmed && (
            <button onClick={onPickup} disabled={loading} className="flex-1 h-9 rounded-md bg-cyan-600 text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:bg-cyan-700 active:scale-[0.98] disabled:opacity-50 transition-all" data-testid={`pickup-btn-${order.id}`}>
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}Yola Çık
            </button>
          )}
          {isOnTheWay && (
            <button onClick={onDeliver} disabled={loading} className="flex-1 h-9 rounded-md bg-green-600 text-white text-[12px] font-bold flex items-center justify-center gap-1.5 active:bg-green-700 active:scale-[0.98] disabled:opacity-50 transition-all" data-testid={`deliver-btn-${order.id}`}>
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}Teslim Et
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Sipariş Detay Modal
function OrderDetailModal({ order, open, onClose, onPickup, onDeliver, onOpenMaps, onCall, loading }) {
  if (!order) return null;

  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.confirmed;
  const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const PaymentIcon = paymentInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4" />
            Sipariş Detayı
          </DialogTitle>
          <DialogDescription className="text-xs">
            {order.order_number} • {formatDate(order.created_at)} {formatTime(order.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Durum */}
          <div className="flex items-center justify-between">
            <Badge className={`${statusConfig.color} text-white text-xs`}>{statusConfig.label}</Badge>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${paymentInfo.bg} ${paymentInfo.color} font-medium`}>
              <PaymentIcon className="w-3 h-3" />
              <span>{getPaymentLabel(order)}</span>
              <span className="font-semibold ml-1">{formatCurrency(order.total_amount)}</span>
            </div>
          </div>

          {/* Özel Teslimat Uyarıları */}
          {(order.contactless_delivery || order.save_green || order.ring_doorbell === false) && (
            <div className="space-y-1.5">
              {order.ring_doorbell === false && (
                <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-orange-700 text-xs">
                  <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="font-medium">Zili çalmayın!</span>
                </div>
              )}
              {order.contactless_delivery && (
                <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                  <span>⚠️</span>
                  <span className="font-medium">Temassız teslimat! Müşteriyi arayın.</span>
                </div>
              )}
              {order.save_green && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-xs">
                  <span>♻️</span>
                  <span>Plastik çatal/bıçak göndermeyin.</span>
                </div>
              )}
            </div>
          )}

          {/* Sipariş Notu */}
          {order.note && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs font-medium text-yellow-800">📝 Sipariş Notu</p>
              <p className="text-xs text-yellow-700">{order.note}</p>
            </div>
          )}

          {/* Restoran */}
          <div className="border rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
              <Store className="w-3.5 h-3.5 text-orange-500" />
              Restoran
            </div>
            <p className="text-xs">{order.restaurant_name}</p>
          </div>

          {/* Müşteri */}
          <div className="border rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
              <User className="w-3.5 h-3.5 text-blue-500" />
              Müşteri
            </div>
            <p className="text-xs">{order.customer_name}</p>
            <button
              onClick={onCall}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
            >
              <Phone className="w-3 h-3" />
              {order.customer_phone?.includes(',,') 
                ? `${order.customer_phone.split(',,')[0]} (Dahili: ${order.customer_phone.split(',,')[1]})`
                : order.customer_phone
              }
            </button>
          </div>

          {/* Adres */}
          <div className="border rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Teslimat Adresi
            </div>
            <p className="text-xs">{order.delivery_address}</p>
            {/* Adres Tarifi */}
            {order.address_direction && (
              <p className="text-xs text-blue-600 mt-1">
                <span className="font-medium">📍 Tarif:</span> {order.address_direction}
              </p>
            )}
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-blue-600 text-xs"
              onClick={onOpenMaps}
            >
              <Navigation className="w-3 h-3 mr-1" />
              Haritada Aç
            </Button>
          </div>

          {/* Ürünler */}
          <div className="border rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              Sipariş İçeriği
            </div>
            <ul className="space-y-1.5">
              {order.items?.map((item, idx) => (
                <li key={idx} className="text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{item.quantity}x {item.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                  {/* Ürün Opsiyonları */}
                  {item.options && item.options.length > 0 && (
                    <div className="ml-3 mt-0.5 text-[10px] text-muted-foreground space-y-0.5">
                      {item.options.map((opt, optIdx) => (
                        <div key={optIdx} className={opt.excluded ? 'text-red-600' : ''}>
                          {opt.excluded ? '- ' : '+ '}{opt.quantity > 1 ? `${opt.quantity}x ` : ''}{opt.value || opt.name}
                          {opt.quantity > 1 && opt.unit_price > 0
                            ? ` (+${formatCurrency(opt.unit_price)} x${opt.quantity} = ${formatCurrency(opt.price)})`
                            : opt.price > 0 ? ` (+${formatCurrency(opt.price)})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Ürün Notu */}
                  {item.note && (
                    <div className="ml-3 mt-0.5 text-[10px] bg-yellow-50 text-yellow-800 px-1.5 py-0.5 rounded inline-block">
                      📝 {item.note}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t mt-1.5 pt-1.5 flex justify-between font-semibold text-xs">
              <span>Toplam</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </div>

          {/* Not */}
          {order.notes && (() => {
            const cleanNotes = order.notes
              .split('|')
              .filter(n => !n.trim().startsWith('ADDRESS:'))
              .map(n => n.trim().replace(/^CUSTOMER:/, '').replace(/^KITCHEN:/, ''))
              .filter(n => n)
              .join(' • ');
            return cleanNotes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
                <span className="font-medium text-yellow-800">Not:</span> {cleanNotes}
              </div>
            );
          })()}

          {/* Aksiyonlar */}
          <div className="flex gap-2 pt-1">
            {order.status === "confirmed" && (
              <Button
                size="sm"
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 h-8 text-xs"
                onClick={onPickup}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Truck className="w-3.5 h-3.5 mr-1" />
                )}
                Yola Çık
              </Button>
            )}
            {order.status === "on_the_way" && (
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs"
                onClick={onDeliver}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Teslim Et
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Ödeme Onay Modalı
function PaymentConfirmModal({ order, open, onConfirm, onCancel, loading }) {
  const [paymentMode, setPaymentMode] = useState("single"); // "single" veya "split"
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");

  // Modal açıldığında değerleri sıfırla
  useEffect(() => {
    if (open && order) {
      setPaymentMode("single");
      setSelectedMethod(order.payment_method);
      setCashAmount("");
      setCardAmount("");
    }
  }, [open, order]);

  if (!order) return null;

  const totalAmount = order.total_amount || 0;
  const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const PaymentIcon = paymentInfo.icon;

  // Parçalı ödeme toplamı kontrolü
  const cashNum = parseFloat(cashAmount) || 0;
  const cardNum = parseFloat(cardAmount) || 0;
  const splitTotal = cashNum + cardNum;
  const isSplitValid = paymentMode === "split" && Math.abs(splitTotal - totalAmount) < 0.01;

  const handleConfirm = () => {
    let paymentDetails = null;

    if (paymentMode === "split") {
      // Parçalı ödeme
      let method = "mixed";
      if (cashNum > 0 && cardNum === 0) method = "cash";
      else if (cardNum > 0 && cashNum === 0) method = "card";

      paymentDetails = {
        cash_amount: cashNum,
        card_amount: cardNum,
        payment_method: method
      };
    } else if (selectedMethod !== order.payment_method) {
      // Tek ödeme ama yöntem değişti
      paymentDetails = {
        cash_amount: selectedMethod === "cash" ? totalAmount : 0,
        card_amount: selectedMethod === "card" ? totalAmount : 0,
        payment_method: selectedMethod
      };
    }

    onConfirm(paymentDetails);
  };

  const canConfirm = paymentMode === "single" || isSplitValid;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PaymentIcon className={`w-5 h-5 ${paymentInfo.color}`} />
            Ödeme Onayı
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sipariş bilgisi */}
          <div className={`p-3 rounded-lg ${paymentInfo.bg} border`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{order.customer_name}</span>
              <span className={`text-sm font-bold ${paymentInfo.color}`}>
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* Ödeme Modu Seçimi */}
          <div className="flex gap-2">
            <Button
              variant={paymentMode === "single" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPaymentMode("single")}
            >
              Tek Ödeme
            </Button>
            <Button
              variant={paymentMode === "split" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setPaymentMode("split")}
            >
              Parçalı Ödeme
            </Button>
          </div>

          {/* Tek Ödeme Modu */}
          {paymentMode === "single" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Ödeme yöntemi:</p>
              <div className="flex gap-2">
                <Button
                  variant={selectedMethod === "cash" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 ${selectedMethod === "cash" ? "bg-green-600 hover:bg-green-700" : ""}`}
                  onClick={() => setSelectedMethod("cash")}
                >
                  <Banknote className="w-4 h-4 mr-1" />
                  Nakit
                </Button>
                <Button
                  variant={selectedMethod === "card" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 ${selectedMethod === "card" ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                  onClick={() => setSelectedMethod("card")}
                >
                  <CreditCard className="w-4 h-4 mr-1" />
                  Kredi Kartı
                </Button>
              </div>
              {selectedMethod !== order.payment_method && (
                <p className="text-xs text-amber-600">
                  Orijinal: {getPaymentLabel(order)}
                </p>
              )}
            </div>
          )}

          {/* Parçalı Ödeme Modu */}
          {paymentMode === "split" && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-xs text-green-600 font-medium flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3" /> Nakit
                  </label>
                  <input
                    type="number"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-9 px-2 border rounded text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-blue-600 font-medium flex items-center gap-1 mb-1">
                    <CreditCard className="w-3 h-3" /> Kredi Kartı
                  </label>
                  <input
                    type="number"
                    value={cardAmount}
                    onChange={(e) => setCardAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-9 px-2 border rounded text-sm"
                  />
                </div>
              </div>
              
              {/* Toplam gösterimi */}
              <div className={`text-xs p-2 rounded ${isSplitValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                Girilen: {formatCurrency(splitTotal)} / Sipariş: {formatCurrency(totalAmount)}
                {!isSplitValid && splitTotal > 0 && (
                  <span className="block mt-1">Tutarlar eşleşmiyor!</span>
                )}
              </div>
            </div>
          )}

          {/* Butonlar */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-10"
              onClick={onCancel}
              disabled={loading}
            >
              İptal
            </Button>
            <Button
              className="flex-1 h-10 bg-green-600 hover:bg-green-700"
              onClick={handleConfirm}
              disabled={loading || !canConfirm}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Teslim Et
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
