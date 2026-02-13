import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Package, MapPin, Clock, Store, XCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IptalSiparislerPage({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/orders/${companyId}?status=cancelled`);
      setOrders(res.data);
    } catch (err) {
      console.error("Orders fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">İptal Edilen Siparişler ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>İptal edilmiş sipariş bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div 
                  key={order.id}
                  className="p-3 rounded-lg border bg-white cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setSelectedOrder(order);
                    setShowDetailModal(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{order.order_number || order.id?.slice(0, 8)}</span>
                        <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          İptal Edildi
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Store className="w-3 h-3" />
                        <span>{order.restaurant_name || "Restoran"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{order.delivery_address || "-"}</span>
                      </div>
                      {order.cancellation_reason && (
                        <div className="text-xs text-red-600 mt-1">
                          İptal Sebebi: {order.cancellation_reason}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(order.cancelled_at || order.updated_at)}
                      </div>
                      {order.total_amount && (
                        <div className="font-semibold text-sm mt-1 line-through text-muted-foreground">
                          {order.total_amount.toFixed(2)} ₺
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>İptal Sipariş Detayı</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sipariş No:</span>
                  <span className="font-medium">{selectedOrder.order_number || selectedOrder.id?.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Restoran:</span>
                  <span className="font-medium">{selectedOrder.restaurant_name || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Müşteri:</span>
                  <span className="font-medium">{selectedOrder.customer_name || "-"}</span>
                </div>
                {selectedOrder.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefon:</span>
                    <span className="font-medium font-mono">{selectedOrder.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adres:</span>
                  <span className="font-medium text-right max-w-[200px]">{selectedOrder.delivery_address || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tutar:</span>
                  <span className="font-medium line-through">{selectedOrder.total_amount?.toFixed(2) || "0.00"} ₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oluşturulma:</span>
                  <span className="font-medium">{formatDate(selectedOrder.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">İptal Tarihi:</span>
                  <span className="font-medium">{formatDate(selectedOrder.cancelled_at || selectedOrder.updated_at)}</span>
                </div>
                {selectedOrder.cancellation_reason && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground">İptal Sebebi:</span>
                    <p className="font-medium text-red-600 mt-1">{selectedOrder.cancellation_reason}</p>
                  </div>
                )}
                {selectedOrder.cancelled_by && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">İptal Eden:</span>
                    <span className="font-medium">{selectedOrder.cancelled_by}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
