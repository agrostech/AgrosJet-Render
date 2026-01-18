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
import { CheckCircle } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/admin`);
      setOrders(res.data);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
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
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleCancel = async (orderId) => {
    if (!window.confirm("Bu siparişi iptal etmek istediğinize emin misiniz? Puanlar iade edilecek.")) return;
    try {
      await axios.delete(`${API}/jetpuan/orders/${orderId}`);
      toast.success("Sipariş iptal edildi");
      fetchOrders();
      refreshBadges();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İptal başarısız");
    }
  };

  const filteredOrders = filterStatus === "all"
    ? orders
    : orders.filter(o => o.status === filterStatus);

  const pendingCount = orders.filter(o => o.status === "pending").length;

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Siparişler</h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
              {pendingCount} Bekliyor
            </span>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-10 border-2">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="pending">Bekliyor</SelectItem>
            <SelectItem value="delivered">Teslim Edildi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
            Sipariş bulunmuyor
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className={`border-2 bg-white p-4 ${order.status === 'pending' ? 'border-amber-300' : 'border-border'}`}>
              <div className="flex flex-col sm:flex-row justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      order.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {order.status === 'pending' ? 'Bekliyor' : 'Teslim Edildi'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <p className="font-semibold">{order.courier_name}</p>
                  <p className="text-sm text-muted-foreground">{order.courier_phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{order.total_points} JP</p>
                  <p className="text-xs text-muted-foreground">{order.items.length} ürün</p>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex flex-wrap gap-2 mb-3">
                  {order.items.map((item, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 bg-slate-100 rounded">
                      {item.product_name} x{item.quantity}
                    </span>
                  ))}
                </div>
                
                {order.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleDeliver(order.id)} className="flex-1 h-9 font-semibold bg-green-600 hover:bg-green-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Teslim Et
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleCancel(order.id)} className="h-9 border-2 hover:bg-red-50 hover:text-red-600">
                      İptal Et
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
