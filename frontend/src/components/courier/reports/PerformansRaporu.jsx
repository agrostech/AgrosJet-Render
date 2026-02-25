import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BarChart3, Package, Clock, TrendingUp, Banknote } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Kuryeye gösterilecek ihlal tipleri
const COURIER_VIOLATION_TYPES = [
  "break_overtime",
  "shift_started_not_active", 
  "offline_before_shift_end"
];

// Bu haftanın pazartesi ve pazar tarihlerini al
const getWeekRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
};

const formatShortDate = (date) => {
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long"
  });
};

// Para formatla
const formatMoney = (amount) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2
  }).format(amount || 0);
};

export default function PerformansRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const { monday, sunday } = getWeekRange();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const startDateTime = monday.toISOString().slice(0, 16);
      const endDateTime = sunday.toISOString().slice(0, 16);

      // Teslim edilen siparişleri al
      const ordersRes = await axios.get(`${API}/reports/courier/earnings`, {
        params: {
          courier_id: courierId,
          start_datetime: startDateTime,
          end_datetime: endDateTime
        }
      });

      // İhlalleri al
      const violationsRes = await axios.get(`${API}/shift-violations/${companyId}`, {
        params: {
          courier_id: courierId,
          start_date: monday.toISOString().split("T")[0],
          end_date: sunday.toISOString().split("T")[0],
          limit: 100
        }
      });

      const orders = ordersRes.data.orders || [];
      const allViolations = violationsRes.data.violations || [];
      
      // Sadece kuryeye gösterilecek ihlal tiplerini filtrele
      const violations = allViolations.filter(v => 
        COURIER_VIOLATION_TYPES.includes(v.violation_type)
      );
      
      // İstatistikleri hesapla
      const totalOrders = orders.length;
      const totalEarnings = ordersRes.data.total_earnings || 0;
      const totalViolations = violations.length;
      
      // Ortalama teslimat süresi (varsa)
      let avgDeliveryTime = 0;
      const ordersWithTime = orders.filter(o => o.delivery_time_minutes);
      if (ordersWithTime.length > 0) {
        avgDeliveryTime = Math.round(
          ordersWithTime.reduce((sum, o) => sum + o.delivery_time_minutes, 0) / ordersWithTime.length
        );
      }

      // Günlük ortalama
      const daysDiff = 7;
      const avgOrdersPerDay = (totalOrders / daysDiff).toFixed(1);
      const avgEarningsPerDay = totalEarnings / daysDiff;

      setStats({
        totalOrders,
        totalEarnings,
        totalViolations,
        avgDeliveryTime,
        avgOrdersPerDay,
        avgEarningsPerDay,
        daysDiff
      });
    } catch (err) {
      console.error("Performans raporu yüklenemedi:", err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courierId && companyId) {
      fetchStats();
    }
  }, [courierId, companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800">Bu Haftaki Performansın</h3>
      </div>

      {/* İstatistik Kartları */}
      {stats && (
        <div className="space-y-3">
          {/* Ana Metrikler */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-700">Toplam Teslimat</span>
                </div>
                <p className="text-2xl font-bold text-blue-800">{stats.totalOrders}</p>
                <p className="text-xs text-blue-600 mt-1">Günlük ort: {stats.avgOrdersPerDay}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-700">Toplam Kazanç</span>
                </div>
                <p className="text-2xl font-bold text-green-800">{formatMoney(stats.totalEarnings)}</p>
                <p className="text-xs text-green-600 mt-1">Günlük ort: {formatMoney(stats.avgEarningsPerDay)}</p>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br ${stats.totalViolations === 0 ? 'from-green-50 to-green-100 border-green-200' : 'from-orange-50 to-orange-100 border-orange-200'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className={`w-4 h-4 ${stats.totalViolations === 0 ? 'text-green-600' : 'text-orange-600'}`} />
                  <span className={`text-xs ${stats.totalViolations === 0 ? 'text-green-700' : 'text-orange-700'}`}>İhlal Sayısı</span>
                </div>
                <p className={`text-2xl font-bold ${stats.totalViolations === 0 ? 'text-green-800' : 'text-orange-800'}`}>{stats.totalViolations}</p>
                <p className={`text-xs mt-1 ${stats.totalViolations === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  {stats.totalViolations === 0 ? "Harika!" : "Dikkat!"}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span className="text-xs text-purple-700">Sipariş Başı Kazanç</span>
                </div>
                <p className="text-2xl font-bold text-purple-800">
                  {stats.totalOrders > 0 ? formatMoney(stats.totalEarnings / stats.totalOrders) : "₺0"}
                </p>
                <p className="text-xs text-purple-600 mt-1">Ortalama</p>
              </CardContent>
            </Card>
          </div>

          {/* Performans Skoru */}
          <Card className="border-2 border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-5 h-5 text-slate-600" />
                    <span className="font-medium">Haftalık Özet</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stats.totalOrders} teslimat, {formatMoney(stats.totalEarnings)} kazanç
                  </p>
                </div>
                <div className={`text-3xl font-bold ${
                  stats.totalViolations === 0 ? 'text-green-600' : 
                  stats.totalViolations <= 2 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {stats.totalViolations === 0 ? '⭐' : stats.totalViolations <= 2 ? '👍' : '⚠️'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!stats && (
        <div className="text-center py-8 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Performans verisi yok</p>
          <p className="text-sm">Bu hafta henüz teslimat yapılmamış</p>
        </div>
      )}
    </div>
  );
}
