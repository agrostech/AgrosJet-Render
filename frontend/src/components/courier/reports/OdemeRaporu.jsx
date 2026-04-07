import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, Info, Calendar, Search, Utensils, Globe, ChevronDown, ChevronUp, Building2, Store, CheckCircle, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InlineLoading } from "@/components/ui/loading-spinner";
import { formatMoney } from "./utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function OrderTable({ orders, colorClass, showCollected }) {
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
            {showCollected && <th className="pb-2 text-center">Durum</th>}
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
              {showCollected && (
                <td className="py-1.5 text-center">
                  {order.is_collected ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      <CheckCircle className="w-2.5 h-2.5" />Verildi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                      <Clock className="w-2.5 h-2.5" />Verilmedi
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentCard({ label, icon: Icon, count, total, orders, colorKey, expanded, onToggle, showCollected }) {
  const colorMap = {
    green: { border: "border-green-300", iconBg: "bg-green-100", iconText: "text-green-600", hover: "hover:bg-green-50/50", tableText: "text-green-600", tableBorder: "border-green-100", divider: "border-green-200", chevron: "text-green-600" },
    blue: { border: "border-blue-300", iconBg: "bg-blue-100", iconText: "text-blue-600", hover: "hover:bg-blue-50/50", tableText: "text-blue-600", tableBorder: "border-blue-100", divider: "border-blue-200", chevron: "text-blue-600" },
    orange: { border: "border-orange-300", iconBg: "bg-orange-100", iconText: "text-orange-600", hover: "hover:bg-orange-50/50", tableText: "text-orange-600", tableBorder: "border-orange-100", divider: "border-orange-200", chevron: "text-orange-600" },
    purple: { border: "border-purple-300", iconBg: "bg-purple-100", iconText: "text-purple-600", hover: "hover:bg-purple-50/50", tableText: "text-purple-600", tableBorder: "border-purple-100", divider: "border-purple-200", chevron: "text-purple-600" },
  };
  const c = colorMap[colorKey];

  return (
    <Card className={`border-2 ${c.border} bg-white overflow-hidden`}>
      <CardContent className="p-0">
        <button onClick={onToggle} className={`w-full p-3 sm:p-4 flex items-center justify-between ${c.hover} transition-colors`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full ${c.iconBg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${c.iconText}`} />
            </div>
            <div className="text-left">
              <p className="text-xs text-muted-foreground font-medium">{label} ({count} sipariş)</p>
              <p className="text-lg sm:text-xl font-bold">{formatMoney(total)}</p>
            </div>
          </div>
          {count > 0 && (expanded ? <ChevronUp className={`w-5 h-5 ${c.chevron}`} /> : <ChevronDown className={`w-5 h-5 ${c.chevron}`} />)}
        </button>
        {expanded && count > 0 && (
          <div className={`p-3 border-t ${c.divider} max-h-64 overflow-y-auto`}>
            <OrderTable orders={orders} colorClass={{ text: c.tableText, border: c.tableBorder }} showCollected={showCollected} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OdemeRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [expandedCards, setExpandedCards] = useState({});
  const [collector, setCollector] = useState("company");

  const toggleCard = (cardKey) => {
    setExpandedCards(prev => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  useEffect(() => {
    const initDates = async () => {
      if (!companyId) return;
      try {
        const res = await axios.get(`${API}/reports/courier/business-day`, { params: { company_id: companyId } });
        const { date, opening_time, closing_time } = res.data;
        const nextDay = new Date(date + "T00:00:00");
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,'0')}-${String(nextDay.getDate()).padStart(2,'0')}`;
        setStartDateTime(`${date}T${opening_time}`);
        setEndDateTime(`${nextDayStr}T${closing_time}`);
      } catch {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        setStartDateTime(`${fmt(today)}T06:00`);
        setEndDateTime(`${fmt(tomorrow)}T06:00`);
      }
    };
    initDates();
  }, [companyId]);

  const handleGenerate = useCallback(async () => {
    if (!startDateTime || !endDateTime) return;
    setLoading(true);
    setExpandedCards({});
    try {
      const params = new URLSearchParams({
        courier_id: courierId,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        collector
      });
      const res = await axios.get(`${API}/reports/courier/payments?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error("Rapor yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  }, [courierId, startDateTime, endDateTime, collector]);

  // Collector değiştiğinde mevcut veriyi temizle
  useEffect(() => {
    setData(null);
  }, [collector]);

  const showCollected = collector === "restaurant";
  const hasOrders = data && (data.cash_orders?.length > 0 || data.card_orders?.length > 0 || data.meal_card_orders?.length > 0 || data.online_orders?.length > 0);

  return (
    <div className="space-y-3">
      {/* Şirket / Restoran Toggle */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setCollector("company")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
            collector === "company"
              ? "bg-white dark:bg-slate-600 text-blue-700 dark:text-blue-300 shadow-md border border-blue-200 dark:border-blue-500"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
          }`}
          data-testid="collector-company-tab"
        >
          <Building2 className="w-4 h-4" />
          Şirket
        </button>
        <button
          onClick={() => setCollector("restaurant")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
            collector === "restaurant"
              ? "bg-white dark:bg-slate-600 text-orange-700 dark:text-orange-300 shadow-md border border-orange-200 dark:border-orange-500"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
          }`}
          data-testid="collector-restaurant-tab"
        >
          <Store className="w-4 h-4" />
          Restoran
        </button>
      </div>

      {/* Filtreler */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Calendar className="w-4 h-4" />
          Tarih Aralığı
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Başlangıç</label>
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              data-testid="payment-start-date"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
          {loading ? <InlineLoading className="mr-2" /> : <Search className="w-4 h-4 mr-2" />}
          {loading ? "Yükleniyor..." : "Raporu Göster"}
        </Button>
      </div>

      {/* Sonuçlar */}
      {data && (
        <div className="space-y-3">
          <PaymentCard label="Nakit" icon={Banknote} count={data.cash_orders?.length || 0} total={data.cash_total}
            orders={data.cash_orders} colorKey="green" expanded={expandedCards.cash} onToggle={() => toggleCard('cash')} showCollected={showCollected} />
          <PaymentCard label="Kredi Kartı" icon={CreditCard} count={data.card_orders?.length || 0} total={data.card_total}
            orders={data.card_orders} colorKey="blue" expanded={expandedCards.card} onToggle={() => toggleCard('card')} showCollected={showCollected} />
          <PaymentCard label="Yemek Kartı" icon={Utensils} count={data.meal_card_orders?.length || 0} total={data.meal_card_total}
            orders={data.meal_card_orders} colorKey="orange" expanded={expandedCards.meal} onToggle={() => toggleCard('meal')} showCollected={false} />
          <PaymentCard label="Online" icon={Globe} count={data.online_orders?.length || 0} total={data.online_total}
            orders={data.online_orders} colorKey="purple" expanded={expandedCards.online} onToggle={() => toggleCard('online')} showCollected={false} />
          
          {!hasOrders && (
            <p className="text-sm text-muted-foreground text-center py-4">Bu tarih aralığında sipariş bulunamadı</p>
          )}
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Tarih seçip "Raporu Göster" butonuna tıklayın</p>
      )}
    </div>
  );
}
