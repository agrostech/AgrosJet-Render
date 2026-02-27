import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, FileText, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, subWeeks, addDays } from "date-fns";
import { tr } from "date-fns/locale";

const API = process.env.REACT_APP_BACKEND_URL;

function formatMoney(val) {
  if (val === null || val === undefined) return "0,00 ₺";
  return val.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default function RestaurantMutabakatRaporu({ restaurantId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [companySettings, setCompanySettings] = useState({ opening_time: "09:00", closing_time: "22:00" });
  
  // Tarih state'leri
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [activePreset, setActivePreset] = useState("today");

  // Şirket ayarlarını al
  const fetchCompanySettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/restoran-mutabakat/weeks/${companyId}`);
      setCompanySettings({
        opening_time: res.data.opening_time || "09:00",
        closing_time: res.data.closing_time || "22:00"
      });
    } catch (err) {
      console.error("Şirket ayarları alınamadı:", err);
    }
  }, [companyId]);

  // Tarih hesaplama yardımcıları
  const getTimeFromString = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return { hours, minutes };
  };

  const setDateWithTime = (date, timeStr) => {
    const { hours, minutes } = getTimeFromString(timeStr);
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  };

  // Preset tarih aralıklarını hesapla
  const getPresetDates = useCallback((preset) => {
    const now = new Date();
    const { opening_time, closing_time } = companySettings;
    
    switch (preset) {
      case "today": {
        const start = setDateWithTime(now, opening_time);
        const end = setDateWithTime(addDays(now, 1), closing_time);
        return { start, end };
      }
      case "yesterday": {
        const yesterday = subDays(now, 1);
        const start = setDateWithTime(yesterday, opening_time);
        const end = setDateWithTime(now, closing_time);
        return { start, end };
      }
      case "this_week": {
        const monday = startOfWeek(now, { weekStartsOn: 1 });
        const nextMonday = addDays(monday, 7);
        const start = setDateWithTime(monday, opening_time);
        const end = setDateWithTime(nextMonday, closing_time);
        return { start, end };
      }
      case "last_week": {
        const lastMonday = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const thisMonday = addDays(lastMonday, 7);
        const start = setDateWithTime(lastMonday, opening_time);
        const end = setDateWithTime(thisMonday, closing_time);
        return { start, end };
      }
      default:
        return null;
    }
  }, [companySettings]);

  // Preset seçildiğinde
  const handlePresetSelect = (preset) => {
    const dates = getPresetDates(preset);
    if (dates) {
      setStartDate(dates.start);
      setEndDate(dates.end);
      setActivePreset(preset);
    }
  };

  // İlk yükleme
  useEffect(() => {
    fetchCompanySettings();
  }, [fetchCompanySettings]);

  // Şirket ayarları yüklendiğinde varsayılan tarih ayarla
  useEffect(() => {
    if (companySettings.opening_time) {
      handlePresetSelect("today");
    }
  }, [companySettings]);

  // Veri çek
  const fetchData = useCallback(async () => {
    if (!startDate || !endDate || !restaurantId) return;
    
    setLoading(true);
    try {
      // Türkiye saati formatında gönder (UTC değil)
      const formatDateTurkey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+03:00`;
      };
      
      const res = await axios.post(`${API}/restoran-mutabakat/restaurant/${restaurantId}`, {
        start_datetime: formatDateTurkey(startDate),
        end_datetime: formatDateTurkey(endDate)
      });
      setData(res.data);
    } catch (err) {
      console.error("Mütabakat verisi alınamadı:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, startDate, endDate]);

  // Tarih değiştiğinde otomatik çek
  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [startDate, endDate, fetchData]);

  // Manuel tarih seçildiğinde preset'i temizle
  const handleManualDateSelect = (type, date) => {
    if (type === "start") {
      setStartDate(setDateWithTime(date, companySettings.opening_time));
    } else {
      setEndDate(setDateWithTime(date, companySettings.closing_time));
    }
    setActivePreset(null);
  };

  const presets = [
    { key: "today", label: "Bugün" },
    { key: "yesterday", label: "Dün" },
    { key: "this_week", label: "Bu Hafta" },
    { key: "last_week", label: "Geçen Hafta" }
  ];

  return (
    <div className="space-y-4" data-testid="restaurant-mutabakat-raporu">
      {/* Filtreler */}
      <Card className="border-2 border-border bg-white">
        <CardContent className="p-4 space-y-4">
          {/* Preset Butonları */}
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant={activePreset === preset.key ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSelect(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Tarih Seçiciler */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Başlangıç:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {startDate ? format(startDate, "dd MMM yyyy HH:mm", { locale: tr }) : "Seç"}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => handleManualDateSelect("start", date)}
                    locale={tr}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Bitiş:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {endDate ? format(endDate, "dd MMM yyyy HH:mm", { locale: tr }) : "Seç"}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => handleManualDateSelect("end", date)}
                    locale={tr}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Sonuçlar */}
      {!loading && data && (
        <Card className="border-2 border-border bg-white">
          <CardContent className="p-0">
            {/* Başlık */}
            <div className="p-4 border-b border-border flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Mütabakat Raporu</h3>
                <p className="text-sm text-muted-foreground">{data.order_count} sipariş</p>
              </div>
            </div>

            {/* Tablo */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-medium">Kalem</th>
                    <th className="text-right p-3 font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3">Sipariş Sayısı</td>
                    <td className="p-3 text-right font-medium">{data.order_count}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Taşıma Ücreti</td>
                    <td className="p-3 text-right">{formatMoney(data.delivery_fee)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">KDV (%{data.vat_rate})</td>
                    <td className="p-3 text-right">{formatMoney(data.delivery_vat)}</td>
                  </tr>
                  <tr className="border-b border-border bg-muted/30">
                    <td className="p-3 font-medium">Toplam Taşıma</td>
                    <td className="p-3 text-right font-medium">{formatMoney(data.total_delivery)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">POS Komisyonu (%{data.pos_commission_rate})</td>
                    <td className="p-3 text-right">{formatMoney(data.pos_commission)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">
                      Nakit Tahsilat
                      {!data.cash_included && <span className="text-xs text-muted-foreground ml-1">(hariç)</span>}
                    </td>
                    <td className="p-3 text-right">{formatMoney(data.cash_amount)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">
                      Kart Tahsilat
                      {!data.card_included && <span className="text-xs text-muted-foreground ml-1">(hariç)</span>}
                    </td>
                    <td className="p-3 text-right">{formatMoney(data.card_amount)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">
                      Yemek Kartı
                      {!data.meal_card_included && <span className="text-xs text-muted-foreground ml-1">(hariç)</span>}
                    </td>
                    <td className="p-3 text-right">{formatMoney(data.meal_card_amount)}</td>
                  </tr>
                  <tr className="bg-primary/5">
                    <td className="p-3 font-bold text-base">Net Tutar</td>
                    <td className={`p-3 text-right font-bold text-base ${data.net_amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatMoney(data.net_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Açıklama */}
            <div className="p-4 bg-muted/30 text-xs text-muted-foreground">
              <p>
                <strong>Net Tutar Hesaplama:</strong> (Toplam Taşıma + POS Komisyonu) - (Nakit + Kart + Yemek Kartı)
              </p>
              <p className="mt-1">
                {data.net_amount < 0 
                  ? "Negatif tutar: Restorana ödeme yapılacak" 
                  : "Pozitif tutar: Restorandan tahsilat yapılacak"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Veri yok */}
      {!loading && data && data.order_count === 0 && (
        <Card className="border-2 border-border bg-white">
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Seçili tarih aralığında sipariş bulunamadı.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
