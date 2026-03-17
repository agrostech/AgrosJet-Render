import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Clock, Timer, Banknote } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Bu haftanın pazartesi ve gelecek pazartesi tarihlerini al (şirket açılış saatiyle)
const getWeekRange = (openingTime = "06:00") => {
  const [hours, minutes] = openingTime.split(":").map(Number);
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(hours, minutes, 0, 0);
  
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(hours, minutes, 0, 0);
  
  // Local time formatında döndür (YYYY-MM-DDTHH:mm)
  const formatLocalDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${min}`;
  };
  
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return { 
    monday, 
    nextMonday,
    startDateTime: formatLocalDateTime(monday),
    endDateTime: formatLocalDateTime(nextMonday),
    startDate: formatDate(monday),
    endDate: formatDate(nextMonday)
  };
};

// Para formatla
const formatMoney = (amount) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2
  }).format(amount || 0);
};

// Süre formatla (dakika -> saat dakika)
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

  const fetchStats = async (companyOpeningTime) => {
    setLoading(true);
    try {
      const { startDateTime, endDateTime, startDate, endDate } = getWeekRange(companyOpeningTime);

      // Şirketteki tüm kuryeleri al
      const couriersRes = await axios.get(`${API}/companies/${companyId}/couriers`);
      const allCouriers = couriersRes.data || [];

      // Tüm kuryeler için verileri topla
      const courierStats = await Promise.all(
        allCouriers.map(async (courier) => {
          try {
            // Kazanç ve teslimat verileri
            const earningsRes = await axios.get(`${API}/reports/courier/earnings`, {
              params: {
                courier_id: courier.id,
                start_datetime: startDateTime,
                end_datetime: endDateTime
              }
            });

            // Çalışma süresi verileri
            const workHoursRes = await axios.get(`${API}/courier-status-logs/${companyId}/courier/${courier.id}/weekly-stats`, {
              params: { start_date: startDate, end_date: endDate }
            });

            const orders = earningsRes.data.orders || [];
            const totalDeliveries = orders.length;
            const totalEarnings = earningsRes.data.total_earnings || 0;
            
            // Ortalama teslimat süresi (yola çıkıştan teslime)
            const ordersWithDeliveryTime = orders.filter(o => o.delivery_duration_minutes > 0);
            const avgDeliveryTime = ordersWithDeliveryTime.length > 0
              ? ordersWithDeliveryTime.reduce((sum, o) => sum + o.delivery_duration_minutes, 0) / ordersWithDeliveryTime.length
              : 0;

            // Toplam çalışma süresi (dakika)
            const totalWorkMinutes = workHoursRes.data?.total_active_minutes || 0;

            return {
              id: courier.id,
              name: courier.name,
              totalDeliveries,
              totalEarnings,
              avgDeliveryTime,
              totalWorkMinutes
            };
          } catch (err) {
            return {
              id: courier.id,
              name: courier.name,
              totalDeliveries: 0,
              totalEarnings: 0,
              avgDeliveryTime: 0,
              totalWorkMinutes: 0
            };
          }
        })
      );

      // Mevcut kuryenin verileri
      const currentCourier = courierStats.find(c => c.id === courierId) || {
        totalDeliveries: 0,
        totalEarnings: 0,
        avgDeliveryTime: 0,
        totalWorkMinutes: 0
      };

      // Şampiyonları bul
      const deliveryChampion = courierStats.reduce((max, c) => 
        c.totalDeliveries > max.totalDeliveries ? c : max, courierStats[0]);
      
      const workHoursChampion = courierStats.reduce((max, c) => 
        c.totalWorkMinutes > max.totalWorkMinutes ? c : max, courierStats[0]);
      
      // Ortalama teslimat süresinde en düşük olan şampiyon (0 olanları hariç tut)
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

  useEffect(() => {
    const init = async () => {
      if (!courierId || !companyId) return;
      
      try {
        const res = await axios.get(`${API}/companies/${companyId}/work-hours`);
        const companyOpeningTime = res.data.opening_time || "06:00";
        await fetchStats(companyOpeningTime);
      } catch (err) {
        console.error("Şirket bilgisi alınamadı:", err);
        await fetchStats("06:00");
      }
    };
    
    init();
  }, [courierId, companyId]);

  if (loading) {
    return <PageLoading />;
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Performans verisi yok</p>
        <p className="text-sm">Bu hafta henüz veri oluşmamış</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                Hafta lideri: {stats.deliveryChampion.name} ({stats.deliveryChampion.totalDeliveries})
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
                Hafta lideri: {stats.workHoursChampion.name} ({formatDuration(stats.workHoursChampion.totalWorkMinutes)})
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
                Hafta lideri: {stats.deliveryTimeChampion.name} ({Math.round(stats.deliveryTimeChampion.avgDeliveryTime)} dk)
              </p>
            )}
          </div>

          <div className="border-t border-slate-100" />

          {/* Haftalık Kazanç */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Haftalık Kazanç</p>
              <p className="text-lg font-bold">{formatMoney(stats.totalEarnings)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
