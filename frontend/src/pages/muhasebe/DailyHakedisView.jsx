/**
 * Günlük Hakediş Görünümü (Kurye Mütabakat tarzı UX)
 *
 * - Hafta dropdown (WeekSelector) + sol/sağ ok ile hafta navigasyonu
 * - 7 günlük yatay sekme: gün adı / sayı / processed-X/Y veya yeşil tik
 * - Sadece o gün hakedişi > 0 olan kuryeler listelenir
 * - Geri Al butonu (sadece superadmin)
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  RefreshCw,
  Calendar,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import WeekSelector from "@/components/muhasebe/WeekSelector";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WEEKDAY_LABELS = {
  monday: "Pazartesi", tuesday: "Salı", wednesday: "Çarşamba",
  thursday: "Perşembe", friday: "Cuma", saturday: "Cumartesi", sunday: "Pazar",
};
const WEEKDAY_SHORT = {
  monday: "Pzt", tuesday: "Sal", wednesday: "Çar",
  thursday: "Per", friday: "Cum", saturday: "Cmt", sunday: "Paz",
};
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

const getWeekdayKey = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const idx = (d.getDay() + 6) % 7;
  return WEEKDAY_KEYS[idx];
};

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function AutoSettingsPanel({ companyId, isSuperAdmin }) {
  const [days, setDays] = useState({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/weekly-hakedis/daily/auto-settings/${companyId}`);
      setDays(res.data.days_enabled || {});
    } catch {
      setDays({});
    }
  }, [companyId]);

  useEffect(() => {
    if (open) fetchSettings();
  }, [open, fetchSettings]);

  const save = async (next) => {
    setLoading(true);
    try {
      await axios.put(`${API}/weekly-hakedis/daily/auto-settings/${companyId}`, { days_enabled: next });
      setDays(next);
      toast.success("Ayarlar kaydedildi");
    } catch {
      toast.error("Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded-md bg-white">
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium hover:bg-slate-50"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-slate-500" />
          Otomatik İşleme Ayarları (Günlük)
        </span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3 border-t space-y-2">
          <p className="text-[11px] text-muted-foreground">
            İşaretli günlerin hakedişi ertesi gün şirket açılış saatinde otomatik işlenir.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WEEKDAY_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={!!days[k]}
                  onCheckedChange={(v) => save({ ...days, [k]: !!v })}
                  disabled={loading || !isSuperAdmin}
                  data-testid={`daily-auto-toggle-${k}`}
                />
                {WEEKDAY_LABELS[k]}
              </label>
            ))}
          </div>
          {!isSuperAdmin && (
            <p className="text-[11px] text-amber-600">Sadece superadmin değiştirebilir.</p>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedDayPanel({ day, onApply, onRevert, isSuperAdmin, busyDate }) {
  const couriers = useMemo(
    () => (day.couriers || []).filter((c) => Number(c.amount || 0) > 0),
    [day]
  );
  const [selected, setSelected] = useState([]);

  // Gün değişince seçimi sıfırla
  useEffect(() => {
    setSelected([]);
  }, [day.business_date]);

  const unprocessed = couriers.filter((c) => !c.is_processed);
  const processed = couriers.filter((c) => c.is_processed);
  const selectedUnprocessed = unprocessed.filter((c) => selected.includes(c.courier_id));
  const selectedProcessed = processed.filter((c) => selected.includes(c.courier_id));

  const toggleAll = () => {
    if (selected.length === couriers.length) setSelected([]);
    else setSelected(couriers.map((c) => c.courier_id));
  };

  const isBusy = busyDate === day.business_date;

  return (
    <Card className="border" data-testid={`day-panel-${day.business_date}`}>
      <div className="px-3 py-2 flex items-center justify-between border-b bg-slate-50">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-sm">{day.business_date}</span>
          <span className="text-[11px] text-muted-foreground">
            ({WEEKDAY_LABELS[getWeekdayKey(day.business_date)]})
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span>{day.summary?.total_orders || 0} sipariş</span>
          <span className="font-semibold text-emerald-700">{formatMoney(day.summary?.total_amount || 0)}</span>
        </div>
      </div>
      <CardContent className="p-0">
        {couriers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Bu gün için hakedişi olan kurye yok</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-2 w-8 text-center">
                      <Checkbox
                        checked={couriers.length > 0 && selected.length === couriers.length}
                        onCheckedChange={toggleAll}
                        data-testid={`day-select-all-${day.business_date}`}
                      />
                    </th>
                    <th className="p-2 text-left">Kurye</th>
                    <th className="p-2 text-right">Sipariş</th>
                    <th className="p-2 text-right">Mesafe</th>
                    <th className="p-2 text-right">Saatlik</th>
                    <th className="p-2 text-right">Hakediş</th>
                    <th className="p-2 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {couriers.map((c) => (
                    <tr
                      key={c.courier_id}
                      className={`border-b hover:bg-slate-50 ${c.is_processed ? "bg-green-50/40" : ""}`}
                    >
                      <td className="p-2 text-center">
                        <Checkbox
                          checked={selected.includes(c.courier_id)}
                          onCheckedChange={() =>
                            setSelected((p) =>
                              p.includes(c.courier_id) ? p.filter((x) => x !== c.courier_id) : [...p, c.courier_id]
                            )
                          }
                        />
                      </td>
                      <td className="p-2 truncate max-w-[160px]" title={c.courier_name}>{c.courier_name}</td>
                      <td className="p-2 text-right">{c.order_count}</td>
                      <td className="p-2 text-right">{(c.distance_km || 0).toFixed(1)}</td>
                      <td className="p-2 text-right">{formatMoney(c.hourly_earnings || 0)}</td>
                      <td className="p-2 text-right font-semibold">{formatMoney(c.amount)}</td>
                      <td className="p-2 text-center">
                        <span
                          className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            c.is_processed
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {c.is_processed ? "İşlendi" : "Bekliyor"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t p-2 flex flex-wrap items-center justify-end gap-2 bg-slate-50/40">
              <Button
                size="sm"
                disabled={selectedUnprocessed.length === 0 || isBusy}
                onClick={() => onApply(day.business_date, selectedUnprocessed)}
                data-testid={`apply-${day.business_date}`}
              >
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                İşle ({selectedUnprocessed.length})
              </Button>
              {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedProcessed.length === 0 || isBusy}
                  onClick={() => onRevert(day.business_date, selectedProcessed.map((c) => c.courier_id))}
                  data-testid={`revert-${day.business_date}`}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Geri Al ({selectedProcessed.length})
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DailyHakedisView({ companyId, adminId, adminName, isSuperAdmin }) {
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyDate, setBusyDate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/weekly-hakedis/weeks/${companyId}`);
        setWeeks(res.data.weeks || []);
        const cur = res.data.weeks?.find((w) => w.is_current);
        setSelectedWeek(cur || res.data.weeks?.[0] || null);
      } catch {
        toast.error("Hafta listesi alınamadı");
      }
    })();
  }, [companyId]);

  const fetchDays = useCallback(async () => {
    if (!selectedWeek) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/weekly-hakedis/daily-data/${companyId}`, {
        params: { week_start: selectedWeek.week_start, week_end: selectedWeek.week_end },
      });
      setDays(res.data.days || []);
    } catch {
      toast.error("Günlük veri alınamadı");
      setDays([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedWeek]);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  // 7 günlük sabit grid (boş gün de listelenir)
  const sevenDays = useMemo(() => {
    if (!selectedWeek?.week_start) return [];
    const startStr = selectedWeek.week_start.slice(0, 10);
    const startDate = new Date(startStr + "T12:00:00");
    const byDate = new Map((days || []).map((d) => [d.business_date, d]));
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const data =
        byDate.get(key) || {
          business_date: key,
          couriers: [],
          summary: { total_amount: 0, total_orders: 0 },
        };
      const earningCouriers = (data.couriers || []).filter((c) => Number(c.amount || 0) > 0);
      const processedCount = earningCouriers.filter((c) => c.is_processed).length;
      result.push({
        ...data,
        day_number: d.getDate(),
        weekday_key: getWeekdayKey(key),
        total_with_earnings: earningCouriers.length,
        processed_count: processedCount,
        is_future: key > todayKey(),
      });
    }
    return result;
  }, [days, selectedWeek]);

  // Varsayılan: ilk yüklemede bugün veya seçili hafta içindeki bugün, yoksa hafta başlangıcı
  useEffect(() => {
    if (sevenDays.length === 0) {
      setSelectedDate(null);
      return;
    }
    if (selectedDate && sevenDays.some((d) => d.business_date === selectedDate)) return;
    const today = todayKey();
    const hit = sevenDays.find((d) => d.business_date === today);
    setSelectedDate(hit ? hit.business_date : sevenDays[0].business_date);
  }, [sevenDays, selectedDate]);

  const selectedDay = useMemo(
    () => sevenDays.find((d) => d.business_date === selectedDate) || null,
    [sevenDays, selectedDate]
  );

  const navigateWeek = (direction) => {
    if (weeks.length === 0 || !selectedWeek) return;
    const idx = weeks.findIndex((w) => w.week_start === selectedWeek.week_start);
    if (idx < 0) return;
    // weeks listesi en yeniden eskiye sıralı (index 0 = bu hafta)
    const nextIdx = direction === "prev" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= weeks.length) return;
    setSelectedWeek(weeks[nextIdx]);
    setSelectedDate(null);
  };

  const handleApply = async (business_date, items) => {
    setBusyDate(business_date);
    try {
      const res = await axios.post(`${API}/weekly-hakedis/daily/apply/${companyId}`, {
        business_date,
        items: items.map((it) => ({
          courier_id: it.courier_id,
          courier_name: it.courier_name,
          amount: it.amount,
          order_count: it.order_count,
          distance_km: it.distance_km,
        })),
        admin_id: adminId,
        admin_name: adminName,
        add_jetpuan: true,
      });
      toast.success(res.data.message || "İşlendi");
      fetchDays();
    } catch (e) {
      toast.error(e.response?.data?.detail || "İşleme başarısız");
    } finally {
      setBusyDate(null);
    }
  };

  const handleRevert = async (business_date, courier_ids) => {
    if (!confirm(`${business_date} için ${courier_ids.length} kurye geri alınsın mı?`)) return;
    setBusyDate(business_date);
    try {
      const res = await axios.post(`${API}/weekly-hakedis/daily/revert/${companyId}`, {
        business_date, admin_id: adminId, admin_name: adminName, courier_ids,
      });
      toast.success(res.data.message || "Geri alındı");
      fetchDays();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Geri alma başarısız");
    } finally {
      setBusyDate(null);
    }
  };

  const total = days.reduce((sum, d) => sum + (d.summary?.total_amount || 0), 0);

  const currentWeekIdx = weeks.findIndex((w) => w.week_start === selectedWeek?.week_start);
  const canPrev = currentWeekIdx >= 0 && currentWeekIdx < weeks.length - 1;
  const canNext = currentWeekIdx > 0;

  return (
    <div className="space-y-4" data-testid="daily-hakedis-view">
      {/* Üst Kontrol: Hafta seçici + toplam */}
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <WeekSelector weeks={weeks} selectedWeek={selectedWeek} onSelect={(w) => { setSelectedWeek(w); setSelectedDate(null); }} loading={loading} />
          <Button variant="ghost" size="sm" onClick={fetchDays} disabled={loading} data-testid="daily-refresh-btn">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <div className="ml-auto text-sm">
            Toplam: <span className="font-bold text-emerald-700">{formatMoney(total)}</span>
          </div>
        </CardContent>
      </Card>

      <AutoSettingsPanel companyId={companyId} isSuperAdmin={isSuperAdmin} />

      {/* Haftalık 7 Gün Seçici — Kurye Mütabakat tarzı */}
      <div className="flex items-center gap-1 bg-white border rounded-lg p-1.5 shadow-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateWeek("prev")}
          disabled={!canPrev || loading}
          className="h-8 w-8 p-0 shrink-0"
          data-testid="daily-week-prev"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
          {sevenDays.map((day) => {
            const isSelected = day.business_date === selectedDate;
            const isFuture = day.is_future;
            const total = day.total_with_earnings;
            const processed = day.processed_count;
            const isFullyComplete = total > 0 && processed === total;
            return (
              <button
                key={day.business_date}
                onClick={() => !isFuture && setSelectedDate(day.business_date)}
                disabled={isFuture}
                className={`
                  flex-1 min-w-[56px] py-1.5 px-1 rounded-md text-center transition-all
                  ${isSelected
                    ? "bg-slate-900 text-white shadow-sm"
                    : isFuture
                      ? "text-slate-300 cursor-not-allowed"
                      : "hover:bg-slate-100 text-slate-600"}
                `}
                data-testid={`daily-day-tab-${day.business_date}`}
              >
                <div className={`text-[10px] font-medium ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                  {WEEKDAY_SHORT[day.weekday_key]}
                </div>
                <div className="text-sm font-semibold">{day.day_number}</div>
                {!isFuture && total > 0 ? (
                  isFullyComplete ? (
                    <div className={`text-[10px] ${isSelected ? "text-green-400" : "text-green-500"}`}>
                      <CheckCircle2 className="w-3 h-3 mx-auto" />
                    </div>
                  ) : (
                    <div className={`text-[10px] font-medium ${isSelected ? "text-blue-300" : "text-blue-600"}`}>
                      {processed}/{total}
                    </div>
                  )
                ) : !isFuture ? (
                  <div className={`text-[10px] ${isSelected ? "text-slate-400" : "text-slate-400"}`}>0 kurye</div>
                ) : (
                  <div className="text-[10px]">-</div>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateWeek("next")}
          disabled={!canNext || loading}
          className="h-8 w-8 p-0 shrink-0"
          data-testid="daily-week-next"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : selectedDay ? (
        <SelectedDayPanel
          day={selectedDay}
          onApply={handleApply}
          onRevert={handleRevert}
          isSuperAdmin={isSuperAdmin}
          busyDate={busyDate}
        />
      ) : null}
    </div>
  );
}
