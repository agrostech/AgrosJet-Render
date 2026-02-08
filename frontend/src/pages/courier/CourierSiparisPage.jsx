import { useState, useEffect, useCallback } from "react";
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
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Sipariş durumları ve renkler
const ORDER_STATUS_CONFIG = {
  assigned: { label: "Yeni Sipariş", color: "bg-purple-500", textColor: "text-purple-600" },
  confirmed: { label: "Onaylandı", color: "bg-blue-500", textColor: "text-blue-600" },
  on_the_way: { label: "Yolda", color: "bg-cyan-500", textColor: "text-cyan-600" },
  delivered: { label: "Teslim Edildi", color: "bg-green-500", textColor: "text-green-600" },
};

// Ödeme yöntemi
const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: Banknote },
  card: { label: "Kart", icon: CreditCard },
  online: { label: "Online", icon: CreditCard },
};

// Zaman formatı
const formatTime = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
};

export default function CourierSiparisPage({ courierId, companyId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Siparişleri getir
  const fetchOrders = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/orders/courier/${courierId}/active`);
      setOrders(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Siparişler yüklenemedi");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [courierId]);

  useEffect(() => {
    if (courierId) {
      fetchOrders();
      // Her 15 saniyede bir siparişleri güncelle
      const interval = setInterval(() => fetchOrders(false), 15000);
      return () => clearInterval(interval);
    }
  }, [courierId, fetchOrders]);

  // Siparişi onayla (Gördüm)
  const handleConfirmOrder = async (orderId) => {
    setActionLoading(orderId);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${orderId}/confirm`);
      toast.success("Sipariş onaylandı");
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
      toast.success("Sipariş yola çıktı");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
  };

  // Siparişi teslim et
  const handleDeliverOrder = async (orderId) => {
    setActionLoading(orderId);
    try {
      await axios.post(`${API}/orders/courier/${courierId}/order/${orderId}/deliver`);
      toast.success("Sipariş teslim edildi");
      fetchOrders();
      setShowDetailModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setActionLoading(null);
    }
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
  const newOrders = orders.filter((o) => o.status === "assigned");
  const activeOrders = orders.filter((o) => ["confirmed", "on_the_way"].includes(o.status));

  return (
    <div className="space-y-4" data-testid="courier-siparis-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Siparişlerim</h2>
            <p className="text-sm text-muted-foreground">
              {orders.length > 0 ? `${orders.length} aktif sipariş` : "Aktif sipariş yok"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchOrders(true)}
          disabled={refreshing}
          data-testid="refresh-orders-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {/* Boş durum */}
      {orders.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-lg mb-1">Henüz sipariş yok</h3>
          <p className="text-sm text-muted-foreground">
            Size sipariş atandığında burada görünecek
          </p>
        </div>
      )}

      {/* Yeni Siparişler (Onay Bekleyen) */}
      {newOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold text-purple-700">
              Yeni Siparişler ({newOrders.length})
            </h3>
          </div>
          {newOrders.map((order) => (
            <NewOrderCard
              key={order.id}
              order={order}
              onConfirm={() => handleConfirmOrder(order.id)}
              loading={actionLoading === order.id}
            />
          ))}
        </div>
      )}

      {/* Aktif Siparişler */}
      {activeOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-blue-700">
              Aktif Siparişler ({activeOrders.length})
            </h3>
          </div>
          {activeOrders.map((order) => (
            <ActiveOrderCard
              key={order.id}
              order={order}
              onPickup={() => handlePickupOrder(order.id)}
              onDeliver={() => handleDeliverOrder(order.id)}
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
              onCall={() => callPhone(order.customer_phone)}
              loading={actionLoading === order.id}
            />
          ))}
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
    </div>
  );
}

// Yeni Sipariş Kartı (Onay Bekleyen)
function NewOrderCard({ order, onConfirm, loading }) {
  return (
    <div
      className="border-2 border-purple-300 bg-purple-50 rounded-lg overflow-hidden animate-pulse"
      data-testid={`new-order-card-${order.id}`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-500 text-white">Yeni Sipariş</Badge>
            <span className="text-sm font-mono text-muted-foreground">{order.order_number}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatTime(order.created_at)}
          </span>
        </div>

        {/* Restoran bilgisi */}
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Store className="w-4 h-4 text-purple-600" />
          <span className="font-medium">{order.restaurant_name}</span>
        </div>

        {/* Sipariş özeti (gizli) */}
        <div className="bg-white/50 rounded-lg p-3 mb-3 border border-purple-200">
          <div className="flex items-center gap-2 text-purple-700">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">
              Sipariş detaylarını görmek için onaylayın
            </span>
          </div>
        </div>

        {/* Onay butonu */}
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700"
          data-testid={`confirm-order-btn-${order.id}`}
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Eye className="w-4 h-4 mr-2" />
          )}
          Siparişi Gördüm
        </Button>
      </div>
    </div>
  );
}

// Aktif Sipariş Kartı
function ActiveOrderCard({ order, onPickup, onDeliver, onViewDetails, onOpenMaps, onCall, loading }) {
  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.confirmed;
  const PaymentIcon = PAYMENT_METHODS[order.payment_method]?.icon || Banknote;
  const paymentLabel = PAYMENT_METHODS[order.payment_method]?.label || "Nakit";

  return (
    <div
      className="border-2 border-border bg-white rounded-lg overflow-hidden"
      data-testid={`active-order-card-${order.id}`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.color} text-white`}>{statusConfig.label}</Badge>
            <span className="text-sm font-mono text-muted-foreground">{order.order_number}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PaymentIcon className="w-4 h-4" />
            <span>{paymentLabel}</span>
          </div>
        </div>

        {/* Restoran */}
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Store className="w-4 h-4 text-orange-500" />
          <span className="font-medium">{order.restaurant_name}</span>
        </div>

        {/* Müşteri */}
        <div className="flex items-center gap-2 mb-2 text-sm">
          <User className="w-4 h-4 text-blue-500" />
          <span>{order.customer_name}</span>
          <button
            onClick={onCall}
            className="ml-auto flex items-center gap-1 text-blue-600 hover:underline"
          >
            <Phone className="w-4 h-4" />
            <span>Ara</span>
          </button>
        </div>

        {/* Adres */}
        <div className="flex items-start gap-2 mb-3 text-sm">
          <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{order.delivery_address}</span>
        </div>

        {/* Ürünler */}
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sipariş İçeriği</span>
          </div>
          <ul className="space-y-1">
            {order.items?.map((item, idx) => (
              <li key={idx} className="text-sm flex justify-between">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="text-muted-foreground">{formatCurrency(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-border mt-2 pt-2 flex justify-between font-semibold">
            <span>Toplam</span>
            <span>{formatCurrency(order.total_amount)}</span>
          </div>
        </div>

        {/* Not */}
        {order.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3 text-sm">
            <span className="font-medium text-yellow-800">Not:</span> {order.notes}
          </div>
        )}

        {/* Aksiyonlar */}
        <div className="flex gap-2">
          {order.status === "confirmed" && (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={onOpenMaps}
                data-testid={`navigate-btn-${order.id}`}
              >
                <Navigation className="w-4 h-4 mr-1" />
                Yol Tarifi
              </Button>
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                onClick={onPickup}
                disabled={loading}
                data-testid={`pickup-btn-${order.id}`}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4 mr-1" />
                )}
                Yola Çık
              </Button>
            </>
          )}
          {order.status === "on_the_way" && (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={onOpenMaps}
                data-testid={`navigate-btn-${order.id}`}
              >
                <Navigation className="w-4 h-4 mr-1" />
                Yol Tarifi
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={onDeliver}
                disabled={loading}
                data-testid={`deliver-btn-${order.id}`}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1" />
                )}
                Teslim Et
              </Button>
            </>
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
  const PaymentIcon = PAYMENT_METHODS[order.payment_method]?.icon || Banknote;
  const paymentLabel = PAYMENT_METHODS[order.payment_method]?.label || "Nakit";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Sipariş Detayı
          </DialogTitle>
          <DialogDescription>
            {order.order_number} • {formatDate(order.created_at)} {formatTime(order.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Durum */}
          <div className="flex items-center justify-between">
            <Badge className={`${statusConfig.color} text-white`}>{statusConfig.label}</Badge>
            <div className="flex items-center gap-1 text-sm">
              <PaymentIcon className="w-4 h-4" />
              <span>{paymentLabel}</span>
              <span className="font-semibold ml-1">{formatCurrency(order.total_amount)}</span>
            </div>
          </div>

          {/* Restoran */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-1">
              <Store className="w-4 h-4 text-orange-500" />
              Restoran
            </div>
            <p className="text-sm">{order.restaurant_name}</p>
          </div>

          {/* Müşteri */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-1">
              <User className="w-4 h-4 text-blue-500" />
              Müşteri
            </div>
            <p className="text-sm">{order.customer_name}</p>
            <button
              onClick={onCall}
              className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
            >
              <Phone className="w-3 h-3" />
              {order.customer_phone}
            </button>
          </div>

          {/* Adres */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-1">
              <MapPin className="w-4 h-4 text-red-500" />
              Teslimat Adresi
            </div>
            <p className="text-sm">{order.delivery_address}</p>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-blue-600"
              onClick={onOpenMaps}
            >
              <Navigation className="w-3 h-3 mr-1" />
              Haritada Aç
            </Button>
          </div>

          {/* Ürünler */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Sipariş İçeriği
            </div>
            <ul className="space-y-1">
              {order.items?.map((item, idx) => (
                <li key={idx} className="text-sm flex justify-between">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t mt-2 pt-2 flex justify-between font-semibold text-sm">
              <span>Toplam</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
          </div>

          {/* Not */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <span className="font-medium text-yellow-800">Not:</span> {order.notes}
            </div>
          )}

          {/* Aksiyonlar */}
          <div className="flex gap-2 pt-2">
            {order.status === "confirmed" && (
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                onClick={onPickup}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Truck className="w-4 h-4 mr-1" />
                )}
                Yola Çık
              </Button>
            )}
            {order.status === "on_the_way" && (
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={onDeliver}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-1" />
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
