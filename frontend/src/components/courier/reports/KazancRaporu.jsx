import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Package, TrendingUp } from "lucide-react";
import { formatMoney } from "./utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KazancRaporu({ courierId, companyId }) {
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
      const res = await axios.get(`${API}/reports/courier/earnings?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error("Rapor yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentLabel = (method) => {
    if (method === "cash") return "Nakit";
    if (method === "card") return "Kart";
    if (method === "online") return "Online";
    return method || "-";
  };

  const getPaymentColor = (method) => {
    if (method === "cash") return "bg-green-100 text-green-700";
    if (method === "card") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  };

  const formatDistance = (km) => {
    if (!km) return "-";
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km} km`;
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
          data-testid="earnings-start-date"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 w-auto"
          data-testid="earnings-end-date"
        />
        <Button onClick={handleGenerate} disabled={loading} size="sm" className="h-9" data-testid="btn-earnings-report">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 font-medium">Paket Sayısı</p>
                    <p className="text-xl font-bold text-purple-700">{data.package_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-orange-600 font-medium">Toplam Hakediş</p>
                    <p className="text-xl font-bold text-orange-700">{formatMoney(data.total_earnings)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sipariş Listesi Tablosu */}
          {data.orders?.length > 0 && (
            <div className="bg-gray-50 border rounded-lg p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Sipariş Detayları</h4>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-2">Tarih</th>
                      <th className="pb-2 pr-2">Restoran</th>
                      <th className="pb-2 pr-2">Müşteri</th>
                      <th className="pb-2 pr-2">Adres</th>
                      <th className="pb-2 pr-2 text-center">Mesafe</th>
                      <th className="pb-2 pr-2 text-right">Tutar</th>
                      <th className="pb-2 pr-2 text-right">Hakediş</th>
                      <th className="pb-2 text-center">Ödeme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-100">
                        <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{order.date}</td>
                        <td className="py-1.5 pr-2 truncate max-w-[120px]" title={order.restaurant}>
                          {order.restaurant}
                        </td>
                        <td className="py-1.5 pr-2 truncate max-w-[100px]" title={order.customer}>
                          {order.customer}
                        </td>
                        <td className="py-1.5 pr-2 truncate max-w-[180px]" title={order.address}>
                          {order.address}
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          {formatDistance(order.distance_km)}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-gray-600">
                          {formatMoney(order.total_amount)}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-medium text-orange-600">
                          {formatMoney(order.courier_fee)}
                        </td>
                        <td className="py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPaymentColor(order.payment_method)}`}>
                            {getPaymentLabel(order.payment_method)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Boş durum */}
          {data.orders?.length === 0 && (
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
