import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Banknote, CreditCard, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
            <th className="pb-2 pr-2">Tarih</th>
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
              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{order.date}</td>
              <td className="py-1.5 pr-2 truncate max-w-[120px]" title={order.restaurant}>{order.restaurant}</td>
              <td className="py-1.5 pr-2 truncate max-w-[100px]" title={order.customer}>{order.customer}</td>
              <td className="py-1.5 pr-2 truncate max-w-[180px]" title={order.address}>{order.address}</td>
              <td className="py-1.5 pr-2 text-center">{formatDistance(order.distance_km)}</td>
              <td className="py-1.5 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  {formatMoney(order.amount)}
                  {(order.is_split || order.is_modified) && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-amber-500 hover:text-amber-600" onClick={(e) => e.stopPropagation()}>
                          <Info className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2 text-xs" align="end">
                        {order.is_split && (
                          <div className="text-amber-600">Parçalı ödeme - bu tutar siparişin bir kısmıdır</div>
                        )}
                        {order.is_modified && (
                          <div className="text-amber-600">Ödeme yöntemi teslim sırasında değiştirildi</div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OdemeRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  useEffect(() => {
    const initDates = async () => {
      let openingTime = "06:00";
      let closingTime = "05:59";
      
      // Şirket bilgilerini al
      if (companyId) {
        try {
          const res = await axios.get(`${API}/companies/${companyId}`);
          if (res.data) {
            openingTime = res.data.opening_time || "06:00";
            closingTime = res.data.closing_time || "05:59";
          }
        } catch (err) {
          console.error("Şirket bilgisi alınamadı:", err);
        }
      }
      
      // Bugün ve yarın tarihlerini oluştur
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const formatDate = (d) => d.toISOString().split('T')[0];
      
      setStartDateTime(`${formatDate(today)}T${openingTime}`);
      setEndDateTime(`${formatDate(tomorrow)}T${closingTime}`);
    };
    
    initDates();
  }, [companyId]);

  const handleGenerate = async () => {
    if (!startDateTime || !endDateTime) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        courier_id: courierId,
        start_datetime: startDateTime,
        end_datetime: endDateTime
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
          type="datetime-local"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          className="h-9 w-auto"
          data-testid="payment-start-date"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="datetime-local"
          value={endDateTime}
          onChange={(e) => setEndDateTime(e.target.value)}
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
          {/* Nakit Kart - Özet ve Siparişler Birleşik */}
          <Card className="border-green-200 overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="bg-green-50 p-4 flex items-center gap-3 border-b border-green-200">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-green-600 font-medium">Nakit ({data.cash_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold text-green-700">{formatMoney(data.cash_total)}</p>
                </div>
              </div>
              {/* Sipariş Tablosu */}
              {data.cash_orders?.length > 0 && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <OrderTable 
                    orders={data.cash_orders} 
                    colorClass={{ text: "text-green-600", border: "border-green-100" }} 
                  />
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Kredi Kartı - Özet ve Siparişler Birleşik */}
          <Card className="border-blue-200 overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="bg-blue-50 p-4 flex items-center gap-3 border-b border-blue-200">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 font-medium">Kredi Kartı ({data.card_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold text-blue-700">{formatMoney(data.card_total)}</p>
                </div>
              </div>
              {/* Sipariş Tablosu */}
              {data.card_orders?.length > 0 && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <OrderTable 
                    orders={data.card_orders} 
                    colorClass={{ text: "text-blue-600", border: "border-blue-100" }} 
                  />
                </div>
              )}
            </CardContent>
          </Card>

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
