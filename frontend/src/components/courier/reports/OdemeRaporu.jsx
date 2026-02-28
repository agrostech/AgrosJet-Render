import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, Info, Calendar, Search, Utensils, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineLoading } from "@/components/ui/loading-spinner";
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
  const [expandedCards, setExpandedCards] = useState({});

  const toggleCard = (cardKey) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardKey]: !prev[cardKey]
    }));
  };

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
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              data-testid="payment-start-date"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              data-testid="payment-end-date"
            />
          </div>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={loading} 
          className="w-full h-10 bg-purple-600 hover:bg-purple-700" 
          data-testid="btn-payment-report"
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
          {/* Nakit Kart - Özet ve Siparişler Birleşik */}
          <Card className="border-2 border-green-300 bg-white overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="p-4 flex items-center gap-3 border-b border-green-200">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Nakit ({data.cash_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold">{formatMoney(data.cash_total)}</p>
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
          <Card className="border-2 border-blue-300 bg-white overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="p-4 flex items-center gap-3 border-b border-blue-200">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Kredi Kartı ({data.card_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold">{formatMoney(data.card_total)}</p>
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

          {/* Yemek Kartı - Özet ve Siparişler Birleşik */}
          <Card className="border-2 border-orange-300 bg-white overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="p-4 flex items-center gap-3 border-b border-orange-200">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Utensils className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Yemek Kartı ({data.meal_card_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold">{formatMoney(data.meal_card_total)}</p>
                </div>
              </div>
              {/* Sipariş Tablosu */}
              {data.meal_card_orders?.length > 0 && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <OrderTable 
                    orders={data.meal_card_orders} 
                    colorClass={{ text: "text-orange-600", border: "border-orange-100" }} 
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Online - Özet ve Siparişler Birleşik */}
          <Card className="border-2 border-purple-300 bg-white overflow-hidden">
            <CardContent className="p-0">
              {/* Özet Başlık */}
              <div className="p-4 flex items-center gap-3 border-b border-purple-200">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Online ({data.online_orders?.length || 0} sipariş)</p>
                  <p className="text-xl font-bold">{formatMoney(data.online_total)}</p>
                </div>
              </div>
              {/* Sipariş Tablosu */}
              {data.online_orders?.length > 0 && (
                <div className="p-3 max-h-64 overflow-y-auto">
                  <OrderTable 
                    orders={data.online_orders} 
                    colorClass={{ text: "text-purple-600", border: "border-purple-100" }} 
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Boş durum */}
          {data.cash_orders?.length === 0 && data.card_orders?.length === 0 && data.meal_card_orders?.length === 0 && data.online_orders?.length === 0 && (
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
