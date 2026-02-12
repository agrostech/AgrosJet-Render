import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Package, MapPin, Phone, Clock, User, Store } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GecmisSiparislerPage({ companyId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/orders/${companyId}?status=delivered`);
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
          <CardTitle className="text-base">Teslim Edilen Siparişler ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Teslim edilmiş sipariş bulunamadı</p>
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
                        <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">
                          Teslim Edildi
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
                      {order.courier_name && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <User className="w-3 h-3" />
                          <span>{order.courier_name}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(order.delivered_at || order.updated_at)}
                      </div>
                      {order.total_amount && (
                        <div className="font-semibold text-sm mt-1">
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
            <DialogTitle>Sipariş Detayı</DialogTitle>
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
                  <span className="text-muted-foreground">Kurye:</span>
                  <span className="font-medium">{selectedOrder.courier_name || "-"}</span>
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
                  <span className="font-medium">{selectedOrder.total_amount?.toFixed(2) || "0.00"} ₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oluşturulma:</span>
                  <span className="font-medium">{formatDate(selectedOrder.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teslim:</span>
                  <span className="font-medium">{formatDate(selectedOrder.delivered_at || selectedOrder.updated_at)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
