import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  RefreshCw, MapPin, Phone, Clock, User, Bike, Store, Package,
  ChevronRight, ChevronLeft, ChevronDown, Navigation, CheckCircle2, XCircle, AlertCircle,
  Filter, Users, CheckCircle, ClipboardX, ListChecks, Search, ArrowUpDown
} from "lucide-react";

// Yardımcı fonksiyonlar
import {
  ORDER_STATUSES,
  COURIER_ONLY_STATUSES,
  PREPARATION_TIMES,
  getCountdown,
  calculateDistance,
  getOrderDistance,
  sortCouriersByDistanceAndLoad,
  formatCourierDistance,
  getOrderAge,
  getCourierInitials,
  formatTime,
  formatCurrency
} from "@/utils/orderUtils";

// Bileşenler
import { CourierSidebarDesktop, CourierSidebarMobile } from "@/components/siparis/CourierSidebar";
import { OrderDetailModal } from "@/components/siparis/OrderDetailModal";
import { CourierDetailModal } from "@/components/siparis/CourierDetailModal";
import NotificationsPopover from "@/components/admin/NotificationsPopover";
import GecmisSiparislerPage from "./GecmisSiparislerPage";
import IptalSiparislerPage from "./IptalSiparislerPage";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SiparisYonetimiPage({ companyId, adminName, isSuperAdmin = false, adminStatus = "offline", linkedCourierStatus = "offline" }) {
  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [couriersByStatus, setCouriersByStatus] = useState({ active: [], on_break: [], offline: [] });
  const [restaurants, setRestaurants] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilters, setStatusFilters] = useState(["pending", "preparing", "ready", "assigned", "confirmed", "on_the_way"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState("active");
  const [, setTick] = useState(0);
  
  // Pagination ve sıralama state'leri
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("newest"); // "newest" veya "oldest"
  
  // Admin aktif mi kontrolü (süper admin her zaman aktif, admin veya bağlı kurye aktifse de aktif sayılır)
  const isAdminActive = isSuperAdmin || adminStatus === "active" || linkedCourierStatus === "active";
  
  // Modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showOrderDetailModal, setShowOrderDetailModal] = useState(false);
  const [showCourierDetailModal, setShowCourierDetailModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  
  // Çevrimdışı kuryeler açılır-kapanır state (her sipariş için ayrı)
  const [offlineCouriersExpanded, setOfflineCouriersExpanded] = useState({});
  
  // Status confirmation modal
  const [confirmStatusModal, setConfirmStatusModal] = useState({ 
    open: false, 
    orderId: null, 
    newStatus: null, 
    customerName: null,
    orderSource: null  // Platform bilgisi için
  });
  const [cancelReasons, setCancelReasons] = useState([]);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  
  // Shift data for courier status check
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [leaves, setLeaves] = useState([]);
  
  // Mola uyarısı için state
  const [breakWarning, setBreakWarning] = useState(null);
  const [showBreakConfirm, setShowBreakConfirm] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState(null);
  
  // Map ref
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Fetch functions
  const fetchCompany = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompany(res.data);
    } catch (err) {
      console.error("Company fetch error:", err);
    }
  }, [companyId]);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    try {
      // Her zaman tüm aktif siparişleri çek (filtreleme frontend'de yapılacak)
      const res = await axios.get(`${API}/orders/v2/list`, {
        params: {
          panel: 'admin',
          company_id: companyId,
          status: 'active',
          limit: 500
        }
      });
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("Orders fetch error:", err);
    }
  }, [companyId]);

  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers/with-availability`);
      const activeList = (res.data.active || []).map(c => ({...c, availability_status: 'active'}));
      const onBreakList = (res.data.on_break || []).map(c => ({...c, availability_status: 'on_break'}));
      const offlineList = (res.data.offline || []).map(c => ({...c, availability_status: 'offline'}));
      
      setCouriersByStatus({ active: activeList, on_break: onBreakList, offline: offlineList });
      setCouriers([...activeList, ...onBreakList, ...offlineList]);
    } catch (err) {
      console.error("Couriers fetch error:", err);
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

  // Vardiya ve izin verilerini çek
  const fetchShiftData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [shiftsRes, assignmentsRes, leavesRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/shifts`),
        axios.get(`${API}/companies/${companyId}/shift-assignments`),
        axios.get(`${API}/companies/${companyId}/leaves`).catch(() => ({ data: [] }))
      ]);
      setShifts(shiftsRes.data || []);
      setShiftAssignments(assignmentsRes.data || []);
      setLeaves(leavesRes.data || []);
    } catch (err) {
      console.error("Shift data fetch error:", err);
    }
  }, [companyId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchCouriers(), fetchRestaurants(), fetchCompany(), fetchShiftData()]);
    setLoading(false);
  }, [fetchOrders, fetchCouriers, fetchRestaurants, fetchCompany, fetchShiftData]);

  useEffect(() => {
    fetchAll();
    // Performans optimizasyonu: Polling süresini 5s'den 15s'e çıkardık
    const orderInterval = setInterval(fetchOrders, 5000);
    const courierInterval = setInterval(fetchCouriers, 5000);
    
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

  // Filtrelenmiş ve sıralanmış siparişler (durum filtresi + arama + sıralama)
  const filteredAndSortedOrders = useMemo(() => {
    let result = orders;
    
    // Durum filtresi (statusFilters boşsa tüm siparişleri göster)
    if (statusFilters.length > 0) {
      result = result.filter(order => statusFilters.includes(order.status));
    }
    
    // Arama filtresi
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(order => {
        const searchableFields = [
          order.customer_name,
          order.customer_phone,
          order.delivery_address,
          order.restaurant_name,
          order.courier_name,
          order.order_number,
          order.notes,
          order.payment_method_detail,
        ].filter(Boolean).map(f => f.toLowerCase());
        
        return searchableFields.some(field => field.includes(query));
      });
    }
    
    // Sıralama
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    
    return result;
  }, [orders, statusFilters, searchQuery, sortOrder]);

  // Toplam sayfa sayısı
  const totalPages = useMemo(() => {
    return Math.ceil(filteredAndSortedOrders.length / pageSize);
  }, [filteredAndSortedOrders.length, pageSize]);

  // Sayfalanmış siparişler
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedOrders.slice(startIndex, endIndex);
  }, [filteredAndSortedOrders, currentPage, pageSize]);

  // Sayfa değiştiğinde veya filtre değiştiğinde ilk sayfaya dön
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilters, sortOrder, pageSize]);

  // Computed values
  const couriersOnDelivery = useMemo(() => {
    const onTheWayCourierIds = new Set(
      orders.filter(o => o.status === 'on_the_way' && o.courier_id).map(o => o.courier_id)
    );
    const allCouriers = [...couriersByStatus.active, ...couriersByStatus.on_break, ...couriersByStatus.offline];
    return allCouriers.filter(c => onTheWayCourierIds.has(c.id));
  }, [orders, couriersByStatus]);

  const couriersNotOnDelivery = useMemo(() => {
    const onDeliveryIds = new Set(couriersOnDelivery.map(c => c.id));
    return {
      active: couriersByStatus.active.filter(c => !onDeliveryIds.has(c.id)),
      on_break: couriersByStatus.on_break.filter(c => !onDeliveryIds.has(c.id)),
      offline: couriersByStatus.offline.filter(c => !onDeliveryIds.has(c.id))
    };
  }, [couriersByStatus, couriersOnDelivery]);

  const courierPackageCounts = useMemo(() => {
    const counts = {};
    orders.forEach(order => {
      if (order.courier_id && !['delivered', 'cancelled'].includes(order.status)) {
        if (!counts[order.courier_id]) {
          counts[order.courier_id] = { assigned: 0, confirmed: 0, onTheWay: 0 };
        }
        if (order.status === 'on_the_way') counts[order.courier_id].onTheWay++;
        else if (order.status === 'assigned') counts[order.courier_id].assigned++;
        else if (['confirmed', 'preparing'].includes(order.status)) counts[order.courier_id].confirmed++;
      }
    });
    return counts;
  }, [orders]);

  const selectedCourierOrders = selectedCourier 
    ? orders.filter(o => o.courier_id === selectedCourier.id && o.status !== 'delivered' && o.status !== 'cancelled')
    : [];

  const stats = {
    total: orders.length,
    unassigned: orders.filter(o => !o.courier_id && !['delivered', 'cancelled'].includes(o.status)).length,
    onTheWay: orders.filter(o => o.status === 'on_the_way').length,
    delivered: orders.filter(o => o.status === 'delivered').length
  };

  // Countdown timer
  useEffect(() => {
    const hasPreparingOrders = orders.some(o => o.status === 'preparing' && o.preparation_end_at);
    if (!hasPreparingOrders) return;
    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(tickInterval);
  }, [orders]);

  // Map initialization
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => initMap();
      document.body.appendChild(script);
    } else {
      initMap();
    }
    
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const initMap = () => {
    if (!mapRef.current || !window.L || mapInstanceRef.current) return;
    
    // Isparta koordinatları varsayılan olarak
    const centerLat = company?.city_lat || 37.7648;
    const centerLng = company?.city_lng || 30.5566;
    const zoomLevel = 13;
    
    const map = window.L.map(mapRef.current, {
      scrollWheelZoom: false,
      attributionControl: false
    }).setView([centerLat, centerLng], zoomLevel);
    
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);
    
    mapInstanceRef.current = map;
  };

  // Map resize on tab change
  useEffect(() => {
    if (mainTab === "active" && mapInstanceRef.current) {
      const mapContainer = mapRef.current;
      if (!mapContainer) return;
      
      const invalidateMap = () => {
        if (mapInstanceRef.current) {
          mapContainer.style.display = 'none';
          mapContainer.offsetHeight;
          mapContainer.style.display = '';
          mapInstanceRef.current.invalidateSize({ animate: false, pan: false });
        }
      };
      
      requestAnimationFrame(() => {
        invalidateMap();
        setTimeout(invalidateMap, 100);
        setTimeout(invalidateMap, 300);
        setTimeout(invalidateMap, 600);
        
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

  // Center map on company load
  useEffect(() => {
    if (!company?.city_lat || !company?.city_lng) return;
    
    const centerMap = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([company.city_lat, company.city_lng], 13);
        mapInstanceRef.current.invalidateSize();
      } else {
        setTimeout(centerMap, 300);
      }
    };
    centerMap();
  }, [company]);

  // Update markers
  useEffect(() => {
    updateMapMarkers();
  }, [orders, restaurants, couriers, couriersByStatus]);

  const updateMapMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;
    
    const map = mapInstanceRef.current;
    const L = window.L;
    
    markersRef.current.forEach(marker => {
      try { map.removeLayer(marker); } catch (e) {}
    });
    markersRef.current = [];

    // Restaurant markers (düşük zIndex)
    restaurants.forEach(r => {
      if (r.latitude && r.longitude) {
        try {
          const marker = L.marker([r.latitude, r.longitude], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:12px;height:12px;background:#9ca3af;border-radius:50% !important;border:1px solid #6b7280;"></div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            }),
            zIndexOffset: 100  // Restoran marker'ları altta
          }).addTo(map);
          marker.bindPopup(`<strong>${r.name}</strong>`);
          markersRef.current.push(marker);
        } catch (e) {}
      }
    });

    // Courier markers (yüksek zIndex - her zaman üstte)
    const visibleCouriers = [...(couriersByStatus.active || []), ...(couriersByStatus.on_break || [])];
    
    const getCourierColorByOrderStatus = (courier) => {
      const courierOrders = orders.filter(o => 
        o.courier_id === courier.id && o.status !== 'delivered' && o.status !== 'cancelled'
      );
      
      if (courier.availability_status === 'on_break') return { color: '#eab308', label: 'Molada' };
      if (courierOrders.length === 0) return { color: '#22c55e', label: 'Boş' };
      
      const hasOnTheWay = courierOrders.some(o => o.status === 'on_the_way');
      const hasConfirmed = courierOrders.some(o => o.status === 'confirmed');
      const hasAssigned = courierOrders.some(o => o.status === 'assigned');
      
      if (hasOnTheWay) return { color: '#06b6d4', label: 'Yolda' };
      if (hasConfirmed) return { color: '#1e3a8a', label: 'Onaylandı' };
      if (hasAssigned) return { color: '#a855f7', label: 'Onay Bekliyor' };
      
      return { color: '#22c55e', label: 'Aktif' };
    };
    
    visibleCouriers.forEach(courier => {
      if (courier.current_location?.latitude && courier.current_location?.longitude) {
        try {
          const { color: bgColor } = getCourierColorByOrderStatus(courier);
          const initials = getCourierInitials(courier.name);
          
          const marker = L.marker([courier.current_location.latitude, courier.current_location.longitude], {
            icon: L.divIcon({
              className: 'courier-marker',
              html: `
                <div style="position: relative; width: 22px; height: 22px; border-radius: 50% !important; background: transparent !important;">
                  <div class="courier-pulse-ring" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                  <div class="courier-pulse-ring-delayed" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                  <div style="
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: ${bgColor}; width: 20px; height: 20px; border-radius: 50% !important;
                    border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                    display: flex; align-items: center; justify-content: center;
                    color: white; font-size: 8px; font-weight: 700;
                  ">${initials}</div>
                </div>
              `,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            }),
            zIndexOffset: 1000  // Kurye marker'ları her zaman üstte
          }).addTo(map);
          marker.on('click', () => {
            setSelectedCourier(courier);
            setShowCourierDetailModal(true);
          });
          markersRef.current.push(marker);
        } catch (e) {}
      }
    });
  };

  // Handlers
  const handleUpdateCourierStatus = async (courierId, newStatus) => {
    try {
      await axios.put(`${API}/couriers/${courierId}/availability`, {
        availability_status: newStatus,
        force: true
      });
      fetchCouriers();
      if (selectedCourier && selectedCourier.id === courierId) {
        setSelectedCourier({...selectedCourier, availability_status: newStatus});
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye durumu güncellenemedi");
    }
  };

  // Mola kontrolü ve atama
  const checkBreakAndAssign = async (courierId) => {
    try {
      // Mola durumunu kontrol et
      const breakRes = await axios.get(`${API}/couriers/${courierId}/break-queue-status`);
      
      if (breakRes.data.warning) {
        // Uyarı var - onay al
        setBreakWarning(breakRes.data.warning);
        setPendingAssignment({ courierId });
        setShowBreakConfirm(true);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Mola kontrolü hatası:", err);
      return true; // Hata durumunda devam et
    }
  };

  const handleAssignCourier = async () => {
    if (!selectedOrder || !selectedCourierId) return;
    
    const courier = couriers.find(c => c.id === selectedCourierId);
    
    // Önce mola kontrolü yap
    const canProceed = await checkBreakAndAssign(selectedCourierId);
    if (!canProceed) {
      // Onay beklenecek
      return;
    }
    
    // Atamayı gerçekleştir
    await performAssignment(selectedCourierId, courier);
  };

  const performAssignment = async (courierId, courier) => {
    setShowAssignModal(false);
    setShowBreakConfirm(false);
    setSelectedCourierId("");
    setPendingAssignment(null);
    setBreakWarning(null);
    
    try {
      await axios.post(`${API}/orders/${companyId}/${selectedOrder.id}/assign`, {
        courier_id: courierId,
        admin_name: adminName || "Admin"
      });
      
      // API başarılı - sadece bu siparişi güncelle
      setOrders(prev => prev.map(order => {
        if (order.id === selectedOrder.id) {
          return {
            ...order,
            status: 'assigned',
            courier_id: courierId,
            courier_name: courier?.name || '',
            assigned_at: new Date().toISOString()
          };
        }
        return order;
      }));
    } catch (err) {
      toast.error("Kurye atanamadı");
    }
  };

  const handleBreakConfirmAssign = () => {
    if (pendingAssignment) {
      const courier = couriers.find(c => c.id === pendingAssignment.courierId);
      performAssignment(pendingAssignment.courierId, courier);
    }
  };

  const handleUnassignCourier = async (orderId) => {
    try {
      await axios.delete(`${API}/orders/${companyId}/${orderId}/assign?admin_name=${encodeURIComponent(adminName || "Admin")}`);
      
      // API başarılı - sadece bu siparişi güncelle
      setOrders(prev => prev.map(order => {
        if (order.id === orderId) {
          return {
            ...order,
            status: 'ready',
            courier_id: null,
            courier_name: null,
            assigned_at: null,
            confirmed_at: null
          };
        }
        return order;
      }));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kurye ataması kaldırılamadı");
    }
  };

  const handleReassignCourier = async (orderId, courierId) => {
    const courier = couriers.find(c => c.id === courierId);
    
    try {
      await axios.post(`${API}/orders/${companyId}/${orderId}/assign`, {
        courier_id: courierId,
        admin_name: adminName || "Admin"
      });
      
      // API başarılı - sadece bu siparişi güncelle
      setOrders(prev => prev.map(order => {
        if (order.id === orderId) {
          return {
            ...order,
            status: 'assigned',
            courier_id: courierId,
            courier_name: courier?.name || '',
            assigned_at: new Date().toISOString()
          };
        }
        return order;
      }));
    } catch (err) {
      toast.error("Kurye atanamadı");
    }
  };

  const focusMapOnCourier = useCallback((courier) => {
    if (!mapInstanceRef.current || !courier.current_location?.latitude) return;
    mapInstanceRef.current.setView(
      [courier.current_location.latitude, courier.current_location.longitude],
      14, { animate: true, duration: 0.5 }
    );
  }, []);

  const handleCourierClick = (courier) => {
    if (courier.availability_status !== 'offline') focusMapOnCourier(courier);
    setSelectedCourier(courier);
    setShowCourierDetailModal(true);
  };

  const handleCourierHover = useCallback((courier) => {
    if (courier.availability_status === 'offline') return;
    focusMapOnCourier(courier);
  }, [focusMapOnCourier]);

  // Onay gerektiren durum değişikliği kontrolü
  const handleStatusChangeRequest = (orderId, newStatus, preparationTime = null, customerName = null, orderSource = null) => {
    // Teslim edildi veya iptal edildi için onay iste
    if (newStatus === 'delivered' || newStatus === 'cancelled') {
      setConfirmStatusModal({ open: true, orderId, newStatus, customerName, preparationTime, orderSource });
      // İptal durumunda sebepleri yükle
      if (newStatus === 'cancelled' && orderSource) {
        fetchCancelReasons(orderSource);
      }
    } else {
      handleUpdateStatus(orderId, newStatus, preparationTime);
    }
  };

  // İptal sebeplerini yükle
  const fetchCancelReasons = async (source) => {
    try {
      const res = await axios.get(`${API}/orders/platform-cancel-reasons/${source}`);
      setCancelReasons(res.data.reasons || []);
    } catch (err) {
      console.error("İptal sebepleri yüklenemedi:", err);
      setCancelReasons([]);
    }
  };

  // Onaylanan durum değişikliği
  const handleConfirmStatusChange = () => {
    const { orderId, newStatus, preparationTime } = confirmStatusModal;
    handleUpdateStatus(orderId, newStatus, preparationTime, selectedCancelReason, cancelNote);
    setConfirmStatusModal({ open: false, orderId: null, newStatus: null, customerName: null, orderSource: null });
    setSelectedCancelReason("");
    setCancelNote("");
    setCancelReasons([]);
  };

  const handleUpdateStatus = async (orderId, newStatus, preparationTime = null, cancelReasonId = null, cancelNoteText = null) => {
    try {
      const payload = { status: newStatus, admin_name: adminName || "Admin" };
      if (preparationTime) payload.preparation_time = parseInt(preparationTime);
      if (cancelReasonId) payload.cancel_reason_id = cancelReasonId;
      if (cancelNoteText) payload.cancel_note = cancelNoteText;
      
      await axios.post(`${API}/orders/${companyId}/${orderId}/status`, payload);
      
      // API başarılı - sadece bu siparişi güncelle
      setOrders(prev => prev.map(order => {
        if (order.id === orderId) {
          const updatedOrder = { ...order, status: newStatus };
          if (preparationTime) {
            updatedOrder.preparation_time = parseInt(preparationTime);
            const endAt = new Date(Date.now() + preparationTime * 60 * 1000);
            updatedOrder.preparation_end_at = endAt.toISOString();
          } else {
            updatedOrder.preparation_time = null;
            updatedOrder.preparation_end_at = null;
          }
          if (['preparing', 'ready', 'cancelled'].includes(newStatus)) {
            updatedOrder.courier_id = null;
            updatedOrder.courier_name = null;
          }
          if (newStatus === 'delivered') {
            updatedOrder.delivered_at = new Date().toISOString();
          }
          return updatedOrder;
        }
        return order;
      }));
      
      // Başarı mesajı
      if (newStatus === 'delivered') {
        toast.success("Sipariş teslim edildi olarak işaretlendi");
      } else if (newStatus === 'cancelled') {
        toast.success("Sipariş iptal edildi olarak işaretlendi");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Durum güncellenemedi");
    }
  };

  return (
    <div data-testid="siparis-yonetimi-page" className="space-y-4">
      {/* Header with tabs - MASAÜSTÜ */}
      <div className="hidden sm:flex sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="font-heading text-xl font-bold tracking-tight">Sipariş Yönetimi</h2>
          <div className="flex border-2 rounded-lg overflow-hidden">
            <button
              onClick={() => setMainTab("active")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                mainTab === "active" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Aktif
            </button>
            <button
              onClick={() => setMainTab("delivered")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors border-l flex items-center justify-center gap-1.5 ${
                mainTab === "delivered" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Teslim
            </button>
            <button
              onClick={() => setMainTab("cancelled")}
              className={`flex-1 min-w-[100px] px-4 py-1.5 text-sm font-medium transition-colors border-l flex items-center justify-center gap-1.5 ${
                mainTab === "cancelled" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
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
            <NotificationsPopover companyId={companyId} />
          </div>
        )}
      </div>

      {/* Header with tabs - MOBİL */}
      <div className="sm:hidden space-y-3">
        {/* Başlık Satırı */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold tracking-tight">Sipariş Yönetimi</h2>
          {mainTab === "active" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchAll} className="h-8 px-2">
                <RefreshCw className="w-4 h-4" />
              </Button>
              <NotificationsPopover companyId={companyId} />
            </div>
          )}
        </div>
        
        {/* Sekmeler - Tam Genişlik */}
        <div className="flex border-2 rounded-lg overflow-hidden">
          <button
            onClick={() => setMainTab("active")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              mainTab === "active" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            Aktif
          </button>
          <button
            onClick={() => setMainTab("delivered")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l flex items-center justify-center gap-1 ${
              mainTab === "delivered" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Teslim
          </button>
          <button
            onClick={() => setMainTab("cancelled")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-l flex items-center justify-center gap-1 ${
              mainTab === "cancelled" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <ClipboardX className="w-3.5 h-3.5" />
            İptal
          </button>
        </div>
        
        {/* İstatistikler - Sadece Aktif Sekmede */}
        {mainTab === "active" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-full text-xs whitespace-nowrap">
              <Package className="w-3 h-3 text-slate-500" />
              <span className="font-semibold text-slate-600">{stats.total}</span>
            </span>
            {stats.unassigned > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-full text-xs text-orange-600 whitespace-nowrap">
                <AlertCircle className="w-3 h-3" />
                <span className="font-semibold">{stats.unassigned}</span>
                <span>bekliyor</span>
              </span>
            )}
            {stats.onTheWay > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 bg-cyan-100 rounded-full text-xs text-cyan-600 whitespace-nowrap">
                <Bike className="w-3 h-3" />
                <span className="font-semibold">{stats.onTheWay}</span>
                <span>yolda</span>
              </span>
            )}
            {stats.delivered > 0 && (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full text-xs text-green-600 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3" />
                <span className="font-semibold">{stats.delivered}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sub-pages */}
      {mainTab === "delivered" && (
        <GecmisSiparislerPage 
          key="gecmis" 
          companyId={companyId} 
          onOrderSelect={(order) => { setSelectedOrder(order); setShowOrderDetailModal(true); }}
          isSuperAdmin={isSuperAdmin}
          adminName={adminName}
        />
      )}
      {mainTab === "cancelled" && (
        <IptalSiparislerPage 
          key="iptal" 
          companyId={companyId}
          onOrderSelect={(order) => { setSelectedOrder(order); setShowOrderDetailModal(true); }}
          isSuperAdmin={isSuperAdmin}
        />
      )}
      
      {/* Active tab content */}
      <div style={{ display: mainTab === "active" ? "block" : "none" }}>
        {/* Stats - Sadece Masaüstü */}
        <div className="hidden sm:flex items-center gap-3 text-sm">
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

        {/* Mobile Courier List */}
        <CourierSidebarMobile
          couriersNotOnDelivery={couriersNotOnDelivery}
          couriersOnDelivery={couriersOnDelivery}
          courierPackageCounts={courierPackageCounts}
          onCourierClick={handleCourierClick}
          onCourierHover={handleCourierHover}
        />

        {/* Map with Courier List */}
        <div className="flex gap-4">
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Canlı Harita
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={mapRef} className="w-full h-[280px] sm:h-[350px] md:h-[450px] lg:h-[520px] rounded-b-lg" style={{ zIndex: 1 }} />
            </CardContent>
          </Card>

          <CourierSidebarDesktop
            couriersNotOnDelivery={couriersNotOnDelivery}
            couriersOnDelivery={couriersOnDelivery}
            courierPackageCounts={courierPackageCounts}
            onCourierClick={handleCourierClick}
            onCourierHover={handleCourierHover}
            shifts={shifts}
            shiftAssignments={shiftAssignments}
            leaves={leaves}
          />
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6">
            {/* Desktop Header */}
            <div className="hidden sm:flex sm:flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-base whitespace-nowrap">
                  Siparişler ({filteredAndSortedOrders.length}{searchQuery && ` / ${orders.length}`})
                </CardTitle>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="h-7 w-[140px] text-xs" data-testid="sort-order-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Yeniden Eskiye</SelectItem>
                      <SelectItem value="oldest">Eskiden Yeniye</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Göster:</span>
                  <Select value={pageSize.toString()} onValueChange={(val) => setPageSize(parseInt(val))}>
                    <SelectTrigger className="h-7 w-[70px] text-xs" data-testid="page-size-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { value: "preparing", label: "Hazırlanıyor", color: "bg-yellow-500/30 text-yellow-700 border-yellow-400/50", activeColor: "bg-yellow-500/30 text-yellow-800 border-yellow-500/70" },
                  { value: "ready", label: "Hazır", color: "bg-orange-500/30 text-orange-700 border-orange-400/50", activeColor: "bg-orange-500/30 text-orange-800 border-orange-500/70" },
                  { value: "assigned", label: "Atandı", color: "bg-purple-500/30 text-purple-700 border-purple-400/50", activeColor: "bg-purple-500/30 text-purple-800 border-purple-500/70" },
                  { value: "confirmed", label: "Onaylandı", color: "bg-blue-500/30 text-blue-700 border-blue-400/50", activeColor: "bg-blue-500/30 text-blue-800 border-blue-500/70" },
                  { value: "on_the_way", label: "Yolda", color: "bg-cyan-500/30 text-cyan-700 border-cyan-400/50", activeColor: "bg-cyan-500/30 text-cyan-800 border-cyan-500/70" },
                ].map((status) => {
                  const count = orders.filter(o => o.status === status.value).length;
                  const isActive = statusFilters.includes(status.value);
                  return (
                    <button
                      key={status.value}
                      onClick={() => setStatusFilters(prev => prev.includes(status.value) ? prev.filter(s => s !== status.value) : [...prev, status.value])}
                      className={`px-2 py-0.5 text-xs rounded border transition-all flex items-center gap-1 ${isActive ? status.activeColor + " font-medium shadow-sm ring-1 ring-inset ring-current/20" : status.color + " opacity-70 hover:opacity-100"}`}
                    >
                      {status.label}
                      <span className="text-[10px] font-bold">({count})</span>
                    </button>
                  );
                })}
                <div className="border-l pl-1 ml-0.5 flex gap-0.5">
                  <button onClick={() => setStatusFilters(["preparing", "ready", "assigned", "confirmed", "on_the_way"])} className="px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50 rounded">Tümü</button>
                  <button onClick={() => setStatusFilters([])} className="px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 rounded">Temizle</button>
                </div>
              </div>
            </div>

            {/* Mobile Header - Kompakt */}
            <div className="sm:hidden space-y-2">
              {/* Satır 1: Başlık + Arama + Sıralama + Sayfa */}
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                  {filteredAndSortedOrders.length}
                </span>
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-7 text-xs"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-7 w-9 px-0 justify-center border-slate-200" data-testid="sort-order-mobile">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Yeniden Eskiye</SelectItem>
                    <SelectItem value="oldest">Eskiden Yeniye</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Satır 2: Durum Filtreleri - yatay scroll */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-1 px-1">
                {[
                  { value: "preparing", label: "Hazır.", color: "bg-yellow-100 text-yellow-700 border-yellow-300", activeColor: "bg-yellow-200 text-yellow-800 border-yellow-400" },
                  { value: "ready", label: "Hazır", color: "bg-orange-100 text-orange-700 border-orange-300", activeColor: "bg-orange-200 text-orange-800 border-orange-400" },
                  { value: "assigned", label: "Ata.", color: "bg-purple-100 text-purple-700 border-purple-300", activeColor: "bg-purple-200 text-purple-800 border-purple-400" },
                  { value: "confirmed", label: "Onay", color: "bg-blue-100 text-blue-700 border-blue-300", activeColor: "bg-blue-200 text-blue-800 border-blue-400" },
                  { value: "on_the_way", label: "Yolda", color: "bg-cyan-100 text-cyan-700 border-cyan-300", activeColor: "bg-cyan-200 text-cyan-800 border-cyan-400" },
                ].map((status) => {
                  const count = orders.filter(o => o.status === status.value).length;
                  const isActive = statusFilters.includes(status.value);
                  return (
                    <button
                      key={status.value}
                      onClick={() => setStatusFilters(prev => prev.includes(status.value) ? prev.filter(s => s !== status.value) : [...prev, status.value])}
                      className={`px-2 py-1 text-[11px] rounded-full border whitespace-nowrap transition-all flex items-center gap-1 ${isActive ? status.activeColor + " font-semibold shadow-sm" : status.color + " opacity-60"}`}
                    >
                      {status.label}
                      <span className="text-[10px] font-bold">{count}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => statusFilters.length === 5 ? setStatusFilters([]) : setStatusFilters(["preparing", "ready", "assigned", "confirmed", "on_the_way"])}
                  className="px-2 py-1 text-[11px] rounded-full border border-slate-200 text-slate-500 whitespace-nowrap hover:bg-slate-100"
                >
                  {statusFilters.length === 5 ? "Temizle" : "Tümü"}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAndSortedOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                {searchQuery ? (
                  <p>"{searchQuery}" için sonuç bulunamadı</p>
                ) : orders.length === 0 ? (
                  <p>Sipariş bulunamadı</p>
                ) : (
                  <p>Seçili filtrelere uygun sipariş yok</p>
                )}
              </div>
            ) : (
              <>
                {/* MASAÜSTÜ: Tablo Görünümü (md ve üstü) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary">
                        <th className="text-left p-2 font-bold text-xs whitespace-nowrap">Zaman</th>
                        <th className="text-left p-2 font-bold text-xs">Restoran</th>
                        <th className="text-left p-2 font-bold text-xs">Müşteri</th>
                        <th className="text-left p-2 font-bold text-xs">Adres</th>
                        <th className="text-left p-2 font-bold text-xs">Mesafe</th>
                        <th className="text-left p-2 font-bold text-xs">Ücret</th>
                        <th className="text-left p-2 font-bold text-xs">Ödeme</th>
                        <th className="text-left p-2 font-bold text-xs">Durum</th>
                        <th className="text-left p-2 font-bold text-xs">Kurye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order) => {
                        const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                        const orderAge = getOrderAge(order);
                        
                        return (
                          <tr 
                            key={order.id}
                            className="border-b hover:bg-slate-50 cursor-pointer transition-colors align-top"
                            onClick={(e) => {
                              if (e.target.closest('[data-radix-select-trigger]') || e.target.closest('[data-radix-select-content]') || e.target.closest('[role="combobox"]') || e.target.closest('[role="option"]') || e.target.closest('button')) return;
                              setSelectedOrder(order);
                              setShowOrderDetailModal(true);
                            }}
                            data-testid={`order-row-${order.id}`}
                          >
                            <td className="p-2 text-xs whitespace-nowrap">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1">
                                  <span>{formatTime(order.created_at)}</span>
                                  {!['delivered', 'cancelled'].includes(order.status) && orderAge && (
                                    <span className={`text-[10px] px-1 py-0.5 rounded ${orderAge.mins > 35 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                      {orderAge.text}
                                    </span>
                                  )}
                                </div>
                                {order.getir_raw?.isScheduled && order.getir_raw?.scheduledDate && (
                                  <span className="text-[10px] text-purple-600 font-medium">
                                    {formatTime(order.getir_raw.scheduledDate)} İleri Tarih
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <span className="px-2 py-1 bg-slate-100 text-slate-800 text-xs font-semibold rounded border border-slate-200">
                                {order.restaurant_name || "-"}
                              </span>
                            </td>
                            <td className="p-2 max-w-[140px]">
                              <div>
                                <span className="text-sm">{order.customer_name || "-"}</span>
                                {order.customer_phone && (
                                  <div className="text-xs text-muted-foreground font-mono truncate" title={order.customer_phone}>
                                    {order.customer_phone.includes(',,') 
                                      ? order.customer_phone.split(',,')[0] + ' 📞'
                                      : order.customer_phone
                                    }
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-xs max-w-[280px] align-top" title={order.delivery_address}>
                              <div className="line-clamp-3 leading-relaxed">{order.delivery_address || "-"}</div>
                            </td>
                            <td className="p-2 text-xs whitespace-nowrap">{getOrderDistance(order) || "-"}</td>
                            <td className="p-2 font-semibold whitespace-nowrap">{formatCurrency(order.total_amount)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                order.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : 
                                order.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 
                                (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {order.payment_method === 'cash' ? 'Nakit' : 
                                 order.payment_method === 'card' ? 'Kart' : 
                                 (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? (order.payment_method_detail || 'Yemek Kartı') : 
                                 'Online'}
                              </span>
                            </td>
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              {isAdminActive ? (
                              <Select 
                                value={order.status} 
                                onValueChange={(newValue) => {
                                  if (newValue.startsWith('preparing_')) {
                                    handleStatusChangeRequest(order.id, 'preparing', parseInt(newValue.split('_')[1]), order.customer_name, order.source);
                                  } else {
                                    handleStatusChangeRequest(order.id, newValue, null, order.customer_name, order.source);
                                  }
                                }}
                              >
                                <SelectTrigger className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-0.5 h-7 border border-slate-300/50 min-w-[90px] shadow-sm`}>
                                  <SelectValue>
                                    {(order.status === 'preparing' || order.status === 'scheduled') && order.preparation_end_at
                                      ? getCountdown(order.preparation_end_at)?.text || statusInfo.label
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
                              ) : (
                                <span className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-1 rounded border border-slate-300/50`}>
                                  {statusInfo.label}
                                </span>
                              )}
                            </td>
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              {isAdminActive ? (
                              <Select 
                                value={order.courier_id || ""}
                                onValueChange={(value) => {
                                  if (value === "__remove__") handleUnassignCourier(order.id);
                                  else if (value) handleReassignCourier(order.id, value);
                                }}
                              >
                                <SelectTrigger className={`h-7 px-2 text-xs min-w-[100px] ${
                                  order.courier_name ? "bg-green-100 border-green-200 text-green-700 font-medium" : "bg-slate-50 border-slate-200"
                                }`}>
                                  <Bike className="w-3 h-3 mr-1" />
                                  <span className="truncate">{order.courier_name || "Ata"}</span>
                                </SelectTrigger>
                                <SelectContent className="min-w-[280px]">
                                  {(() => {
                                    const restaurant = restaurants.find(r => r.id === order.restaurant_id);
                                    const blockedCourierIds = new Set(restaurant?.blocked_couriers || []);
                                    const orderPaymentMethod = order.payment_method || "cash";
                                    
                                    const filterCouriers = (courierList) => courierList.filter(c => {
                                      if (blockedCourierIds.has(c.id)) return false;
                                      const allowedMethods = c.allowed_payment_methods || ["cash", "card", "online", "meal_card", "online_meal_card"];
                                      const normalizedPayment = orderPaymentMethod?.includes("meal_card") ? "meal_card" : orderPaymentMethod;
                                      return allowedMethods.includes(orderPaymentMethod) || allowedMethods.includes(normalizedPayment);
                                    });
                                    
                                    const sortedActive = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.active, order.restaurant_location, orders));
                                    const sortedOnBreak = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.on_break, order.restaurant_location, orders));
                                    const sortedOffline = filterCouriers(couriersByStatus.offline || []);
                                    
                                    const renderCourierItem = (c, showDistance = true) => (
                                      <SelectItem key={c.id} value={c.id} className="text-slate-900 hover:!bg-orange-500 hover:!text-white focus:!bg-orange-500 focus:!text-white pr-10">
                                        <div className="flex items-center justify-between w-full gap-2">
                                          <span className="font-medium">{c.name}</span>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {showDistance && formatCourierDistance(c.distanceToRestaurant) && (
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
                                            {sortedActive.map(c => renderCourierItem(c, true))}
                                          </>
                                        )}
                                        {sortedOnBreak.length > 0 && (
                                          <>
                                            <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">Molada</div>
                                            {sortedOnBreak.map(c => renderCourierItem(c, true))}
                                          </>
                                        )}
                                        {sortedOffline.length > 0 && (
                                          <>
                                            <div 
                                              className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1 cursor-pointer hover:bg-slate-200 flex items-center justify-between"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setOfflineCouriersExpanded(prev => ({
                                                  ...prev,
                                                  [order.id]: !prev[order.id]
                                                }));
                                              }}
                                            >
                                              <span>Çevrimdışı ({sortedOffline.length})</span>
                                              <ChevronDown className={`w-3 h-3 transition-transform ${offlineCouriersExpanded[order.id] ? 'rotate-180' : ''}`} />
                                            </div>
                                            {offlineCouriersExpanded[order.id] && sortedOffline.map(c => renderCourierItem(c, false))}
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
                              ) : (
                                <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                                  order.courier_name ? "bg-green-100 text-green-700 font-medium" : "bg-slate-100 text-slate-500"
                                }`}>
                                  <Bike className="w-3 h-3" />
                                  {order.courier_name || "-"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* MOBİL: Kart Görünümü (md altı) */}
                <div className="md:hidden grid grid-cols-1 gap-2">
                  {paginatedOrders.map((order) => {
                    const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                    const orderAge = getOrderAge(order);
                    
                    // Kurye listesi için yardımcı fonksiyonlar
                    const restaurant = restaurants.find(r => r.id === order.restaurant_id);
                    const blockedCourierIds = new Set(restaurant?.blocked_couriers || []);
                    const orderPaymentMethod = order.payment_method || "cash";
                    
                    const filterCouriers = (courierList) => courierList.filter(c => {
                      if (blockedCourierIds.has(c.id)) return false;
                      const allowedMethods = c.allowed_payment_methods || ["cash", "card", "online", "meal_card", "online_meal_card"];
                      const normalizedPayment = orderPaymentMethod?.includes("meal_card") ? "meal_card" : orderPaymentMethod;
                      return allowedMethods.includes(orderPaymentMethod) || allowedMethods.includes(normalizedPayment);
                    });
                    
                    const sortedActive = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.active, order.restaurant_location, orders));
                    const sortedOnBreak = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.on_break, order.restaurant_location, orders));
                    const sortedOffline = filterCouriers(couriersByStatus.offline || []);
                    
                    const renderCourierItem = (c, showDistance = true) => (
                      <SelectItem key={c.id} value={c.id} className="text-slate-900 hover:!bg-orange-500 hover:!text-white focus:!bg-orange-500 focus:!text-white pr-10">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="font-medium">{c.name}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {showDistance && formatCourierDistance(c.distanceToRestaurant) && (
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
                      <div 
                        key={order.id}
                        className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer"
                        onClick={(e) => {
                          if (e.target.closest('[data-radix-select-trigger]') || e.target.closest('[data-radix-select-content]') || e.target.closest('[role="combobox"]') || e.target.closest('[role="option"]') || e.target.closest('button')) return;
                          setSelectedOrder(order);
                          setShowOrderDetailModal(true);
                        }}
                        data-testid={`order-card-${order.id}`}
                      >
                        {/* Üst Kısım: Restoran + Mesafe + Ödeme + Ücret + Zaman */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/50 rounded-t-lg">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="px-2 py-1 bg-slate-700 text-white text-[11px] font-semibold rounded truncate">
                              {order.restaurant_name || "-"}
                            </span>
                            <span className="text-[10px] text-slate-500 flex-shrink-0">{getOrderDistance(order) || "-"}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                              order.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' : 
                              order.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 
                              (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {order.payment_method === 'cash' ? 'Nakit' : 
                               order.payment_method === 'card' ? 'Kart' : 
                               (order.payment_method === 'meal_card' || order.payment_method === 'online_meal_card') ? (order.payment_method_detail || 'Y.Kartı') : 
                               'Online'}
                            </span>
                            <span className="text-xs font-bold text-slate-800 flex-shrink-0">{formatCurrency(order.total_amount)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-shrink-0 ml-1">
                            <span className="font-medium">{formatTime(order.created_at)}</span>
                            {!['delivered', 'cancelled'].includes(order.status) && orderAge && (
                              <span className={`px-1 py-0.5 rounded font-medium ${orderAge.mins > 35 ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'}`}>
                                {orderAge.text}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Orta Kısım: Müşteri Bilgileri */}
                        <div className="px-3 py-2 space-y-2">
                          {/* Müşteri Adı ve Telefon */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="font-medium text-sm text-slate-800">{order.customer_name || "-"}</span>
                            </div>
                            {order.customer_phone && (
                              <a 
                                href={`tel:${order.customer_phone.includes(',,') ? order.customer_phone.split(',,')[0] : order.customer_phone}`}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="w-3 h-3" />
                                <span className="font-mono">
                                  {order.customer_phone.includes(',,') 
                                    ? order.customer_phone.split(',,')[0]
                                    : order.customer_phone
                                  }
                                </span>
                              </a>
                            )}
                          </div>
                          
                          {/* Adres - 3 satıra kadar */}
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed" title={order.delivery_address}>
                              {order.delivery_address || "-"}
                            </p>
                          </div>
                          
                          {/* İleri tarihli sipariş */}
                          {order.getir_raw?.isScheduled && order.getir_raw?.scheduledDate && (
                            <div className="flex items-center gap-1 text-[11px] text-purple-600 font-medium bg-purple-50 px-2 py-1 rounded">
                              <Clock className="w-3 h-3" />
                              {formatTime(order.getir_raw.scheduledDate)} İleri Tarih
                            </div>
                          )}
                        </div>
                        
                        {/* Alt Kısım: Durum ve Kurye Seçimi */}
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/30 rounded-b-lg" onClick={(e) => e.stopPropagation()}>
                          {/* Durum Seçici */}
                          {isAdminActive ? (
                            <Select 
                              value={order.status} 
                              onValueChange={(newValue) => {
                                if (newValue.startsWith('preparing_')) {
                                  handleStatusChangeRequest(order.id, 'preparing', parseInt(newValue.split('_')[1]), order.customer_name, order.source);
                                } else {
                                  handleStatusChangeRequest(order.id, newValue, null, order.customer_name, order.source);
                                }
                              }}
                            >
                              <SelectTrigger className={`${statusInfo.color} text-slate-700 font-medium text-xs px-3 py-1 h-8 border border-slate-300/50 flex-1 shadow-sm`}>
                                <SelectValue>
                                  {(order.status === 'preparing' || order.status === 'scheduled') && order.preparation_end_at
                                    ? getCountdown(order.preparation_end_at)?.text || statusInfo.label
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
                          ) : (
                            <span className={`${statusInfo.color} text-slate-700 font-medium text-xs px-3 py-1.5 rounded border border-slate-300/50 flex-1 text-center`}>
                              {statusInfo.label}
                            </span>
                          )}
                          
                          {/* Kurye Seçici */}
                          {isAdminActive ? (
                            <Select 
                              value={order.courier_id || ""}
                              onValueChange={(value) => {
                                if (value === "__remove__") handleUnassignCourier(order.id);
                                else if (value) handleReassignCourier(order.id, value);
                              }}
                            >
                              <SelectTrigger className={`h-8 px-3 text-xs flex-1 ${
                                order.courier_name ? "bg-green-100 border-green-200 text-green-700 font-medium" : "bg-white border-slate-200"
                              }`}>
                                <Bike className="w-3.5 h-3.5 mr-1.5" />
                                <span className="truncate">{order.courier_name || "Kurye Ata"}</span>
                              </SelectTrigger>
                              <SelectContent className="min-w-[280px]">
                                {sortedActive.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">Aktif</div>
                                    {sortedActive.map(c => renderCourierItem(c, true))}
                                  </>
                                )}
                                {sortedOnBreak.length > 0 && (
                                  <>
                                    <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">Molada</div>
                                    {sortedOnBreak.map(c => renderCourierItem(c, true))}
                                  </>
                                )}
                                {sortedOffline.length > 0 && (
                                  <>
                                    <div 
                                      className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1 cursor-pointer hover:bg-slate-200 flex items-center justify-between"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOfflineCouriersExpanded(prev => ({
                                          ...prev,
                                          [order.id]: !prev[order.id]
                                        }));
                                      }}
                                    >
                                      <span>Çevrimdışı ({sortedOffline.length})</span>
                                      <ChevronDown className={`w-3 h-3 transition-transform ${offlineCouriersExpanded[order.id] ? 'rotate-180' : ''}`} />
                                    </div>
                                    {offlineCouriersExpanded[order.id] && sortedOffline.map(c => renderCourierItem(c, false))}
                                  </>
                                )}
                                {order.courier_id && order.status !== 'on_the_way' && order.status !== 'delivered' && (
                                  <>
                                    <div className="border-t my-1" />
                                    <SelectItem value="__remove__" className="text-red-600">Kurye Kaldır</SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`text-xs px-3 py-1.5 rounded flex items-center justify-center gap-1.5 flex-1 ${
                              order.courier_name ? "bg-green-100 text-green-700 font-medium" : "bg-slate-100 text-slate-500"
                            }`}>
                              <Bike className="w-3.5 h-3.5" />
                              {order.courier_name || "-"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
                
            {/* Pagination */}
            {paginatedOrders.length > 0 && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t" data-testid="pagination-controls">
                <div className="text-xs text-muted-foreground">
                  Toplam {filteredAndSortedOrders.length} sipariş, Sayfa {currentPage} / {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="h-8 px-2 text-xs"
                    data-testid="pagination-first"
                  >
                    İlk
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2"
                    data-testid="pagination-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  {/* Sayfa numaraları */}
                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = [];
                      const maxVisiblePages = 5;
                      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
                      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
                      
                      if (endPage - startPage + 1 < maxVisiblePages) {
                        startPage = Math.max(1, endPage - maxVisiblePages + 1);
                      }
                      
                      for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                          <Button
                            key={i}
                            variant={i === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(i)}
                            className={`h-8 w-8 text-xs ${i === currentPage ? "bg-primary text-white" : ""}`}
                            data-testid={`pagination-page-${i}`}
                          >
                            {i}
                          </Button>
                        );
                      }
                      return pages;
                    })()}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-2"
                    data-testid="pagination-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="h-8 px-2 text-xs"
                    data-testid="pagination-last"
                  >
                    Son
                  </Button>
                </div>
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
                <SelectContent className="min-w-[350px]">
                  {(() => {
                    // Get blocked couriers for this restaurant
                    const restaurant = restaurants.find(r => r.id === selectedOrder?.restaurant_id);
                    const blockedCourierIds = new Set(restaurant?.blocked_couriers || []);
                    
                    // Get order payment method
                    const orderPaymentMethod = selectedOrder?.payment_method || "cash";
                    
                    // Filter out blocked couriers and couriers who don't accept this payment method
                    const filterCouriers = (courierList) => courierList.filter(c => {
                      // Check if blocked
                      if (blockedCourierIds.has(c.id)) return false;
                      // Check if courier accepts this payment method
                      const allowedMethods = c.allowed_payment_methods || ["cash", "card", "online", "meal_card", "online_meal_card"];
                      // Normalize payment method for comparison (treat meal_card variants the same)
                      const normalizedPayment = orderPaymentMethod?.includes("meal_card") ? "meal_card" : orderPaymentMethod;
                      return allowedMethods.includes(orderPaymentMethod) || allowedMethods.includes(normalizedPayment);
                    });
                    
                    const sortedActive = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.active, selectedOrder?.restaurant_location, orders));
                    const sortedOnBreak = filterCouriers(sortCouriersByDistanceAndLoad(couriersByStatus.on_break, selectedOrder?.restaurant_location, orders));
                    const sortedOffline = filterCouriers(couriersByStatus.offline || []);
                    
                    const renderCourierItem = (courier, statusColor, showDistance = true) => (
                      <SelectItem key={courier.id} value={courier.id} className="text-slate-900 hover:!bg-orange-500 hover:!text-white focus:!bg-orange-500 focus:!text-white pr-10">
                        <div className="flex items-center justify-between w-full gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                            <span className="font-medium">{courier.name}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {showDistance && formatCourierDistance(courier.distanceToRestaurant) && (
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
                        {sortedActive.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-semibold text-green-700 bg-green-50">Aktif Kuryeler</div>
                            {sortedActive.map(c => renderCourierItem(c, 'bg-green-500', true))}
                          </>
                        )}
                        {sortedOnBreak.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 mt-1">Molada</div>
                            {sortedOnBreak.map(c => renderCourierItem(c, 'bg-yellow-500', true))}
                          </>
                        )}
                        {sortedOffline.length > 0 && (
                          <>
                            <div 
                              className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 mt-1 cursor-pointer hover:bg-slate-200 flex items-center justify-between"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setOfflineCouriersExpanded(prev => ({
                                  ...prev,
                                  modal: !prev.modal
                                }));
                              }}
                            >
                              <span>Çevrimdışı ({sortedOffline.length})</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${offlineCouriersExpanded.modal ? 'rotate-180' : ''}`} />
                            </div>
                            {offlineCouriersExpanded.modal && sortedOffline.map(c => renderCourierItem(c, 'bg-slate-400', false))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssignModal(false)}>İptal</Button>
              <Button onClick={handleAssignCourier} disabled={!selectedCourierId}>Ata</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order Detail Modal */}
        <OrderDetailModal
          open={showOrderDetailModal}
          onOpenChange={setShowOrderDetailModal}
          order={selectedOrder}
          companyId={companyId}
          adminName={adminName}
          isSuperAdmin={isSuperAdmin}
          isAdminActive={isAdminActive}
          onUnassignCourier={handleUnassignCourier}
          onAssignCourier={() => setShowAssignModal(true)}
          onStatusUpdated={fetchOrders}
        />

        {/* Courier Detail Modal */}
        <CourierDetailModal
          open={showCourierDetailModal}
          onOpenChange={setShowCourierDetailModal}
          courier={selectedCourier}
          courierOrders={selectedCourierOrders}
          company={company}
          onUpdateStatus={handleUpdateCourierStatus}
          onOrderClick={(order) => {
            setSelectedOrder(order);
            setShowCourierDetailModal(false);
            setShowOrderDetailModal(true);
          }}
        />

        {/* Status Confirmation Modal */}
        <Dialog open={confirmStatusModal.open} onOpenChange={(open) => {
          if (!open) {
            setConfirmStatusModal({ open: false, orderId: null, newStatus: null, customerName: null, orderSource: null });
            setSelectedCancelReason("");
            setCancelNote("");
            setCancelReasons([]);
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {confirmStatusModal.newStatus === 'delivered' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Teslim Edildi Olarak İşaretle
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    İptal Edildi Olarak İşaretle
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                <strong>{confirmStatusModal.customerName || 'Müşteri'}</strong> siparişini{' '}
                <strong className={confirmStatusModal.newStatus === 'delivered' ? 'text-green-600' : 'text-red-600'}>
                  {confirmStatusModal.newStatus === 'delivered' ? 'teslim edildi' : 'iptal edildi'}
                </strong>{' '}
                olarak işaretlemek istediğinize emin misiniz?
              </p>
              
              {/* İptal Sebebi Seçimi - Sadece iptal durumunda ve sebepler varsa göster */}
              {confirmStatusModal.newStatus === 'cancelled' && cancelReasons.length > 0 && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      İptal Sebebi {confirmStatusModal.orderSource === 'getir' && <span className="text-red-500">*</span>}
                    </label>
                    <Select value={selectedCancelReason} onValueChange={setSelectedCancelReason}>
                      <SelectTrigger className="w-full" data-testid="admin-cancel-reason-select">
                        <SelectValue placeholder="Sebep seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cancelReasons.map((reason) => (
                          <SelectItem key={reason.id} value={reason.id}>
                            {reason.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">İptal Notu (Opsiyonel)</label>
                    <textarea
                      className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={2}
                      placeholder="Ek açıklama..."
                      value={cancelNote}
                      onChange={(e) => setCancelNote(e.target.value)}
                      data-testid="admin-cancel-note-input"
                    />
                  </div>

                  {confirmStatusModal.orderSource === 'getir' && !selectedCancelReason && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      Getir siparişleri için iptal sebebi seçmeniz zorunludur.
                    </p>
                  )}
                </div>
              )}
              
              {confirmStatusModal.newStatus === 'cancelled' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">
                    <strong>Uyarı:</strong> İptal edilen siparişler geri alınamaz ve kurye ataması kaldırılır.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => {
                setConfirmStatusModal({ open: false, orderId: null, newStatus: null, customerName: null, orderSource: null });
                setSelectedCancelReason("");
                setCancelNote("");
                setCancelReasons([]);
              }}>
                Vazgeç
              </Button>
              <Button 
                onClick={handleConfirmStatusChange}
                className={confirmStatusModal.newStatus === 'delivered' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                disabled={confirmStatusModal.newStatus === 'cancelled' && confirmStatusModal.orderSource === 'getir' && !selectedCancelReason}
              >
                {confirmStatusModal.newStatus === 'delivered' ? 'Teslim Edildi' : 'İptal Et'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mola Uyarısı Onay Modalı */}
        <ConfirmModal
          open={showBreakConfirm}
          onOpenChange={setShowBreakConfirm}
          title="Mola Uyarısı"
          description={breakWarning || "Bu kuryenin molası yaklaşıyor. Yine de atamak istiyor musunuz?"}
          onConfirm={handleBreakConfirmAssign}
          confirmText="Evet, Ata"
          cancelText="Vazgeç"
          variant="warning"
        />
      </div>
    </div>
  );
}
