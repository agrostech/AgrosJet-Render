import { useState, useMemo, useEffect } from "react";
import axios from "axios";
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
  ClipboardList, Truck, CheckCircle, XCircle, RefreshCw, 
  Package, Timer, TrendingUp, Info, Plus, Phone, Calendar, Bike, UserPlus
} from "lucide-react";
import NewOrderModal from "@/components/restoran/NewOrderModal";
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

export default function RestaurantAnasayfa({ orders, loading, onUpdateStatus, onAssignCourier, onRefresh, restaurantId }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);
  const [availableCouriers, setAvailableCouriers] = useState([]);
  const [courierRestrictionMode, setCourierRestrictionMode] = useState("all");

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

  // Get payment badge
  const getPaymentBadge = (method) => {
    const styles = {
      cash: 'bg-emerald-100 text-emerald-700',
      card: 'bg-blue-100 text-blue-700',
      online: 'bg-purple-100 text-purple-700'
    };
    const labels = {
      cash: 'Nakit',
      card: 'Kart',
      online: 'Online'
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded ${styles[method] || 'bg-gray-100 text-gray-700'}`}>
        {labels[method] || method}
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

      {/* Stats Cards */}
      <TooltipProvider>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.todayTotal}</p>
                  <p className="text-xs text-muted-foreground">Bugün Toplam</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Bekleyen</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-cyan-600" />
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
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.delivered}</p>
                  <p className="text-xs text-muted-foreground">Teslim</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Timer className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.avgPrepTime} dk</p>
                    <p className="text-xs text-muted-foreground">Ort. Hazırlık</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                      <Info className="w-3 h-3 text-slate-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[250px]">
                    <p className="text-sm font-medium">Ortalama Hazırlık Süresi</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sipariş sisteme düştükten sonra kurye yola çıkana kadar geçen ortalama süre.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.avgDeliveryTime} dk</p>
                    <p className="text-xs text-muted-foreground">Ort. Teslimat</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                      <Info className="w-3 h-3 text-slate-500" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[250px]">
                    <p className="text-sm font-medium">Ortalama Teslimat Süresi</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sipariş sisteme düştükten sonra müşteriye teslim edilene kadar geçen toplam ortalama süre.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

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
                              <div>
                                <span className="text-sm">{order.customer_name || "-"}</span>
                                {order.customer_phone && (
                                  <div className="text-xs text-muted-foreground font-mono">{order.customer_phone}</div>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-xs align-top" title={order.delivery_address}>
                              <div className="line-clamp-3 leading-relaxed">{order.delivery_address || "-"}</div>
                            </td>
                            <td className="p-2 text-xs whitespace-nowrap">{getOrderDistance(order) || "-"}</td>
                            <td className="p-2 font-semibold whitespace-nowrap">{formatCurrency(order.total_amount)}</td>
                            <td className="p-2">{getPaymentBadge(order.payment_method)}</td>
                            <td className="p-2">
                              {/* Kurye atandıysa veya teslim/iptal ise dropdown pasif */}
                              {order.courier_id || order.status === 'delivered' || order.status === 'cancelled' ? (
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
                                    <SelectItem value="on_the_way" className="text-xs">Yolda</SelectItem>
                                    <SelectItem value="delivered" className="text-xs">Teslim Edildi</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="p-2">
                              {order.courier_name ? (
                                <div className="text-xs">
                                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium flex items-center gap-1 w-fit">
                                    <Bike className="w-3 h-3" />
                                    {order.courier_name}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5 pl-1">
                                    {order.courier_phone && (
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
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
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
    </div>
  );
}
