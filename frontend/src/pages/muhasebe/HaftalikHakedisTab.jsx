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

// Önceki Pazartesi'yi al (sistemin açılış saati ile)
const getPreviousMonday = (openingTime = "09:00") => {
  const now = new Date();
  const day = now.getDay();
  // Önceki pazartesiye git (eğer bugün pazartesi ise bu hafta değil geçen hafta)
  const daysToSubtract = day === 0 ? 6 : (day === 1 ? 7 : day - 1 + 7);
  const prevMonday = new Date(now);
  prevMonday.setDate(now.getDate() - daysToSubtract + 7); // Bu haftanın pazartesi
  
  // Aslında "önceki pazartesi" = bu haftanın pazartesi (7 gün geriye)
  const actualPrevMonday = new Date(now);
  const diffToMonday = day === 0 ? -6 : 1 - day;
  actualPrevMonday.setDate(now.getDate() + diffToMonday - 7);
  
  const [hours, minutes] = openingTime.split(':').map(Number);
  actualPrevMonday.setHours(hours, minutes, 0, 0);
  
  // Local datetime-local format için
  const year = actualPrevMonday.getFullYear();
  const month = String(actualPrevMonday.getMonth() + 1).padStart(2, '0');
  const date = String(actualPrevMonday.getDate()).padStart(2, '0');
  const hour = String(actualPrevMonday.getHours()).padStart(2, '0');
  const min = String(actualPrevMonday.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${date}T${hour}:${min}`;
};

// Sonraki Pazartesi'yi al (sistemin açılış saati ile)
const getNextMonday = (openingTime = "09:00") => {
  const now = new Date();
  const day = now.getDay();
  // Sonraki pazartesiye git
  const daysToAdd = day === 0 ? 1 : (8 - day);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysToAdd);
  
  const [hours, minutes] = openingTime.split(':').map(Number);
  nextMonday.setHours(hours, minutes, 0, 0);
  
  // Local datetime-local format için
  const year = nextMonday.getFullYear();
  const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
  const date = String(nextMonday.getDate()).padStart(2, '0');
  const hour = String(nextMonday.getHours()).padStart(2, '0');
  const min = String(nextMonday.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${date}T${hour}:${min}`;
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

  return (
    <div className="space-y-4" data-testid="haftalik-hakedis-tab">
      {/* Filtre Kartı */}
      <Card className="border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Tarih Aralığı Seç
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs font-semibold mb-1 block">Başlangıç</Label>
              <Input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 border-2"
                data-testid="hakedis-start-date"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs font-semibold mb-1 block">Bitiş</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 border-2"
                data-testid="hakedis-end-date"
              />
            </div>
            <Button 
              onClick={fetchHakedis} 
              disabled={loading}
              className="h-10"
              data-testid="hakedis-search-btn"
            >
              <Search className="w-4 h-4 mr-2" />
              {loading ? "Yükleniyor..." : "Ara"}
            </Button>
            {data?.couriers?.length > 0 && (
              <Button 
                variant="outline" 
                onClick={handleExportCSV}
                className="h-10 border-2"
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
          {/* Özet Kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-2">
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold">{data.couriers.filter(c => c.total_orders > 0).length}</p>
                <p className="text-xs text-muted-foreground">Aktif Kurye</p>
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="p-4 text-center">
                <Package className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold">{data.summary.total_orders}</p>
                <p className="text-xs text-muted-foreground">Toplam Sipariş</p>
              </CardContent>
            </Card>
            <Card className="border-2 col-span-2">
              <CardContent className="p-4 text-center">
                <Wallet className="w-6 h-6 mx-auto mb-2 text-green-500" />
                <p className="text-2xl font-bold text-green-600">{formatMoney(data.summary.total_courier_fee)}</p>
                <p className="text-xs text-muted-foreground">Toplam Hakediş</p>
              </CardContent>
            </Card>
          </div>

          {/* Kurye Listesi */}
          <Card className="border-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Kurye Hakedişleri ({data.couriers.length} kurye)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.couriers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Bu tarih aralığında teslim edilmiş sipariş bulunamadı</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary bg-slate-50">
                        <th className="text-left p-3 font-bold text-xs">Kurye</th>
                        <th className="text-left p-3 font-bold text-xs hidden sm:table-cell">Telefon</th>
                        <th className="text-center p-3 font-bold text-xs">Sipariş</th>
                        <th className="text-center p-3 font-bold text-xs hidden md:table-cell">Mesafe</th>
                        <th className="text-right p-3 font-bold text-xs">Hakediş</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.couriers.map((courier) => (
                        <tr 
                          key={courier.courier_id}
                          className={`border-b hover:bg-slate-50 transition-colors ${
                            courier.total_orders === 0 ? 'opacity-50' : ''
                          }`}
                        >
                          <td className="p-3">
                            <span className="font-medium">{courier.courier_name}</span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                            {courier.courier_phone || "-"}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                              {courier.total_orders}
                            </span>
                          </td>
                          <td className="p-3 text-center text-xs hidden md:table-cell">
                            <span className="flex items-center justify-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              {courier.total_distance.toFixed(1)} km
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-bold font-mono ${
                              courier.total_courier_fee > 0 ? 'text-green-600' : 'text-muted-foreground'
                            }`}>
                              {formatMoney(courier.total_courier_fee)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold">
                        <td className="p-3">Toplam</td>
                        <td className="p-3 hidden sm:table-cell"></td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs">
                            {data.summary.total_orders}
                          </span>
                        </td>
                        <td className="p-3 hidden md:table-cell"></td>
                        <td className="p-3 text-right text-green-600 font-mono">
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
        <Card className="border-2 border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">Tarih aralığı seçin</p>
            <p className="text-sm">Kuryelerin teslim edilen siparişlerden kazandığı hakedişleri görüntüleyin</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
