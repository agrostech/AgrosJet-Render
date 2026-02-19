import { useState, useMemo, useEffect } from "react";
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
  ClipboardList, Truck, CheckCircle, XCircle, RefreshCw, 
  Package, Timer, TrendingUp, Info, Plus, Phone, Calendar, Bike, UserPlus, Eye, Store, Home
} from "lucide-react";
import NewOrderModal from "@/components/restoran/NewOrderModal";
import OrderDetailModal from "@/components/restoran/OrderDetailModal";
import StoreStatusToggles from "@/components/restoran/StoreStatusToggles";
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestaurantAnasayfa({ orders, loading, onUpdateStatus, onAssignCourier, onRefresh, restaurantId, permissions = {} }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [availableCouriers, setAvailableCouriers] = useState([]);
  const [courierRestrictionMode, setCourierRestrictionMode] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [restaurantDeliveryConfirm, setRestaurantDeliveryConfirm] = useState(null);
  const [unmarkDeliveryConfirm, setUnmarkDeliveryConfirm] = useState(null);

  // İzin kontrolleri
  const canViewCourierPhone = permissions.can_view_courier_phone !== false; // Default true
  const canViewCourierLocation = permissions.can_view_courier_location !== false; // Default true
  const canMarkRestaurantDelivery = permissions.can_mark_restaurant_delivery === true; // Default false

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
      toast.success("Sipariş durumu güncellendi");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
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

  // Fetch available couriers
  useEffect(() => {
    const fetchCouriers = async () => {
      if (!restaurantId) return;
      try {
        const res = await axios.get(`${API}/orders/restaurant/${restaurantId}/available-couriers`);
        setAvailableCouriers(res.data.couriers || []);
        setCourierRestrictionMode(res.data.restriction_mode || "all");
      } catch (err) {
        console.error("Kuryeler yüklenemedi:", err);
      }
    };
    
    fetchCouriers();
    // Her 10 saniyede bir kurye listesini güncelle
    const interval = setInterval(fetchCouriers, 10000);
    return () => clearInterval(interval);
  }, [restaurantId]);

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

  return (
    <div className="space-y-6" data-testid="restaurant-anasayfa">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Anasayfa</h1>
          <p className="text-sm text-muted-foreground">Güncel sipariş durumu</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setNewOrderModalOpen(true)} data-testid="new-order-btn">
            <Plus className="w-4 h-4 mr-2" />
            Yeni Sipariş
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
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
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-slate-800">{stats.todayTotal}</span>
              <span className="text-xs text-slate-500">Bugün</span>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-amber-600">{stats.pending}</span>
              <span className="text-xs text-slate-500">Bekleyen</span>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-blue-600">{stats.onTheWay}</span>
              <span className="text-xs text-slate-500">Yolda</span>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold text-green-600">{stats.delivered}</span>
              <span className="text-xs text-slate-500">Teslim</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
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
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="tab-pending">
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Bekleyen</span>
                {stats.pending > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="on_the_way" className="flex items-center gap-2" data-testid="tab-on-the-way">
                <Truck className="w-4 h-4" />
                <span className="hidden sm:inline">Yolda</span>
                {stats.onTheWay > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.onTheWay}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivered" className="flex items-center gap-2" data-testid="tab-delivered">
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Teslim</span>
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="flex items-center gap-2" data-testid="tab-cancelled">
                <XCircle className="w-4 h-4" />
                <span className="hidden sm:inline">İptal</span>
              </TabsTrigger>
            </TabsList>

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
                        <th className="text-left p-2 font-bold text-xs">Ücret</th>
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
                              {/* Restoran teslimatı siparişleri için özel dropdown */}
                              {order.is_restaurant_delivery ? (
                                <Select 
                                  value={order.status} 
                                  onValueChange={(newValue) => handleRestaurantDeliveryStatus(order.id, newValue)}
                                  disabled={order.status === 'delivered' || order.status === 'cancelled'}
                                >
                                  <SelectTrigger className="bg-orange-100 text-orange-700 font-medium text-xs px-2 py-0.5 h-7 border border-orange-300/50 w-[135px] shadow-sm">
                                    <SelectValue>
                                      {ORDER_STATUSES[order.status]?.label || order.status}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <div className="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-50">Restoran Teslimatı</div>
                                    <SelectItem value="preparing" className="text-xs">Hazırlanıyor</SelectItem>
                                    <SelectItem value="confirmed" className="text-xs">Onaylandı</SelectItem>
                                    <SelectItem value="on_the_way" className="text-xs">Yolda</SelectItem>
                                    <SelectItem value="delivered" className="text-xs">Teslim Edildi</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : order.courier_id || order.status === 'delivered' || order.status === 'cancelled' ? (
                                /* Kurye atandıysa veya teslim/iptal ise dropdown pasif */
                                <span className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-1 rounded border border-slate-300/50 inline-block text-center opacity-70 whitespace-nowrap min-w-[135px]`}>
                                  {statusInfo.label}
                                </span>
                              ) : (
                                <Select 
                                  value={order.status} 
                                  onValueChange={(newValue) => {
                                    if (newValue.startsWith('preparing_')) {
                                      onUpdateStatus(order.id, 'preparing', parseInt(newValue.split('_')[1]));
                                    } else {
                                      onUpdateStatus(order.id, newValue);
                                    }
                                  }}
                                >
                                  <SelectTrigger className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-0.5 h-7 border border-slate-300/50 w-[135px] shadow-sm`}>
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
                                    <SelectItem value="on_the_way" className="text-xs">Yolda</SelectItem>
                                    <SelectItem value="delivered" className="text-xs">Teslim Edildi</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="p-2">
                              {/* Restoran teslimatı ise "Restoran" göster */}
                              {order.is_restaurant_delivery ? (
                                <span className="text-xs px-2 py-1 border border-slate-300 text-slate-600 rounded font-medium flex items-center gap-1 w-fit">
                                  <Home className="w-3 h-3" />
                                  Restoran
                                </span>
                              ) : order.courier_name ? (
                                <div className="text-xs">
                                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium flex items-center gap-1 w-fit">
                                    <Bike className="w-3 h-3" />
                                    {order.courier_name}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5 pl-1">
                                    {canViewCourierPhone && order.courier_phone && (
                                      <a href={`tel:${order.courier_phone}`} className="text-muted-foreground font-mono hover:text-primary text-[11px]">
                                        {order.courier_phone}
                                      </a>
                                    )}
                                    {order.courier_location && !['on_the_way', 'delivered', 'cancelled'].includes(order.status) && (() => {
                                      const eta = getEstimatedArrival(order.courier_location, order.restaurant_location);
                                      return eta ? (
                                        <span className="text-blue-600 text-[10px]">{eta.text}</span>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                /* Kurye atanmamış - dropdown göster (sadece paketi olan kurye varsa) */
                                courierRestrictionMode === "restricted" && availableCouriers.length > 0 ? (
                                  <Select onValueChange={(courierId) => onAssignCourier(order.id, courierId)}>
                                    <SelectTrigger className="h-7 text-xs w-[120px] border-dashed">
                                      <SelectValue placeholder="Kurye Ata" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <div className="px-2 py-1 text-[10px] text-amber-600 bg-amber-50 border-b">
                                        Sadece paketi olan kuryeler
                                      </div>
                                      {availableCouriers.map((courier) => (
                                        <SelectItem key={courier.id} value={courier.id} className="text-xs">
                                          <div className="flex items-center gap-2">
                                            <span>{courier.name}</span>
                                            {courier.package_count > 0 && (
                                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                                {courier.package_count} paket
                                              </Badge>
                                            )}
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
                                          <button
                                            className="h-7 w-7 rounded border-2 border-slate-400 flex items-center justify-center hover:border-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => setUnmarkDeliveryConfirm(order)}
                                          >
                                            <Home className="w-4 h-4 text-slate-500" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>Kurye Şirketine Aktar</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    // Teslim edilmiş veya izin yoksa sadece görsel
                                    <div className="h-7 w-7 rounded border-2 border-slate-300 flex items-center justify-center opacity-50">
                                      <Home className="w-4 h-4 text-slate-400" />
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
                                            <Home className="w-4 h-4 text-slate-400" />
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
              <Home className="w-5 h-5 text-slate-600" />
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
    </div>
  );
}
