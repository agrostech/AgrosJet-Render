import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Check, X, Clock, Package } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCancelOrderId, setPendingCancelOrderId] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/admin`);
      setOrders(res.data);
    } catch (err) {
      if (!err.handled) {
      toast.error("Siparişler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const refreshBadges = () => {
    window.dispatchEvent(new Event('refreshBadges'));
  };

  const handleDeliver = async (orderId) => {
    try {
      await axios.put(`${API}/jetpuan/orders/${orderId}/deliver`);
      toast.success("Sipariş teslim edildi");
      fetchOrders();
      refreshBadges();
    } catch (err) {
      if (!err.handled) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
      }
    }
  };

  const handleCancel = async (orderId) => {
    setPendingCancelOrderId(orderId);
    setConfirmOpen(true);
  };

  const confirmCancel = async () => {
    if (!pendingCancelOrderId) return;
    try {
      await axios.delete(`${API}/jetpuan/orders/${pendingCancelOrderId}`);
      toast.success("Sipariş iptal edildi");
      fetchOrders();
      refreshBadges();
    } catch (err) {
      if (!err.handled) {
      toast.error(err.response?.data?.detail || "İptal başarısız");
      }
    } finally {
      setConfirmOpen(false);
      setPendingCancelOrderId(null);
    }
  };

  const filteredOrders = filterStatus === "all"
    ? orders
    : orders.filter(o => o.status === filterStatus);

  const pendingCount = orders.filter(o => o.status === "pending").length;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { 
      day: '2-digit', 
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Siparişler</h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-medium rounded-full border border-amber-200">
              {pendingCount} bekliyor
            </span>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-8 text-sm border">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="pending">Bekliyor</SelectItem>
            <SelectItem value="delivered">Teslim Edildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sipariş bulunmuyor</p>
        </div>
      ) : (
        <div className="divide-y divide-border border rounded-lg bg-white overflow-hidden">
          {filteredOrders.map((order) => (
            <div key={order.id} className="p-3 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                {/* Left: Status + Info */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Status Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    order.status === 'pending' 
                      ? 'bg-amber-50 text-amber-500' 
                      : 'bg-green-50 text-green-500'
                  }`}>
                    {order.status === 'pending' ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{order.courier_name}</span>
                      <span className="text-xs text-muted-foreground">{order.courier_phone}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        {order.items.map(i => `${i.product_name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Right: Points + Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-bold text-primary whitespace-nowrap">{order.total_points} JP</span>
                  
                  {order.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        onClick={() => handleDeliver(order.id)} 
                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Teslim
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => handleCancel(order.id)} 
                        className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sipariş İptali"
        description="Bu siparişi iptal etmek istediğinize emin misiniz? Puanlar iade edilecek."
        onConfirm={confirmCancel}
        variant="warning"
      />
    </div>
  );
}
