import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote, CreditCard } from "lucide-react";
import { formatMoney } from "./utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function OrderTable({ orders, colorClass }) {
  if (!orders || orders.length === 0) return null;
  
  const formatDistance = (km) => {
    if (!km) return "-";
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km} km`;
  };
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={`border-b text-left ${colorClass.text}`}>
            <th className="pb-2 pr-2">Restoran</th>
            <th className="pb-2 pr-2">Müşteri</th>
            <th className="pb-2 pr-2">Adres</th>
            <th className="pb-2 pr-2 text-center">Mesafe</th>
            <th className="pb-2 text-right">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, idx) => (
            <tr key={idx} className={`border-b ${colorClass.border} last:border-0`}>
              <td className="py-1.5 pr-2 truncate max-w-[120px]" title={order.restaurant}>{order.restaurant}</td>
              <td className="py-1.5 pr-2 truncate max-w-[100px]" title={order.customer}>{order.customer}</td>
              <td className="py-1.5 pr-2 truncate max-w-[180px]" title={order.address}>{order.address}</td>
              <td className="py-1.5 pr-2 text-center">{formatDistance(order.distance_km)}</td>
              <td className="py-1.5 text-right font-medium">{formatMoney(order.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OdemeRaporu({ courierId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  }, []);

  const handleGenerate = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        courier_id: courierId,
        start_date: startDate,
        end_date: endDate
      });
      const res = await axios.get(`${API}/reports/courier/payments?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error("Rapor yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="payment-start-date"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="payment-end-date"
        />
        <Button onClick={handleGenerate} disabled={loading} size="sm" className="h-9" data-testid="btn-payment-report">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Banknote className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-green-600 font-medium">Nakit ({data.cash_orders?.length || 0} sipariş)</p>
                    <p className="text-xl font-bold text-green-700">{formatMoney(data.cash_total)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Kredi Kartı ({data.card_orders?.length || 0} sipariş)</p>
                    <p className="text-xl font-bold text-blue-700">{formatMoney(data.card_total)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Nakit Siparişler Tablosu */}
          {data.cash_orders?.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-green-700 mb-3">Nakit Siparişler</h4>
              <div className="max-h-64 overflow-y-auto">
                <OrderTable 
                  orders={data.cash_orders} 
                  colorClass={{ text: "text-green-600", border: "border-green-100" }} 
                />
              </div>
            </div>
          )}

          {/* Kredi Kartı Siparişler Tablosu */}
          {data.card_orders?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-blue-700 mb-3">Kredi Kartı Siparişler</h4>
              <div className="max-h-64 overflow-y-auto">
                <OrderTable 
                  orders={data.card_orders} 
                  colorClass={{ text: "text-blue-600", border: "border-blue-100" }} 
                />
              </div>
            </div>
          )}

          {/* Boş durum */}
          {data.cash_orders?.length === 0 && data.card_orders?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Bu tarih aralığında sipariş bulunamadı</p>
          )}
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Tarih seçip "Göster" butonuna tıklayın</p>
      )}
    </div>
  );
}
