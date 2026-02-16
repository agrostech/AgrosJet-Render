import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  ClipboardList, Truck, CheckCircle, XCircle, RefreshCw, 
  Package, Timer, TrendingUp, Info, Plus, Phone, Calendar
} from "lucide-react";
import NewOrderModal from "@/components/restoran/NewOrderModal";

export default function RestaurantAnasayfa({ orders, loading, onUpdateStatus, onRefresh, restaurantId }) {
  const [activeTab, setActiveTab] = useState("pending");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);

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
      pending: orders.filter(o => o.status === "pending" || o.status === "preparing").length,
      scheduled: orders.filter(o => o.status === "scheduled").length,
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
        // Bekleyen sekmesi: pending, preparing, ready, assigned, confirmed
        return orders.filter(o => 
          o.status === "pending" || 
          o.status === "preparing" || 
          o.status === "ready" || 
          o.status === "assigned" || 
          o.status === "confirmed"
        );
      case "scheduled":
        return orders.filter(o => o.status === "scheduled");
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
  const formatTime = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleTimeString("tr-TR", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: "Bekliyor", className: "bg-yellow-100 text-yellow-800" },
      scheduled: { label: "Programlı", className: "bg-indigo-100 text-indigo-800" },
      preparing: { label: "Hazırlanıyor", className: "bg-blue-100 text-blue-800" },
      ready: { label: "Hazır", className: "bg-green-100 text-green-800" },
      assigned: { label: "Kurye Atandı", className: "bg-purple-100 text-purple-800" },
      on_the_way: { label: "Yolda", className: "bg-cyan-100 text-cyan-800" },
      delivered: { label: "Teslim Edildi", className: "bg-emerald-100 text-emerald-800" },
      cancelled: { label: "İptal", className: "bg-red-100 text-red-800" }
    };
    const s = statusMap[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={s.className}>{s.label}</Badge>;
  };

  // Get payment method label
  const getPaymentLabel = (method) => {
    const map = {
      cash: "Nakit",
      card: "Kredi Kartı",
      online: "Online"
    };
    return map[method] || method;
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
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="tab-pending">
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Bekleyen</span>
                {stats.pending > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="flex items-center gap-2" data-testid="tab-scheduled">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Programlı</span>
                {stats.scheduled > 0 && (
                  <Badge variant="secondary" className="ml-1">{stats.scheduled}</Badge>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Sipariş No</TableHead>
                        <TableHead>Müşteri</TableHead>
                        <TableHead>Adres</TableHead>
                        <TableHead className="text-right">Tutar</TableHead>
                        <TableHead>Ödeme</TableHead>
                        <TableHead>Kurye</TableHead>
                        <TableHead>{activeTab === "scheduled" ? "Teslimat Zamanı" : "Saat"}</TableHead>
                        <TableHead>Durum</TableHead>
                        {(activeTab === "pending" || activeTab === "scheduled") && <TableHead className="text-right">İşlem</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">
                            {order.order_number}
                            {order.source === "manual" && (
                              <Badge variant="outline" className="ml-1 text-xs bg-blue-50">
                                <Phone className="w-3 h-3 mr-1" />
                                Tel
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{order.customer_name || "-"}</p>
                              <p className="text-xs text-muted-foreground">{order.customer_phone || "-"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={order.delivery_address}>
                            {order.delivery_address || "-"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {order.total_amount?.toFixed(2)} ₺
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getPaymentLabel(order.payment_method)}</Badge>
                          </TableCell>
                          <TableCell>
                            {order.courier_name || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.is_scheduled && order.scheduled_time ? (
                              <div className="flex flex-col">
                                <span className="font-medium text-indigo-600">
                                  {new Date(order.scheduled_time).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(order.scheduled_time).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            ) : (
                              formatTime(order.created_at)
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          {activeTab === "pending" && (
                            <TableCell className="text-right">
                              {!order.courier_id && (
                                <div className="flex gap-1 justify-end">
                                  {order.status === "pending" && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => onUpdateStatus(order.id, "preparing")}
                                      data-testid={`btn-preparing-${order.id}`}
                                    >
                                      Hazırlanıyor
                                    </Button>
                                  )}
                                  {order.status === "preparing" && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="bg-green-50 text-green-700 border-green-200"
                                      onClick={() => onUpdateStatus(order.id, "ready")}
                                      data-testid={`btn-ready-${order.id}`}
                                    >
                                      Hazır
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          )}
                          {activeTab === "scheduled" && (
                            <TableCell className="text-right">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => onUpdateStatus(order.id, "preparing")}
                                data-testid={`btn-start-preparing-${order.id}`}
                              >
                                Hazırlamaya Başla
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
