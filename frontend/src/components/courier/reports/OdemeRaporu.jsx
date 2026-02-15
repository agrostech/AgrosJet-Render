import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote, CreditCard } from "lucide-react";
import { formatMoney } from "./utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

          {/* Sipariş Listeleri */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nakit Siparişler */}
            {data.cash_orders?.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-green-700 mb-2">Nakit Siparişler</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                  {data.cash_orders.map((order, idx) => (
                    <div key={idx} className="flex justify-between text-green-800 py-1 border-b border-green-100 last:border-0">
                      <span className="truncate flex-1">{order.restaurant}</span>
                      <span className="font-medium ml-2">{formatMoney(order.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kredi Kartı Siparişler */}
            {data.card_orders?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-blue-700 mb-2">Kredi Kartı Siparişler</h4>
                <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                  {data.card_orders.map((order, idx) => (
                    <div key={idx} className="flex justify-between text-blue-800 py-1 border-b border-blue-100 last:border-0">
                      <span className="truncate flex-1">{order.restaurant}</span>
                      <span className="font-medium ml-2">{formatMoney(order.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
