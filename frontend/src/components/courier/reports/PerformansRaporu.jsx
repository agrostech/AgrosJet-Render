import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Calendar, Search, Package, Clock, TrendingUp, Banknote } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Para formatla
const formatMoney = (amount) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2
  }).format(amount || 0);
};

export default function PerformansRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [startDateTime, setStartDateTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [endDateTime, setEndDateTime] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
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
          start_date: startDateTime.split("T")[0],
          end_date: endDateTime.split("T")[0],
          limit: 100
        }
      });

      const orders = ordersRes.data.orders || [];
      const violations = violationsRes.data.violations || [];
      
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
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
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
      handleGenerate();
    }
  }, []);

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
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={loading} 
          className="w-full h-10 bg-blue-600 hover:bg-blue-700"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Search className="w-4 h-4 mr-2" />
          )}
          {loading ? "Yükleniyor..." : "Raporu Göster"}
        </Button>
      </div>

      {/* İstatistik Kartları */}
      {stats && (
        <div className="space-y-3">
          {/* Dönem Bilgisi */}
          <div className="text-center text-sm text-muted-foreground">
            Son {stats.daysDiff} günlük performans
          </div>

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

            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                  <span className="text-xs text-orange-700">İhlal Sayısı</span>
                </div>
                <p className="text-2xl font-bold text-orange-800">{stats.totalViolations}</p>
                <p className="text-xs text-orange-600 mt-1">
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
                    <span className="font-medium">Performans Özeti</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {stats.daysDiff} günde {stats.totalOrders} teslimat, {formatMoney(stats.totalEarnings)} kazanç
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

      {!stats && !loading && (
        <div className="text-center py-8 text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Performans verisi yok</p>
          <p className="text-sm">Raporu görmek için tarih seçip butona tıklayın</p>
        </div>
      )}
    </div>
  );
}
