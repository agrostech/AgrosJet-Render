import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Package, CheckCircle, Clock } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function OrdersTab({ courierId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/jetpuan/orders/courier/${courierId}`);
      setOrders(res.data);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Henüz sipariş vermediniz</p>
        </div>
      ) : (
        orders.map((order) => (
          <div key={order.id} className={`border-2 bg-white p-4 ${
            order.status === 'pending' ? 'border-amber-300' : 'border-green-300'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {order.status === 'pending' ? (
                  <Clock className="w-5 h-5 text-amber-600" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                <span className={`text-sm font-semibold ${
                  order.status === 'pending' ? 'text-amber-600' : 'text-green-600'
                }`}>
                  {order.status === 'pending' ? 'Hazırlanıyor' : 'Teslim Edildi'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString('tr-TR')}
              </span>
            </div>
            
            <div className="space-y-2 mb-3">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>{item.product_name} x{item.quantity}</span>
                  <span className="font-medium">{item.total} JP</span>
                </div>
              ))}
            </div>
            
            <div className="pt-3 border-t border-border flex justify-between items-center">
              <span className="font-medium">Toplam:</span>
              <span className="text-xl font-bold text-amber-600">{order.total_points} JP</span>
            </div>
            
            {order.status === 'delivered' && order.delivered_at && (
              <p className="text-xs text-green-600 mt-2">
                Teslim: {new Date(order.delivered_at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
