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
  const [activeTab, setActiveTab] = useState("assigned");
  const [showNotReadyModal, setShowNotReadyModal] = useState(false);
  const [pendingNotReadyOrder, setPendingNotReadyOrder] = useState(null);
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

  // Rota oluştur - en yakından uzağa sırala ve Google Maps'te aç
  const createOptimizedRoute = useCallback(async () => {
    // Yolda olan siparişleri al
    const onTheWayOrders = orders.filter(o => o.status === "on_the_way");
    
    if (onTheWayOrders.length < 2) {
      toast.error("Rota için en az 2 sipariş gerekli");
      return;
    }
    
    // Başlangıç noktası - kullanıcının mevcut konumu
    let startLat, startLng;
    
    const currentPos = await new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      } else {
        resolve(null);
      }
    });

    if (currentPos) {
      startLat = currentPos.lat;
      startLng = currentPos.lng;
    } else {
      // Konum alınamazsa restoran konumunu fallback olarak kullan
      const firstOrder = onTheWayOrders[0];
      if (firstOrder.restaurant_location?.latitude) {
        startLat = firstOrder.restaurant_location.latitude;
        startLng = firstOrder.restaurant_location.longitude;
      } else {
        toast.error("Konum bilgisi alınamadı");
        return;
      }
    }
    
    // Geçerli konum bilgisi olan siparişleri filtrele
    const validOrders = onTheWayOrders.filter(
      o => o.delivery_location?.latitude && o.delivery_location?.longitude
    );
    
    if (validOrders.length < 2) {
      toast.error("Yeterli konum bilgisi yok");
      return;
    }
    
    // Toplam rota mesafesini hesapla
    const calculateTotalDistance = (route, sLat, sLng) => {
      let total = 0;
      let prevLat = sLat;
      let prevLng = sLng;
      
      for (const order of route) {
        const dist = calculateDistance(prevLat, prevLng, 
          order.delivery_location.latitude, order.delivery_location.longitude);
        total += dist || 0;
        prevLat = order.delivery_location.latitude;
        prevLng = order.delivery_location.longitude;
      }
      return total;
    };
    
    // Az sipariş varsa (≤6) tüm kombinasyonları dene (brute force)
    let bestRoute;
    
    if (validOrders.length <= 6) {
      // Tüm permütasyonları oluştur
      const permute = (arr) => {
        if (arr.length <= 1) return [arr];
        const result = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          const perms = permute(rest);
          for (const perm of perms) {
            result.push([arr[i], ...perm]);
          }
        }
        return result;
      };
      
      const allRoutes = permute(validOrders);
      let bestDistance = Infinity;
      
      for (const route of allRoutes) {
        const dist = calculateTotalDistance(route, startLat, startLng);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestRoute = route;
        }
      }
    } else {
      // Çok sipariş varsa Nearest Neighbor + 2-opt
      // 1. Nearest Neighbor ile başlangıç rotası
      const remaining = [...validOrders];
      bestRoute = [];
      let currentLat = startLat;
      let currentLng = startLng;
      
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        
        remaining.forEach((order, idx) => {
          const dist = calculateDistance(currentLat, currentLng,
            order.delivery_location.latitude, order.delivery_location.longitude);
          if (dist !== null && dist < nearestDist) {
            nearestDist = dist;
            nearestIdx = idx;
          }
        });
        
        const nearest = remaining.splice(nearestIdx, 1)[0];
        bestRoute.push(nearest);
        currentLat = nearest.delivery_location.latitude;
        currentLng = nearest.delivery_location.longitude;
      }
      
      // 2. 2-opt ile iyileştir
      let improved = true;
      while (improved) {
        improved = false;
        const n = bestRoute.length;
        
        for (let i = 0; i < n - 1; i++) {
          for (let j = i + 2; j < n; j++) {
            // i ve j arasını ters çevir
            const newRoute = [
              ...bestRoute.slice(0, i + 1),
              ...bestRoute.slice(i + 1, j + 1).reverse(),
              ...bestRoute.slice(j + 1)
            ];
            
            const currentDist = calculateTotalDistance(bestRoute, startLat, startLng);
            const newDist = calculateTotalDistance(newRoute, startLat, startLng);
            
            if (newDist < currentDist) {
              bestRoute = newRoute;
              improved = true;
            }
          }
        }
      }
    }
    
    // Google Maps URL oluştur
    const origin = `${startLat},${startLng}`;
    const destination = `${bestRoute[bestRoute.length - 1].delivery_location.latitude},${bestRoute[bestRoute.length - 1].delivery_location.longitude}`;
    
    const waypoints = bestRoute
      .slice(0, -1)
      .map(o => `${o.delivery_location.latitude},${o.delivery_location.longitude}`)
      .join("|");
    
    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) {
      mapsUrl += `&waypoints=${encodeURIComponent(waypoints)}`;
    }
    
    // Native app için route bilgisini de gönder
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OPEN_ROUTE',
        data: {
          origin: { lat: startLat, lng: startLng },
          destination: {
            lat: bestRoute[bestRoute.length - 1].delivery_location.latitude,
            lng: bestRoute[bestRoute.length - 1].delivery_location.longitude
          },
          waypoints: bestRoute.slice(0, -1).map(o => ({
            lat: o.delivery_location.latitude,
            lng: o.delivery_location.longitude,
            address: o.customer_address || o.address,
            orderId: o.id
          })),
          mapsUrl: mapsUrl
        }
      }));
    } else {
      window.open(mapsUrl, "_blank");
    }
  }, [orders]);

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
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  // Telefonu ara
  const callPhone = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  if (loading) {
    return <PageLoading />;
  }

  // Siparişleri grupla
  const assignedOrders = orders.filter((o) => ["assigned", "confirmed"].includes(o.status));
  const onTheWayOrders = orders.filter((o) => o.status === "on_the_way");

  return (
    <div className="space-y-3" data-testid="courier-siparis-page">
      {/* Sekmeler - Her zaman göster */}
      <div className="flex bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("assigned")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "assigned"
              ? "bg-white text-purple-700 shadow-md border border-purple-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Atanmış
          {assignedOrders.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === "assigned" ? "bg-purple-100 text-purple-700" : "bg-slate-200 text-slate-600"
            }`}>
              {assignedOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("ontheway")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "ontheway"
              ? "bg-white text-blue-700 shadow-md border border-blue-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Bike className="w-4 h-4" />
          Yolda
          {onTheWayOrders.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              activeTab === "ontheway" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
            }`}>
              {onTheWayOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* Atanmış Siparişler Tab */}
      {activeTab === "assigned" && (
        <div className="space-y-4">
          {assignedOrders.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg mb-1">Atanmış sipariş yok</h3>
              <p className="text-sm text-muted-foreground">
                Size sipariş atandığında burada görünecek
              </p>
            </div>
          ) : (
            <>
              {/* Toplu Yola Çıkar Butonu - Aynı restorandan onaylanmış siparişler varsa */}
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

              {assignedOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Atanmış sipariş yok</p>
                </div>
              ) : (
                assignedOrders.map((order) => (
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
                ))
              )}
            </>
          )}
        </div>
      )}

      {/* Yoldaki Siparişler Tab */}
      {activeTab === "ontheway" && (
        <div className="space-y-4">
          {onTheWayOrders.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Bike className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="font-semibold text-lg mb-1">Yolda sipariş yok</h3>
              <p className="text-sm text-muted-foreground">
                Siparişi yola çıkardığınızda burada görünecek
              </p>
            </div>
          ) : (
            <>
              {/* Toplam Kazanç Bilgisi */}
              <div className="bg-green-100 border border-green-300 rounded-lg p-3">
                <div className="flex items-center justify-center gap-2 text-green-700">
                  <Banknote className="w-5 h-5" />
                  <span className="text-sm font-semibold">
                    Bu {onTheWayOrders.length} siparişten {formatCurrency(onTheWayOrders.reduce((sum, o) => sum + (o.courier_fee || 0), 0))} kazanacaksınız
                  </span>
                </div>
              </div>

              {/* Rota Oluştur Butonu */}
              {onTheWayOrders.length >= 2 && (
                <Button
                  onClick={createOptimizedRoute}
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  data-testid="create-route-btn"
                >
                  <Route className="w-4 h-4 mr-2" />
                  Rota Oluştur ({onTheWayOrders.length} sipariş)
                </Button>
              )}
              
              {onTheWayOrders.map((order) => (
                <ActiveOrderCard
                  key={order.id}
                  order={order}
                  onPickup={() => handlePickupOrder(order.id)}
                  onDeliver={() => handleDeliverOrder(order.id)}
                  onNotReady={() => {}}
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
              ))}
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
              <strong>{pendingDeliveryOrder?.order_number}</strong> numaralı siparişi teslim etmek istediğinize emin misiniz?
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

// Yeni Sipariş Kartı (Onay Bekleyen) - Kompakt
function NewOrderCard({ order, onConfirm, loading }) {
  // Kurye kazancını formatla
  const courierFee = order.courier_fee || 0;
  
  return (
    <div
      className="bg-purple-50 rounded-xl shadow-lg border-l-4 border-purple-500"
      data-testid={`new-order-card-${order.id}`}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Badge className="bg-purple-500 text-white text-xs px-2 py-0.5">Yeni</Badge>
            {getOrderAgeText(order) && (
              <span className="text-xs text-purple-600 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {getOrderAgeText(order)}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatTime(order.created_at)}
          </span>
        </div>

        {/* Restoran bilgisi ve Uzaklık */}
        <div className="flex items-center justify-between mb-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-medium truncate">{order.restaurant_name}</span>
          </div>
          {getOrderDistance(order) && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium whitespace-nowrap">
              📍 {getOrderDistance(order)}
            </span>
          )}
        </div>

        {/* Kazanç Bilgisi */}
        {courierFee > 0 && (
          <div className="bg-green-100 border border-green-300 rounded-lg p-2 mb-2">
            <div className="flex items-center justify-center gap-1.5 text-green-700">
              <Banknote className="w-4 h-4" />
              <span className="text-sm font-semibold">
                Bu siparişten {formatCurrency(courierFee)} kazanacaksınız
              </span>
            </div>
          </div>
        )}

        {/* Sipariş özeti (gizli) */}
        <div className="bg-white/50 rounded p-2 mb-2 border border-purple-200">
          <div className="flex items-center gap-1.5 text-purple-700">
            <Eye className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Detayları görmek için onaylayın</span>
          </div>
        </div>

        {/* Onay butonu */}
        <Button
          onClick={onConfirm}
          disabled={loading}
          size="sm"
          className="w-full bg-purple-600 hover:bg-purple-700 h-8 text-xs"
          data-testid={`confirm-order-btn-${order.id}`}
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5 mr-1.5" />
          )}
          Siparişi Gördüm
        </Button>
      </div>
    </div>
  );
}

// Aktif Sipariş Kartı - Sade Tasarım
function ActiveOrderCard({ order, onPickup, onDeliver, onNotReady, onViewDetails, onOpenMaps, onOpenRestaurantMaps, onCall, loading }) {
  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.confirmed;
  const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const PaymentIcon = paymentInfo.icon;

  // Restoran telefonu için
  const callRestaurant = () => {
    if (order.restaurant_phone) {
      window.location.href = `tel:${order.restaurant_phone}`;
    } else {
      alert("Restoran telefon numarası bulunamadı");
    }
  };

  return (
    <div
      className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border-l-4 border-slate-300"
      data-testid={`active-order-card-${order.id}`}
    >
      <div className="p-3">
        {/* Header - Durum + Ödeme */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.color} text-white text-xs px-2 py-0.5`}>{statusConfig.label}</Badge>
            {getOrderAgeText(order) && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {getOrderAgeText(order)}
              </span>
            )}
            {getOrderDistance(order) && (
              <span className="text-xs text-slate-500">
                {getOrderDistance(order)}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${paymentInfo.bg} ${paymentInfo.color} font-medium`}>
            <PaymentIcon className="w-3 h-3" />
            <span>{getPaymentLabel(order)}</span>
          </div>
        </div>

        {/* RESTORAN BİLGİLERİ */}
        <div className="border-b border-slate-100 pb-2 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700">
                <Store className="w-4 h-4 text-slate-500" />
                {order.restaurant_name}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={callRestaurant}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                title="Restoranı Ara"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onOpenRestaurantMaps}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                title="Restorana Git"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* MÜŞTERİ BİLGİLERİ */}
        <div className="border-b border-slate-100 pb-2 mb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-sm text-slate-700">{order.customer_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onCall}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                title="Müşteriyi Ara"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onOpenMaps}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                title="Müşteriye Git"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-start gap-1.5 text-xs text-slate-600">
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="line-clamp-4">{order.delivery_address}</span>
          </div>
        </div>

        {/* SİPARİŞ BİLGİLERİ */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Sipariş İçeriği</span>
            <span className="font-bold text-sm">{formatCurrency(order.total_amount)}</span>
          </div>
          <div className="text-xs text-slate-500">
            {order.items?.map((item, idx) => (
              <span key={idx}>
                {item.quantity}x {item.name}{idx < order.items.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Not - Renkli kalacak */}
        {order.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2 text-xs space-y-1">
            {/* Müşteri notları (kırmızı) */}
            {order.notes.includes("CUSTOMER:") && (() => {
              const customerMatch = order.notes.match(/CUSTOMER:([^|]*)/);
              const customerNotes = customerMatch ? customerMatch[1].split(";").filter(n => n.trim()) : [];
              return customerNotes.length > 0 && (
                <div className="text-red-700 font-semibold">
                  ⚠️ {customerNotes.join(" • ")}
                </div>
              );
            })()}
            {/* Mutfak notları (normal) */}
            {order.notes.includes("KITCHEN:") && (() => {
              const kitchenMatch = order.notes.match(/KITCHEN:([^|]*)/);
              const kitchenNotes = kitchenMatch ? kitchenMatch[1].split(";").filter(n => n.trim()) : [];
              return kitchenNotes.length > 0 && (
                <div className="text-yellow-800">
                  🍽️ {kitchenNotes.join(" • ")}
                </div>
              );
            })()}
            {/* Eski format notlar (CUSTOMER/KITCHEN içermeyenler) */}
            {!order.notes.includes("CUSTOMER:") && !order.notes.includes("KITCHEN:") && (
              <div className="text-yellow-800">
                📝 {order.notes}
              </div>
            )}
          </div>
        )}

        {/* Aksiyonlar */}
        <div className="flex gap-2 mt-3">
          {order.status === "confirmed" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-50 h-9"
                onClick={onNotReady}
                disabled={loading}
                data-testid={`not-ready-btn-${order.id}`}
              >
                <Clock className="w-4 h-4 mr-1" />
                Hazır Değil
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 h-9"
                onClick={onPickup}
                disabled={loading}
                data-testid={`pickup-btn-${order.id}`}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4 mr-1.5" />
                )}
                Yola Çık
              </Button>
            </>
          )}
          {order.status === "on_the_way" && (
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 h-9"
              onClick={onDeliver}
              disabled={loading}
              data-testid={`deliver-btn-${order.id}`}
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1.5" />
              )}
              Teslim Et
            </Button>
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
              {order.customer_phone}
            </button>
          </div>

          {/* Adres */}
          <div className="border rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Teslimat Adresi
            </div>
            <p className="text-xs">{order.delivery_address}</p>
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
            <ul className="space-y-0.5">
              {order.items?.map((item, idx) => (
                <li key={idx} className="text-xs flex justify-between">
                  <span>{item.quantity}x {item.name}</span>
                  <span className="text-muted-foreground">{formatCurrency(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t mt-1.5 pt-1.5 flex justify-between font-semibold text-xs">
              <span>Toplam</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </div>

          {/* Not */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
              <span className="font-medium text-yellow-800">Not:</span> {order.notes}
            </div>
          )}

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
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{order.order_number}</span>
              <span className={`text-sm font-bold ${paymentInfo.color}`}>
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{order.customer_name}</p>
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
