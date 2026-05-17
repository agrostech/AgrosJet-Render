/**
 * Günlük Hakediş Görünümü
 *
 * Mevcut haftalık akışla aynı hesaplama mantığını gün bazında gösterir.
 * - WeekSelector ile hafta seç → backend 7 gün döner
 * - Tablo: tarih + kurye satırları (her gün collapsible)
 * - Gün-bazlı toggle ayarları paneli (haftanın 7 günü)
 * - Geri Al butonu (sadece superadmin)
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Calendar, Settings as SettingsIcon, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import WeekSelector from "@/components/muhasebe/WeekSelector";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WEEKDAY_LABELS = {
  monday: "Pazartesi", tuesday: "Salı", wednesday: "Çarşamba",
  thursday: "Perşembe", friday: "Cuma", saturday: "Cumartesi", sunday: "Pazar",
};
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

const getWeekdayKey = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const idx = (d.getDay() + 6) % 7; // JS: Sunday=0, Monday=1 → bizim: Monday=0, Sunday=6
  return WEEKDAY_KEYS[idx];
};

function DayBlock({ day, onApply, onRevert, isSuperAdmin, busyDate }) {
  const couriers = day.couriers || [];
  const [open, setOpen] = useState(couriers.length > 0);
  const [selected, setSelected] = useState([]);
  const unprocessed = couriers.filter((c) => !c.is_processed && c.amount > 0);
  const processed = couriers.filter((c) => c.is_processed);
  const selectedUnprocessed = unprocessed.filter((c) => selected.includes(c.courier_id));
  const selectedProcessed = processed.filter((c) => selected.includes(c.courier_id));

  const toggleAll = () => {
    if (selected.length === couriers.length) setSelected([]);
    else setSelected(couriers.map((c) => c.courier_id));
  };

  const isBusy = busyDate === day.business_date;

  return (
    <Card className="border" data-testid={`day-block-${day.business_date}`}>
      <div className="px-3 py-2 flex items-center justify-between border-b cursor-pointer hover:bg-slate-50" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
      {open && (
        <CardContent className="p-0">
          {couriers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Bu gün için kayıt yok</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="p-2 w-8">
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
                      <th className="p-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {couriers.map((c) => (
                      <tr key={c.courier_id} className={`border-b hover:bg-slate-50 ${c.is_processed ? "bg-green-50/40" : ""}`}>
                        <td className="p-2">
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
                        <td className="p-2">
                          {c.is_processed ? (
                            <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">İşlendi</span>
                          ) : (
                            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Bekliyor</span>
                          )}
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
                    onClick={() => onRevert(day.business_date, selectedProcessed.map(c => c.courier_id))}
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
      )}
    </Card>
  );
}

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

export default function DailyHakedisView({ companyId, adminId, adminName, isSuperAdmin }) {
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyDate, setBusyDate] = useState(null);

  // Hafta listesini al
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

  // 7 günlük sabit grid: API'den dönmese veya bazı günler eksik olsa bile boş satır göster.
  const buildSevenDayGrid = () => {
    if (!selectedWeek?.week_start) return days;
    const startStr = selectedWeek.week_start.slice(0, 10); // "YYYY-MM-DD"
    const startDate = new Date(startStr + "T12:00:00");
    const byDate = new Map((days || []).map((d) => [d.business_date, d]));
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      result.push(
        byDate.get(key) || {
          business_date: key,
          couriers: [],
          summary: { total_amount: 0, total_orders: 0 },
        }
      );
    }
    return result;
  };

  const displayDays = buildSevenDayGrid();

  return (
    <div className="space-y-4" data-testid="daily-hakedis-view">
      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <WeekSelector weeks={weeks} selectedWeek={selectedWeek} onSelect={setSelectedWeek} loading={loading} />
          <Button variant="ghost" size="sm" onClick={fetchDays} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <div className="ml-auto text-sm">
            Toplam: <span className="font-bold text-emerald-700">{formatMoney(total)}</span>
          </div>
        </CardContent>
      </Card>

      <AutoSettingsPanel companyId={companyId} isSuperAdmin={isSuperAdmin} />

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {displayDays.map((d) => (
            <DayBlock
              key={d.business_date}
              day={d}
              onApply={handleApply}
              onRevert={handleRevert}
              isSuperAdmin={isSuperAdmin}
              busyDate={busyDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
