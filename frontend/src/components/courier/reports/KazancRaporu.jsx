import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, TrendingUp, Info, Calendar, Search, Clock, Coins, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineLoading } from "@/components/ui/loading-spinner";
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
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4" />
          Tarih Aralığı
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Başlangıç</label>
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              data-testid="earnings-start-date"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              data-testid="earnings-end-date"
            />
          </div>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={loading} 
          className="w-full h-10 bg-green-600 hover:bg-green-700" 
          data-testid="btn-earnings-report"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Search className="w-4 h-4 mr-2" />
          )}
          {loading ? "Yükleniyor..." : "Raporu Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="space-y-4">
          {/* 5 Kartlı Özet */}
          <div className="grid grid-cols-2 gap-3">
            {/* Paket Sayısı */}
            <Card className="border-2 border-purple-300 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <Package className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Paket Sayısı</p>
                    <p className="text-lg font-bold">{data.package_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Paket Hakediş */}
            <Card className="border-2 border-blue-300 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Coins className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Paket Hakediş</p>
                    <p className="text-lg font-bold">{formatMoney(data.total_earnings)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Çalışma Süresi */}
            <Card className="border-2 border-slate-300 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Çalışma Süresi</p>
                    <p className="text-lg font-bold">
                      {data.work_hours || 0}<span className="text-sm font-normal">s</span> {data.work_minutes || 0}<span className="text-sm font-normal">dk</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Saatlik Hakediş */}
            <Card className="border-2 border-amber-300 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Saatlik Hakediş</p>
                    <p className="text-lg font-bold">{formatMoney(data.hourly_earnings)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Toplam Hakediş - Tam Genişlik */}
          <Card className="border-2 border-green-400 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-medium">Toplam Hakediş</p>
                  <p className="text-2xl font-bold">{formatMoney(data.total_earnings)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                          <span className="inline-flex items-center gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPaymentColor(order.payment_method)}`}>
                              {getPaymentLabel(order.payment_method)}
                            </span>
                            {order.payment_details?.original_method && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="text-amber-500 hover:text-amber-600" onClick={(e) => e.stopPropagation()}>
                                    <Info className="w-3 h-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-52 p-2 text-xs" align="end">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-amber-600 border-b pb-1">Ödeme Değişikliği</div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Orijinal:</span>
                                      <span>{getPaymentLabel(order.payment_details.original_method)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Yeni:</span>
                                      <span>{getPaymentLabel(order.payment_method)}</span>
                                    </div>
                                    {order.payment_method === "mixed" && (
                                      <div className="border-t pt-1 mt-1">
                                        <div className="flex justify-between text-green-600">
                                          <span>Nakit:</span>
                                          <span>{formatMoney(order.payment_details.cash_amount || 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-blue-600">
                                          <span>Kart:</span>
                                          <span>{formatMoney(order.payment_details.card_amount || 0)}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
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
