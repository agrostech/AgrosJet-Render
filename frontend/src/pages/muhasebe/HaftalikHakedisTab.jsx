import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, 
  Search, 
  Users, 
  Wallet,
  Package,
  MapPin,
  Download
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

// Bu haftanın Pazartesi'sini al (sistemin açılış saati ile)
const getThisMonday = (openingTime = "09:00") => {
  const now = new Date();
  const day = now.getDay(); // 0=Pazar, 1=Pazartesi, ...
  
  // Bu haftanın pazartesine git
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + diffToMonday);
  
  const [hours, minutes] = openingTime.split(':').map(Number);
  thisMonday.setHours(hours, minutes, 0, 0);
  
  return formatDateTimeLocal(thisMonday);
};

// Sonraki Pazartesi'yi al (sistemin kapanış saati ile)
const getNextMonday = (closingTime = "22:00") => {
  const now = new Date();
  const day = now.getDay(); // 0=Pazar, 1=Pazartesi, ...
  
  // Sonraki pazartesiye git
  const daysToAdd = day === 0 ? 1 : (8 - day);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysToAdd);
  
  const [hours, minutes] = closingTime.split(':').map(Number);
  nextMonday.setHours(hours, minutes, 0, 0);
  
  return formatDateTimeLocal(nextMonday);
};

// Tarihi datetime-local format için formatla
const formatDateTimeLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hour}:${min}`;
};

export default function HaftalikHakedisTab({ companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [systemHoursLoaded, setSystemHoursLoaded] = useState(false);

  // Sistem açılış saatini al ve tarihleri ayarla
  useEffect(() => {
    const fetchWorkingHours = async () => {
      try {
        const res = await axios.get(`${API}/companies/${companyId}/working-hours`);
        const openingTime = res.data.opening_time || "09:00";
        setStartDate(getPreviousMonday(openingTime));
        setEndDate(getNextMonday(openingTime));
      } catch (err) {
        // Hata durumunda varsayılan 09:00 kullan
        setStartDate(getPreviousMonday("09:00"));
        setEndDate(getNextMonday("09:00"));
      } finally {
        setSystemHoursLoaded(true);
      }
    };
    
    if (companyId) {
      fetchWorkingHours();
    }
  }, [companyId]);

  const fetchHakedis = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Başlangıç ve bitiş tarihlerini seçin");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/hakedis/couriers/${companyId}`, {
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString()
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Hakediş verileri alınamadı");
    } finally {
      setLoading(false);
    }
  }, [companyId, startDate, endDate]);

  const handleExportCSV = () => {
    if (!data?.couriers?.length) return;
    
    const headers = ["Kurye", "Telefon", "Sipariş Sayısı", "Toplam Mesafe (km)", "Toplam Hakediş (TL)"];
    const rows = data.couriers.map(c => [
      c.courier_name,
      c.courier_phone,
      c.total_orders,
      c.total_distance.toFixed(2),
      c.total_courier_fee.toFixed(2)
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `haftalik_hakedis_${startDate.slice(0, 10)}_${endDate.slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Sistem saatleri yüklenene kadar bekle
  if (!systemHoursLoaded) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="haftalik-hakedis-tab">
      {/* Filtre Kartı - Compact Single Line */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Tarih Aralığı:</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 border text-sm w-[185px]"
                data-testid="hakedis-start-date"
              />
              <span className="text-slate-400">—</span>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 border text-sm w-[185px]"
                data-testid="hakedis-end-date"
              />
            </div>
            <Button 
              onClick={fetchHakedis} 
              disabled={loading}
              className="h-9"
              data-testid="hakedis-search-btn"
            >
              <Search className="w-4 h-4 mr-2" />
              {loading ? "Yükleniyor..." : "Ara"}
            </Button>
            {data?.couriers?.length > 0 && (
              <Button 
                variant="outline" 
                onClick={handleExportCSV}
                className="h-9"
                data-testid="hakedis-export-btn"
              >
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && <PageLoading />}

      {/* Sonuçlar */}
      {data && !loading && (
        <>
          {/* Özet Kartları - Daha Resmi */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Users className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{data.couriers.filter(c => c.total_orders > 0).length}</p>
                <p className="text-xs text-slate-500">Aktif Kurye</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Package className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{data.summary.total_orders}</p>
                <p className="text-xs text-slate-500">Toplam Sipariş</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm col-span-2">
              <CardContent className="p-4 text-center">
                <Wallet className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{formatMoney(data.summary.total_courier_fee)}</p>
                <p className="text-xs text-slate-500">Toplam Hakediş</p>
              </CardContent>
            </Card>
          </div>

          {/* Kurye Listesi - Daha Resmi Tablo */}
          <Card className="border bg-white shadow-sm">
            <CardHeader className="pb-2 border-b bg-slate-50">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Kurye Hakedişleri ({data.couriers.length} kurye)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.couriers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Bu tarih aralığında teslim edilmiş sipariş bulunamadı</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Kurye</th>
                        <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden sm:table-cell">Telefon</th>
                        <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Sipariş</th>
                        <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden md:table-cell">Mesafe</th>
                        <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Hakediş</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.couriers.map((courier, idx) => (
                        <tr 
                          key={courier.courier_id}
                          className={`border-b hover:bg-slate-50 transition-colors ${
                            courier.total_orders === 0 ? 'opacity-50' : ''
                          } ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-25'}`}
                        >
                          <td className="p-3">
                            <span className="font-medium text-slate-800">{courier.courier_name}</span>
                          </td>
                          <td className="p-3 text-xs text-slate-500 font-mono hidden sm:table-cell">
                            {courier.courier_phone || "-"}
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-semibold text-slate-700">
                              {courier.total_orders}
                            </span>
                          </td>
                          <td className="p-3 text-center text-xs hidden md:table-cell">
                            <span className="flex items-center justify-center gap-1 text-slate-600">
                              <MapPin className="w-3 h-3" />
                              {courier.total_distance.toFixed(1)} km
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="font-semibold font-mono text-slate-800">
                              {formatMoney(courier.total_courier_fee)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold border-t-2">
                        <td className="p-3 text-slate-700">Toplam</td>
                        <td className="p-3 hidden sm:table-cell"></td>
                        <td className="p-3 text-center text-slate-700">
                          {data.summary.total_orders}
                        </td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right font-mono text-slate-800">
                          {formatMoney(data.summary.total_courier_fee)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Başlangıç durumu */}
      {!data && !loading && (
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1 text-slate-700">Tarih aralığı seçin</p>
            <p className="text-sm">Kuryelerin teslim edilen siparişlerden kazandığı hakedişleri görüntüleyin</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
