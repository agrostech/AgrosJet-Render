import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Clock, Timer, Banknote } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getTodayRange = (openingTime = "06:00", closingTime = "06:00") => {
  const [oH, oM] = openingTime.split(":").map(Number);
  const [cH, cM] = closingTime.split(":").map(Number);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(oH, oM, 0, 0);
  if (now < todayStart) todayStart.setDate(todayStart.getDate() - 1);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayStart.getDate() + 1);
  todayEnd.setHours(cH, cM, 0, 0);
  return { start: todayStart, end: todayEnd };
};

const getWeekRange = (openingTime = "06:00", closingTime = "06:00") => {
  const [oH, oM] = openingTime.split(":").map(Number);
  const [cH, cM] = closingTime.split(":").map(Number);
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(oH, oM, 0, 0);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(cH, cM, 0, 0);
  return { start: monday, end: nextMonday };
};

const fmt = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return { dateTime: `${y}-${m}-${day}T${h}:${min}`, date: `${y}-${m}-${day}` };
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2
  }).format(amount || 0);
};

const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return "0 dk";
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins} dk`;
  if (mins === 0) return `${hours} saat`;
  return `${hours} saat ${mins} dk`;
};

export default function PerformansRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState("bugun");

  const fetchStats = async (companyOpeningTime, companyClosingTime, selectedPeriod) => {
    setLoading(true);
    try {
      const range = selectedPeriod === "bugun"
        ? getTodayRange(companyOpeningTime, companyClosingTime)
        : getWeekRange(companyOpeningTime, companyClosingTime);

      const startFmt = fmt(range.start);
      const endFmt = fmt(range.end);

      const couriersRes = await axios.get(`${API}/companies/${companyId}/couriers`);
      const allCouriers = couriersRes.data || [];

      const courierStats = await Promise.all(
        allCouriers.map(async (courier) => {
          try {
            const earningsRes = await axios.get(`${API}/reports/courier/earnings`, {
              params: {
                courier_id: courier.id,
                start_datetime: startFmt.dateTime,
                end_datetime: endFmt.dateTime
              }
            });

            const workHoursRes = await axios.get(`${API}/courier-status-logs/${companyId}/courier/${courier.id}/weekly-stats`, {
              params: { start_date: startFmt.date, end_date: endFmt.date }
            });

            const orders = earningsRes.data.orders || [];
            const totalDeliveries = orders.length;
            const totalEarnings = earningsRes.data.total_earnings || 0;
            
            const ordersWithDeliveryTime = orders.filter(o => o.delivery_duration_minutes > 0);
            const avgDeliveryTime = ordersWithDeliveryTime.length > 0
              ? ordersWithDeliveryTime.reduce((sum, o) => sum + o.delivery_duration_minutes, 0) / ordersWithDeliveryTime.length
              : 0;

            const totalWorkMinutes = workHoursRes.data?.total_active_minutes || 0;

            return { id: courier.id, name: courier.name, totalDeliveries, totalEarnings, avgDeliveryTime, totalWorkMinutes };
          } catch {
            return { id: courier.id, name: courier.name, totalDeliveries: 0, totalEarnings: 0, avgDeliveryTime: 0, totalWorkMinutes: 0 };
          }
        })
      );

      const currentCourier = courierStats.find(c => c.id === courierId) || {
        totalDeliveries: 0, totalEarnings: 0, avgDeliveryTime: 0, totalWorkMinutes: 0
      };

      const deliveryChampion = courierStats.reduce((max, c) => 
        c.totalDeliveries > max.totalDeliveries ? c : max, courierStats[0]);
      
      const workHoursChampion = courierStats.reduce((max, c) => 
        c.totalWorkMinutes > max.totalWorkMinutes ? c : max, courierStats[0]);
      
      const couriersWithDeliveryTime = courierStats.filter(c => c.avgDeliveryTime > 0);
      const deliveryTimeChampion = couriersWithDeliveryTime.length > 0
        ? couriersWithDeliveryTime.reduce((min, c) => 
            c.avgDeliveryTime < min.avgDeliveryTime ? c : min, couriersWithDeliveryTime[0])
        : null;

      setStats({
        totalDeliveries: currentCourier.totalDeliveries,
        totalWorkMinutes: currentCourier.totalWorkMinutes,
        avgDeliveryTime: currentCourier.avgDeliveryTime,
        totalEarnings: currentCourier.totalEarnings,
        deliveryChampion,
        workHoursChampion,
        deliveryTimeChampion
      });
    } catch (err) {
      console.error("Performans raporu yüklenemedi:", err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("06:00");

  useEffect(() => {
    const init = async () => {
      if (!courierId || !companyId) return;
      try {
        const res = await axios.get(`${API}/companies/${companyId}/work-hours`);
        const ot = res.data.opening_time || "06:00";
        const ct = res.data.closing_time || "06:00";
        setOpeningTime(ot);
        setClosingTime(ct);
        await fetchStats(ot, ct, period);
      } catch {
        await fetchStats("06:00", "06:00", period);
      }
    };
    init();
  }, [courierId, companyId]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    fetchStats(openingTime, closingTime, newPeriod);
  };

  if (loading) return <PageLoading />;

  const periodLabel = period === "bugun" ? "Bugün" : "Bu Hafta";
  const leaderLabel = period === "bugun" ? "Gün lideri" : "Hafta lideri";

  if (!stats) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Performans verisi yok</p>
        <p className="text-sm">{periodLabel} henüz veri oluşmamış</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
        <button
          onClick={() => handlePeriodChange("bugun")}
          data-testid="period-bugun"
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            period === "bugun"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Bugün
        </button>
        <button
          onClick={() => handlePeriodChange("hafta")}
          data-testid="period-hafta"
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            period === "hafta"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Bu Hafta
        </button>
      </div>

      <Card className="border">
        <CardContent className="p-0">
          {/* Toplam Teslimat */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Toplam Teslimat</p>
                <p className="text-lg font-bold">{stats.totalDeliveries}</p>
              </div>
            </div>
            {stats.deliveryChampion && stats.deliveryChampion.totalDeliveries > 0 && (
              <p className="text-[10px] text-muted-foreground text-right max-w-[140px]">
                {leaderLabel}: {stats.deliveryChampion.name} ({stats.deliveryChampion.totalDeliveries})
              </p>
            )}
          </div>

          <div className="border-t border-slate-100" />

          {/* Toplam Çalışma Süresi */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Toplam Çalışma Süresi</p>
                <p className="text-lg font-bold">{formatDuration(stats.totalWorkMinutes)}</p>
              </div>
            </div>
            {stats.workHoursChampion && stats.workHoursChampion.totalWorkMinutes > 0 && (
              <p className="text-[10px] text-muted-foreground text-right max-w-[140px]">
                {leaderLabel}: {stats.workHoursChampion.name} ({formatDuration(stats.workHoursChampion.totalWorkMinutes)})
              </p>
            )}
          </div>

          <div className="border-t border-slate-100" />

          {/* Ortalama Teslimat Süresi */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Timer className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ort. Teslimat Süresi</p>
                <p className="text-lg font-bold">
                  {stats.avgDeliveryTime > 0 ? `${Math.round(stats.avgDeliveryTime)} dk` : "-"}
                </p>
              </div>
            </div>
            {stats.deliveryTimeChampion && stats.deliveryTimeChampion.avgDeliveryTime > 0 && (
              <p className="text-[10px] text-muted-foreground text-right max-w-[140px]">
                {leaderLabel}: {stats.deliveryTimeChampion.name} ({Math.round(stats.deliveryTimeChampion.avgDeliveryTime)} dk)
              </p>
            )}
          </div>

          <div className="border-t border-slate-100" />

          {/* Kazanç */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{periodLabel} Kazanç</p>
              <p className="text-lg font-bold">{formatMoney(stats.totalEarnings)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
