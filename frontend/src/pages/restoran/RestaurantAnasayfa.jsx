import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger 
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ClipboardList, Truck, CheckCircle, XCircle, ClipboardX, ListChecks,
  Package, Timer, TrendingUp, Info, Phone, Calendar, Bike, UserPlus, Eye, Store, Printer, History, Plus, Trash2, Send
} from "lucide-react";
import NewOrderModal from "@/components/restoran/NewOrderModal";
import OrderDetailModal from "@/components/restoran/OrderDetailModal";
import StoreStatusToggles from "@/components/restoran/StoreStatusToggles";
import StatusDropdown from "./components/StatusDropdown";
import CancelModal from "./components/CancelModal";
import {
  ORDER_STATUSES,
  COURIER_ONLY_STATUSES,
  PREPARATION_TIMES,
  getCountdown,
  getOrderDistance,
  getOrderAge,
  getEstimatedArrival,
  formatTime,
  formatCurrency
} from "@/utils/orderUtils";
import { printOrderLocal, getLocalPrintSettings, checkLocalPrintServer } from "@/utils/localPrintService";
import { playNotificationSound, getNotificationSettings } from "@/utils/notificationSounds";
import { playCourierAssignmentSound, getCourierAssignmentSettings } from "@/utils/courierAssignmentSounds";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantAnasayfa({ orders, loading, onUpdateStatus, onAssignCourier, onRefresh, restaurantId, restaurantName, permissions = {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("pending");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [availableCouriers, setAvailableCouriers] = useState([]);
  const [courierRestrictionMode, setCourierRestrictionMode] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [restaurantDeliveryConfirm, setRestaurantDeliveryConfirm] = useState(null);
  const [unmarkDeliveryConfirm, setUnmarkDeliveryConfirm] = useState(null);
  // Yeni CancelModal için state
  const [actionModal, setActionModal] = useState({ open: false, order: null, actionType: null });
  const [courierETAs, setCourierETAs] = useState({}); // {courierId: etaInfo}
  const [mockLoading, setMockLoading] = useState(false);
  
  // Otomatik yazdırma için önceki siparişleri takip et
  const previousOrderIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  const localServerAvailableRef = useRef(false);
  
  // Kurye ataması takibi için
  const previousCourierAssignmentsRef = useRef(new Map()); // orderId -> courierId
  
  // Yazdırılan siparişleri takip et
  const [printedOrders, setPrintedOrders] = useState(() => {
    const stored = localStorage.getItem(`printed_orders_${restaurantId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // İzin kontrolleri
  const canViewCourierPhone = permissions.can_view_courier_phone !== false; // Default true
  const canViewCourierLocation = permissions.can_view_courier_location !== false; // Default true
  const canMarkRestaurantDelivery = permissions.can_mark_restaurant_delivery === true; // Default false

  // Yazdırılan siparişleri localStorage'a kaydet
  const markAsPrinted = (orderId) => {
    setPrintedOrders(prev => {
      const newSet = new Set(prev);
      newSet.add(orderId);
      localStorage.setItem(`printed_orders_${restaurantId}`, JSON.stringify([...newSet]));
      return newSet;
    });
  };

  // Yerel yazdırma sunucusu bağlantısını kontrol et (periyodik)
  useEffect(() => {
    const checkServer = async () => {
      const localSettings = getLocalPrintSettings(restaurantId);
      if (localSettings.enabled) {
        const status = await checkLocalPrintServer();
        localServerAvailableRef.current = status.connected;
      }
    };
    
    // İlk kontrol
    checkServer();
    
    // Her 5 saniyede bir kontrol et
    const interval = setInterval(checkServer, 5000);
    
    return () => clearInterval(interval);
  }, [restaurantId]);

  // Otomatik yazdırma ve sesli bildirim - yeni sipariş algılama
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    
    const localSettings = getLocalPrintSettings(restaurantId);
    const notificationSettings = getNotificationSettings(restaurantId);
    const currentOrderIds = new Set(orders.map(o => o.id));
    
    // İlk yüklemede sadece ID'leri kaydet, yazdırma/bildirim yapma
    if (isFirstLoadRef.current) {
      previousOrderIdsRef.current = currentOrderIds;
      isFirstLoadRef.current = false;
      return;
    }
    
    // Yeni siparişleri bul
    const newOrders = orders.filter(o => !previousOrderIdsRef.current.has(o.id));
    
    // Yeni sipariş varsa sesli bildirim çal
    if (newOrders.length > 0 && notificationSettings.enabled) {
      // Sadece pending veya preparing durumundaki yeni siparişler için ses çal
      const hasNewActiveOrder = newOrders.some(o => o.status === 'pending' || o.status === 'preparing');
      if (hasNewActiveOrder) {
        playNotificationSound(notificationSettings.soundId, notificationSettings.volume);
      }
    }
    
    // Otomatik yazdırma kapalıysa sadece ID'leri güncelle
    if (!localSettings.enabled) {
      previousOrderIdsRef.current = currentOrderIds;
      return;
    }
    
    // Yeni siparişleri sırayla yazdır (paralel değil, sıralı)
    const printNewOrders = async () => {
      for (const order of newOrders) {
        // Sadece pending veya preparing durumundaki siparişleri yazdır
        if (order.status === 'pending' || order.status === 'preparing') {
          // Zaten yazdırıldıysa atla
          if (printedOrders.has(order.id)) {
            continue;
          }
          
          // Siparişe restoran adını ekle
          const orderWithRestaurant = { ...order, restaurant_name: restaurantName };
          
          // Yazdır
          try {
            const result = await printOrderLocal(
              orderWithRestaurant,
              localSettings.printerName,
              localSettings.paperSize
            );
            
            if (result.success) {
              markAsPrinted(order.id);
              toast.success(`Sipariş yazdırıldı: #${order.order_number}`, {
                icon: <Printer className="w-4 h-4" />,
              });
            } else {
              console.error("Yazdırma hatası:", result.error);
              toast.error(`Yazdırma hatası: #${order.order_number} - ${result.error || 'Bilinmeyen hata'}`);
            }
          } catch (err) {
            console.error("Yazdırma exception:", err);
            toast.error(`Yazdırma hatası: #${order.order_number}`);
          }
          
          // Siparişler arası küçük bekleme (yazıcı buffer için)
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };
    
    if (newOrders.length > 0 && localSettings.enabled && localSettings.printerName) {
      printNewOrders();
    }
    
    // Önceki ID'leri güncelle
    previousOrderIdsRef.current = currentOrderIds;
  }, [orders, restaurantId, restaurantName, printedOrders, markAsPrinted]);

  // Kurye ataması bildirimi
  useEffect(() => {
    if (!orders || orders.length === 0) return;
    
    const courierSettings = getCourierAssignmentSettings(restaurantId);
    if (!courierSettings.enabled) return;
    
    // İlk yüklemede sadece mevcut atamaları kaydet
    if (previousCourierAssignmentsRef.current.size === 0 && orders.length > 0) {
      orders.forEach(order => {
        if (order.courier_id) {
          previousCourierAssignmentsRef.current.set(order.id, order.courier_id);
        }
      });
      return;
    }
    
    // Yeni kurye ataması olup olmadığını kontrol et
    let hasNewAssignment = false;
    
    orders.forEach(order => {
      const previousCourierId = previousCourierAssignmentsRef.current.get(order.id);
      
      // Daha önce kurye atanmamış ve şimdi atanmışsa
      if (!previousCourierId && order.courier_id) {
        hasNewAssignment = true;
      }
      
      // Güncel durumu kaydet
      if (order.courier_id) {
        previousCourierAssignmentsRef.current.set(order.id, order.courier_id);
      }
    });
    
    // Yeni atama varsa ses çal
    if (hasNewAssignment) {
      playCourierAssignmentSound(courierSettings.soundId, courierSettings.volume, 2);
    }
  }, [orders, restaurantId]);

  // Süre dolan siparişleri otomatik "ready" durumuna geçir
  useEffect(() => {
    const checkExpiredOrders = async () => {
      if (!orders || orders.length === 0) return;
      
      for (const order of orders) {
        // Sadece preparing durumundaki ve preparation_end_at olan siparişleri kontrol et
        if (order.status === 'preparing' && order.preparation_end_at) {
          const countdown = getCountdown(order.preparation_end_at);
          
          // Süre dolduysa otomatik olarak "ready" yap
          if (countdown?.expired) {
            try {
              await onUpdateStatus(order.id, 'ready');
              // Bildirim kapatıldı - kullanıcı isteği
            } catch (err) {
              console.error("Otomatik durum değişikliği hatası:", err);
            }
          }
        }
      }
    };
    
    // Başlangıçta kontrol et
    checkExpiredOrders();
    
    // Her 10 saniyede bir kontrol et
    const interval = setInterval(checkExpiredOrders, 10000);
    return () => clearInterval(interval);
  }, [orders, onUpdateStatus]);

  // Manuel yazdırma fonksiyonu
  const handlePrintOrder = async (order) => {
    const localSettings = getLocalPrintSettings(restaurantId);
    
    // Siparişe restoran adını ekle
    const orderWithRestaurant = { ...order, restaurant_name: restaurantName };
    
    // Yerel sunucu ile yazdırma
    if (localSettings.enabled && localSettings.printerName) {
      const result = await printOrderLocal(
        orderWithRestaurant,
        localSettings.printerName,
        localSettings.paperSize
      );
      
      if (result.success) {
        markAsPrinted(order.id);
        toast.success("Fiş yazıcıya gönderildi");
        return;
      } else {
        toast.error(`Yazdırma hatası: ${result.error}`);
      }
    } else {
      toast.error("Yazdırma sunucusu bağlı değil. Ayarlar'dan yapılandırın.");
    }
  };

  // Restoran teslimatı işaretleme
  const handleMarkRestaurantDelivery = async (orderId) => {
    try {
      await axios.post(`${API}/orders/${orderId}/mark-restaurant-delivery?restaurant_id=${restaurantId}`);
      toast.success("Sipariş restoran teslimatı olarak işaretlendi");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşaretleme başarısız");
    }
    setRestaurantDeliveryConfirm(null);
  };

  // Restoran teslimatı işaretini kaldırma
  const handleUnmarkRestaurantDelivery = async (orderId) => {
    try {
      await axios.post(`${API}/orders/${orderId}/unmark-restaurant-delivery?restaurant_id=${restaurantId}`);
      toast.success("Sipariş kurye şirketine aktarıldı");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
    setUnmarkDeliveryConfirm(null);
  };

  // Restoran teslimatı durumunu güncelleme
  const handleRestaurantDeliveryStatus = async (orderId, newStatus) => {
    try {
      await axios.post(`${API}/orders/${orderId}/restaurant-update-status?restaurant_id=${restaurantId}&new_status=${newStatus}`);
      // Bildirim kapatıldı - kullanıcı isteği
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    }
  };

  // TEK handler - tüm status değişiklikleri için
  const handleOrderStatusChange = async (orderId, newStatus, prepTime = null, cancelReasonId = null, cancelNote = null) => {
    try {
      if (prepTime) {
        // Hazırlama süresi değişikliği
        onUpdateStatus?.(orderId, "preparing", prepTime);
      } else if (cancelReasonId !== undefined || newStatus === "cancelled") {
        // İptal - iptal sebebi ile
        const payload = { 
          status: newStatus,
          cancel_reason_id: cancelReasonId || undefined,
          cancel_note: cancelNote || undefined
        };
        await axios.put(`${API}/orders/${orderId}/status`, payload);
        // Bildirim kapatıldı - kullanıcı isteği
        onRefresh?.();
      } else {
        // Normal status değişikliği
        onUpdateStatus?.(orderId, newStatus);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Modal onay callback
  const handleActionConfirm = ({ orderId, status, cancelReasonId, cancelNote }) => {
    handleOrderStatusChange(orderId, status, null, cancelReasonId, cancelNote);
    setActionModal({ open: false, order: null, actionType: null });
  };

  // Mock sipariş oluştur
  const handleGenerateMock = async () => {
    if (!restaurantId) return;
    setMockLoading(true);
    try {
      const res = await axios.post(`${API}/orders/restaurant/${restaurantId}/generate-mock?count=20`);
      toast.success(res.data.message || "20 mock sipariş oluşturuldu");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Mock sipariş oluşturulamadı");
    } finally {
      setMockLoading(false);
    }
  };

  // Mock siparişleri sil
  const handleClearMock = async () => {
    if (!restaurantId) return;
    setMockLoading(true);
    try {
      const res = await axios.delete(`${API}/orders/restaurant/${restaurantId}/clear-mock`);
      toast.success(res.data.message || "Mock siparişler silindi");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Mock siparişler silinemedi");
    } finally {
      setMockLoading(false);
    }
  };

  // Restoran teslimatı işaretlenebilir mi kontrol et
  const canMarkAsRestaurantDelivery = (order) => {
    if (!canMarkRestaurantDelivery) return { allowed: false, reason: "İzniniz yok" };
    if (order.is_restaurant_delivery) return { allowed: false, reason: "Zaten restoran teslimatı" };
    if (order.status === "on_the_way") return { allowed: false, reason: "Yolda olan siparişler işaretlenemez" };
    if (order.status === "delivered") return { allowed: false, reason: "Teslim edilmiş siparişler işaretlenemez" };
    if (order.status === "cancelled") return { allowed: false, reason: "İptal edilmiş siparişler işaretlenemez" };
    
    // 3 dakika kuralı
    if (order.courier_id && order.status === "confirmed" && order.assigned_at) {
      const assignedTime = new Date(order.assigned_at);
      const now = new Date();
      const elapsed = (now - assignedTime) / 1000; // saniye
      if (elapsed > 180) {
        return { allowed: false, reason: "Kurye atandıktan 3dk geçti" };
      }
    }
    
    return { allowed: true };
  };

  // Fetch available couriers with ETA
  useEffect(() => {
    const fetchCouriers = async () => {
      if (!restaurantId) return;
      try {
        // Yeni endpoint: ETA bilgisi dahil
        const res = await axios.get(`${API}/orders/restaurant/${restaurantId}/couriers-with-eta`);
        setAvailableCouriers(res.data.couriers || []);
        setCourierRestrictionMode(res.data.restriction_mode || "all");
      } catch (err) {
        console.error("Kuryeler yüklenemedi:", err);
        // Fallback: Eski endpoint
        try {
          const fallback = await axios.get(`${API}/orders/restaurant/${restaurantId}/available-couriers`);
          setAvailableCouriers(fallback.data.couriers || []);
          setCourierRestrictionMode(fallback.data.restriction_mode || "all");
        } catch (e) {
          console.error("Fallback da başarısız:", e);
        }
      }
    };
    
    fetchCouriers();
    // Her 10 saniyede bir kurye listesini güncelle
    const interval = setInterval(fetchCouriers, 10000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  // Atanmış kuryelerin ETA'larını çek (izin varsa)
  useEffect(() => {
    // İzin yoksa ETA çekme
    if (permissions.can_view_courier_eta === false) {
      setCourierETAs({});
      return;
    }
    
    const fetchAssignedCourierETAs = async () => {
      if (!restaurantId || !orders || orders.length === 0) return;
      
      // Aktif siparişlerdeki atanmış kuryeleri bul (assigned, confirmed durumunda)
      const assignedCourierIds = [...new Set(
        orders
          .filter(o => o.courier_id && ['assigned', 'confirmed'].includes(o.status))
          .map(o => o.courier_id)
      )];
      
      if (assignedCourierIds.length === 0) {
        setCourierETAs({});
        return;
      }
      
      // Her kurye için ETA al
      const newETAs = {};
      await Promise.all(
        assignedCourierIds.map(async (courierId) => {
          try {
            const res = await axios.get(`${API}/orders/courier/${courierId}/eta/${restaurantId}`);
            newETAs[courierId] = res.data;
          } catch (err) {
            console.error(`Kurye ${courierId} ETA alınamadı:`, err);
          }
        })
      );
      
      setCourierETAs(newETAs);
    };
    
    fetchAssignedCourierETAs();
    // Her 15 saniyede bir güncelle
    const interval = setInterval(fetchAssignedCourierETAs, 15000);
    return () => clearInterval(interval);
  }, [restaurantId, orders, permissions.can_view_courier_eta]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at?.startsWith(today));
    
    // Ortalama Hazırlık Süresi: Sipariş sisteme düştükten sonra YOLA ÇIKARILANA kadar
    // picked_up_at veya on_the_way status zamanı kullanılır
    let totalPrepTime = 0;
    let prepCount = 0;
    
    // Ortalama Teslimat Süresi: Sipariş sisteme düştükten sonra TESLİM EDİLENE kadar (TOPLAM)
    let totalDeliveryTime = 0;
    let deliveryCount = 0;
    
    todayOrders.forEach(order => {
      // Hazırlık süresi: created_at -> picked_up_at (yola çıkış)
      if (order.picked_up_at && order.created_at) {
        const prepTime = new Date(order.picked_up_at) - new Date(order.created_at);
        if (prepTime > 0) {
          totalPrepTime += prepTime;
          prepCount++;
        }
      }
      // Teslimat süresi: created_at -> delivered_at (baştan sona toplam süre)
      if (order.delivered_at && order.created_at) {
        const deliveryTime = new Date(order.delivered_at) - new Date(order.created_at);
        if (deliveryTime > 0) {
          totalDeliveryTime += deliveryTime;
          deliveryCount++;
        }
      }
    });
    
    const avgPrepTime = prepCount > 0 ? Math.round(totalPrepTime / prepCount / 60000) : 0;
    const avgDeliveryTime = deliveryCount > 0 ? Math.round(totalDeliveryTime / deliveryCount / 60000) : 0;
    
    return {
      todayTotal: todayOrders.length,
      pending: orders.filter(o => 
        o.status === "pending" || 
        o.status === "preparing" || 
        o.status === "ready" || 
        o.status === "assigned" || 
        o.status === "confirmed" ||
        o.status === "scheduled"
      ).length,
      onTheWay: orders.filter(o => o.status === "on_the_way").length,
      delivered: todayOrders.filter(o => o.status === "delivered").length,
      cancelled: todayOrders.filter(o => o.status === "cancelled").length,
      avgPrepTime,
      avgDeliveryTime
    };
  }, [orders]);

  // Filter orders by tab
  const filteredOrders = useMemo(() => {
    switch (activeTab) {
      case "pending":
        // Bekleyen sekmesi: pending, preparing, ready, assigned, confirmed, scheduled (ileri tarihli dahil)
        return orders.filter(o => 
          o.status === "pending" || 
          o.status === "preparing" || 
          o.status === "ready" || 
          o.status === "assigned" || 
          o.status === "confirmed" ||
          o.status === "scheduled"
        );
      case "on_the_way":
        return orders.filter(o => o.status === "on_the_way");
      case "delivered":
        return orders.filter(o => o.status === "delivered");
      case "cancelled":
        return orders.filter(o => o.status === "cancelled");
      default:
        return [];
    }
  }, [orders, activeTab]);

  // Format time
  const formatTimeLocal = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleTimeString("tr-TR", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  // İleri tarihli sipariş teslimat saatini formatla
  const formatScheduledTime = (dateString) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleTimeString("tr-TR", { 
        hour: "2-digit", 
        minute: "2-digit" 
      });
    } catch {
      return dateString;
    }
  };

  // Get payment badge with detail support
  const getPaymentBadge = (method, detail = null) => {
    const styles = {
      cash: 'bg-emerald-100 text-emerald-700',
      card: 'bg-blue-100 text-blue-700',
      meal_card: 'bg-orange-100 text-orange-700',
      online_meal_card: 'bg-orange-100 text-orange-700',
      online: 'bg-purple-100 text-purple-700'
    };
    const labels = {
      cash: 'Nakit',
      card: 'Kart',
      meal_card: 'Yemek Kartı',
      online_meal_card: 'Online Y.K.',
      online: 'Online'
    };
    
    // Yemek kartı detayı varsa göster
    let displayLabel = labels[method] || method;
    if ((method === 'meal_card' || method === 'online_meal_card') && detail) {
      displayLabel = detail;
    }
    
    return (
      <span className={`px-2 py-0.5 text-xs rounded ${styles[method] || 'bg-gray-100 text-gray-700'}`}>
        {displayLabel}
      </span>
    );
  };

  // Alt sekme navigasyonu
  const currentSubPage = location.pathname === '/restoran' ? 'aktif' 
    : location.pathname === '/restoran/gecmis-siparisler' ? 'gecmis'
    : location.pathname === '/restoran/iptal-siparisler' ? 'iptal'
    : 'aktif';

  const handleSubPageChange = (value) => {
    if (value === 'aktif') navigate('/restoran');
    else if (value === 'gecmis') navigate('/restoran/gecmis-siparisler');
    else if (value === 'iptal') navigate('/restoran/iptal-siparisler');
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="restaurant-anasayfa">
      {/* Header with Sub-tabs */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900">Sipariş Yönetimi</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Güncel sipariş durumu</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button 
              onClick={() => setNewOrderModalOpen(true)} 
              size="sm"
              className="bg-primary hover:bg-primary/90"
              data-testid="new-order-btn"
            >
              <Phone className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Telefon Siparişi</span>
              <span className="sm:hidden">Sipariş</span>
            </Button>
          </div>
        </div>
        
        {/* Alt Sekmeler - Mobilde yatay scroll */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 border-b min-w-max sm:min-w-0">
            <button
              onClick={() => handleSubPageChange('aktif')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                currentSubPage === 'aktif' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Aktif Sip.
            </button>
            <button
              onClick={() => handleSubPageChange('gecmis')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                currentSubPage === 'gecmis' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Teslim Sip.
            </button>
            <button
              onClick={() => handleSubPageChange('iptal')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                currentSubPage === 'iptal' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <ClipboardX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              İptal Sip.
            </button>
          </div>
        </div>
      </div>

      {/* New Order Modal */}
      <NewOrderModal
        open={newOrderModalOpen}
        onOpenChange={setNewOrderModalOpen}
        restaurantId={restaurantId}
        onOrderCreated={() => {
          onRefresh();
        }}
      />

      {/* Stats - Minimal Single Row */}
      <div className="bg-white border rounded-xl p-3 sm:p-4 overflow-x-auto">
        <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-max sm:min-w-0 flex-wrap">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-slate-800">{stats.todayTotal}</span>
              <span className="text-[10px] sm:text-xs text-slate-500">Bugün</span>
            </div>
            <div className="h-5 sm:h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-amber-600">{stats.pending}</span>
              <span className="text-[10px] sm:text-xs text-slate-500">Bekleyen</span>
            </div>
            <div className="h-5 sm:h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-blue-600">{stats.onTheWay}</span>
              <span className="text-[10px] sm:text-xs text-slate-500">Yolda</span>
            </div>
            <div className="h-5 sm:h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-green-600">{stats.delivered}</span>
              <span className="text-[10px] sm:text-xs text-slate-500">Teslim</span>
            </div>
            <div className="h-5 sm:h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-red-600">{stats.cancelled || 0}</span>
              <span className="text-[10px] sm:text-xs text-slate-500">İptal</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-slate-500">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <Timer className="w-3.5 h-3.5" />
                    <span className="text-sm">{stats.avgPrepTime} dk</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Ort. Hazırlık Süresi</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <Truck className="w-3.5 h-3.5" />
                    <span className="text-sm">{stats.avgDeliveryTime} dk</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Ort. Teslimat Süresi</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Platform Mağazaları - Hızlı Aç/Kapat */}
      <StoreStatusToggles restaurantId={restaurantId} />

      {/* Orders Tabs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Siparişler</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex justify-center mb-4">
              <TabsList className="inline-flex">
                <TabsTrigger value="pending" className="flex items-center justify-center gap-2 w-44" data-testid="tab-pending">
                  <ClipboardList className="w-4 h-4" />
                  <span>Bekleyen</span>
                </TabsTrigger>
                <TabsTrigger value="on_the_way" className="flex items-center justify-center gap-2 w-44" data-testid="tab-on-the-way">
                  <Truck className="w-4 h-4" />
                  <span>Yolda</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={activeTab} className="mt-0">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Bu kategoride sipariş bulunmuyor.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary">
                        <th className="text-left p-2 font-bold text-xs whitespace-nowrap">Zaman</th>
                        <th className="text-left p-2 font-bold text-xs">Müşteri</th>
                        <th className="text-left p-2 font-bold text-xs">Adres</th>
                        <th className="text-left p-2 font-bold text-xs">Mesafe</th>
                        <th className="text-left p-2 font-bold text-xs">Tutar</th>
                        <th className="text-left p-2 font-bold text-xs">Ödeme</th>
                        <th className="text-left p-2 font-bold text-xs">Durum</th>
                        <th className="text-left p-2 font-bold text-xs">Kurye</th>
                        <th className="text-center p-2 font-bold text-xs w-[50px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                        const orderAge = getOrderAge(order);
                        
                        return (
                          <tr 
                            key={order.id}
                            className="border-b hover:bg-slate-50 transition-colors align-top"
                          >
                            <td className="p-2 text-xs">
                              <div>{formatTimeLocal(order.created_at)}</div>
                              {/* İleri tarihli sipariş için teslimat saatini göster */}
                              {order.getir_raw?.isScheduled && order.getir_raw?.scheduledDate && (
                                <div className="text-[10px] text-purple-600 font-medium mt-0.5">
                                  {formatScheduledTime(order.getir_raw.scheduledDate)} İleri Tarih
                                </div>
                              )}
                              {order.source === "manual" && (
                                <span className="text-[10px] text-blue-600 flex items-center gap-0.5 mt-0.5">
                                  <Phone className="w-2.5 h-2.5" />Tel
                                </span>
                              )}
                            </td>
                            <td className="p-2 max-w-[120px]">
                              <div className="overflow-hidden">
                                <span className="text-sm block truncate">{order.customer_name || "-"}</span>
                                {order.customer_phone && (
                                  <div className="text-xs text-muted-foreground font-mono truncate">{order.customer_phone}</div>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-xs align-top" title={order.delivery_address}>
                              <div className="line-clamp-3 leading-relaxed">{order.delivery_address || "-"}</div>
                            </td>
                            <td className="p-2 text-xs whitespace-nowrap">{getOrderDistance(order) || "-"}</td>
                            <td className="p-2 font-semibold whitespace-nowrap">{formatCurrency(order.total_amount)}</td>
                            <td className="p-2">{getPaymentBadge(order.payment_method, order.payment_method_detail)}</td>
                            <td className="p-2">
                              <StatusDropdown
                                order={order}
                                onStatusChange={(orderId, newStatus) => {
                                  if (order.is_restaurant_delivery) {
                                    handleRestaurantDeliveryStatus(orderId, newStatus);
                                  } else {
                                    onUpdateStatus?.(orderId, newStatus);
                                  }
                                }}
                                onPreparationTimeChange={(orderId, minutes) => {
                                  onUpdateStatus?.(orderId, "preparing", minutes);
                                }}
                                onCancelClick={(ord, status) => {
                                  // delivered veya cancelled için modal aç
                                  const actionType = status || "cancelled";
                                  setActionModal({ open: true, order: ord, actionType });
                                }}
                                getCountdown={getCountdown}
                                canChangeStatus={permissions.can_change_order_status !== false}
                              />
                            </td>
                            <td className="p-2">
                              {/* Restoran teslimatı ise "Restoran" göster */}
                              {order.is_restaurant_delivery ? (
                                <span className="text-xs px-2 py-1 border border-slate-300 text-slate-600 rounded font-medium flex items-center gap-1 w-fit">
                                  <Truck className="w-3 h-3" />
                                  Restoran
                                </span>
                              ) : order.courier_name ? (
                                <div className="text-xs">
                                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium flex items-center gap-1 w-fit">
                                    <Bike className="w-3 h-3" />
                                    {order.courier_name}
                                  </span>
                                  <div className="flex flex-col mt-0.5 pl-1 gap-0.5">
                                    {canViewCourierPhone && order.courier_phone && (
                                      <a href={`tel:${order.courier_phone}`} className="text-muted-foreground font-mono hover:text-primary text-[11px]">
                                        {order.courier_phone}
                                      </a>
                                    )}
                                    {/* Dinamik ETA - assigned/confirmed durumunda göster (izin varsa) */}
                                    {permissions.can_view_courier_eta !== false && ['assigned', 'confirmed'].includes(order.status) && order.courier_id && (() => {
                                      const eta = courierETAs[order.courier_id];
                                      if (eta?.eta_text) {
                                        return (
                                          <div className="flex flex-col">
                                            <span className="text-blue-600 font-medium text-[11px]">
                                              {eta.eta_text}
                                            </span>
                                            {eta.route_summary && eta.route_summary !== "Doğrudan geliyor" && (
                                              <span className="text-[10px] text-muted-foreground">
                                                {eta.route_summary}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      }
                                      // Fallback: Basit mesafe tabanlı ETA
                                      if (order.courier_location) {
                                        const simpleEta = getEstimatedArrival(order.courier_location, order.restaurant_location);
                                        return simpleEta ? (
                                          <span className="text-blue-600 text-[10px]">{simpleEta.text}</span>
                                        ) : null;
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                /* Kurye atanmamış - dropdown göster (sadece paketi olan kurye varsa) */
                                courierRestrictionMode === "restricted" && availableCouriers.length > 0 ? (
                                  <Select onValueChange={(courierId) => onAssignCourier(order.id, courierId)}>
                                    <SelectTrigger className="h-7 text-xs w-[140px] border-dashed">
                                      <SelectValue placeholder="Kurye Ata" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="px-2 py-1 text-[10px] text-amber-600 bg-amber-50 border-b">
                                        Sadece paketi olan kuryeler
                                      </div>
                                      {availableCouriers.map((courier) => (
                                        <SelectItem key={courier.id} value={courier.id} className="text-xs">
                                          <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">{courier.name}</span>
                                              {permissions.can_view_courier_eta !== false && courier.eta?.eta_text && (
                                                <span className="text-blue-600 text-[10px]">
                                                  {courier.eta.eta_text}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                              {courier.package_count > 0 && (
                                                <span>{courier.package_count} paket</span>
                                              )}
                                              {permissions.can_view_courier_eta !== false && courier.eta?.route_summary && courier.eta.route_summary !== "Doğrudan geliyor" && (
                                                <span>• {courier.eta.route_summary}</span>
                                              )}
                                            </div>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {/* Restoran Teslimatı butonu */}
                                {order.is_restaurant_delivery ? (
                                  // İşaretli sipariş - tıklanınca geri alma onayı
                                  order.status !== 'delivered' && canMarkRestaurantDelivery ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 hover:bg-slate-100"
                                            onClick={() => setUnmarkDeliveryConfirm(order)}
                                          >
                                            <Send className="w-4 h-4 text-slate-500" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Kurye Şirketine Aktar</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    // Teslim edilmiş veya izin yoksa sadece görsel
                                    <div className="h-7 w-7 flex items-center justify-center opacity-50">
                                      <Send className="w-4 h-4 text-slate-500" />
                                    </div>
                                  )
                                ) : canMarkRestaurantDelivery && (() => {
                                  const check = canMarkAsRestaurantDelivery(order);
                                  return check.allowed ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 hover:bg-slate-100"
                                            onClick={() => setRestaurantDeliveryConfirm(order)}
                                          >
                                            <Store className="w-4 h-4 text-slate-500" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Restoran Teslimatı</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : null;
                                })()}
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-slate-100"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setDetailModalOpen(true);
                                  }}
                                  data-testid={`order-detail-btn-${order.id}`}
                                >
                                  <Eye className="w-4 h-4 text-slate-500" />
                                </Button>
                                
                                {/* Yazdır butonu */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-7 w-7 p-0 ${printedOrders.has(order.id) ? 'hover:bg-green-50' : 'hover:bg-slate-100'}`}
                                        onClick={() => handlePrintOrder(order)}
                                        data-testid={`order-print-btn-${order.id}`}
                                      >
                                        <Printer className={`w-4 h-4 ${printedOrders.has(order.id) ? 'text-green-500' : 'text-slate-700'}`} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{printedOrders.has(order.id) ? 'Yazdırıldı - Tekrar Yazdır' : 'Fiş Yazdır'}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        open={detailModalOpen}
        onClose={setDetailModalOpen}
        canViewCourierPhone={canViewCourierPhone}
        canViewCourierLocation={canViewCourierLocation}
      />

      {/* Restoran Teslimatı Onay Dialog */}
      <AlertDialog open={!!restaurantDeliveryConfirm} onOpenChange={() => setRestaurantDeliveryConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-600" />
              Restoran Teslimatı
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                Bu siparişi restoran teslimatı olarak işaretlemek istediğinize emin misiniz?
                <ul className="mt-3 space-y-1 text-sm">
                  <li>• Kurye ataması kaldırılacak</li>
                  <li>• Sipariş yönetici panelinden kaldırılacak</li>
                  <li>• Mütabakat ve raporlara dahil edilmeyecek</li>
                  <li>• Teslimatı siz yapacaksınız</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-600 hover:bg-slate-700"
              onClick={() => handleMarkRestaurantDelivery(restaurantDeliveryConfirm?.id)}
            >
              Onayla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restoran Teslimatı Geri Alma Dialog */}
      <AlertDialog open={!!unmarkDeliveryConfirm} onOpenChange={() => setUnmarkDeliveryConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-600" />
              Kurye Şirketine Aktar
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                Bu siparişi kurye şirketine aktarmak istediğinize emin misiniz?
                <ul className="mt-3 space-y-1 text-sm">
                  <li>• Sipariş tekrar yönetici panelinde görünecek</li>
                  <li>• Kurye atanabilir hale gelecek</li>
                  <li>• Mütabakat ve raporlara dahil edilecek</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-600 hover:bg-slate-700"
              onClick={() => handleUnmarkRestaurantDelivery(unmarkDeliveryConfirm?.id)}
            >
              Aktar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* İptal/Teslim Onay Modalı - Yeni Component */}
      <CancelModal
        open={actionModal.open}
        onOpenChange={(open) => !open && setActionModal({ open: false, order: null, actionType: null })}
        order={actionModal.order}
        actionType={actionModal.actionType}
        onConfirm={handleActionConfirm}
      />
    </div>
  );
}
