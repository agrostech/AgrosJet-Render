import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Briefcase, Building2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ReportDateFilter from "./ReportDateFilter";
import { exportPerformansRaporuPDF } from "@/utils/reportPdfExport";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtMin = (m) => {
  if (!m) return "\u2014";
  if (m < 60) return `${Math.round(m)} dk`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r > 0 ? `${h}s ${r}dk` : `${h}s`;
};

const MULTI_DAY_PRESETS = ["bu-hafta", "gecen-hafta", "bu-ay"];

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
      <Icon className="w-4 h-4 text-slate-600" />
      <h3 className="font-semibold text-sm text-slate-700">{title}</h3>
    </div>
  );
}

/* Mobilde her satır kart olarak gösterilir */
function PerformanceCard({ row }) {
  return (
    <div className="border rounded-lg p-2.5 space-y-1" data-testid={`perf-card-${row.courier_id || row.name}`}>
      <div className="font-medium text-sm">{row.name}</div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">Teslimat: <strong className="text-foreground">{row.delivery_count}</strong></span>
        <span className="text-muted-foreground">Ort: <strong className="text-foreground">{row.avg_delivery_minutes > 0 ? `${row.avg_delivery_minutes}dk` : "\u2014"}</strong></span>
        <span className="text-muted-foreground">Saat: <strong className="text-foreground">{row.active_hours > 0 ? `${row.active_hours}s` : "\u2014"}</strong></span>
        <span className="text-muted-foreground">T/Saat: <strong className="text-foreground">{row.hourly_delivery_avg > 0 ? row.hourly_delivery_avg : "\u2014"}</strong></span>
        <span className="text-muted-foreground">İhlal: <strong className="text-foreground">{row.violation_count > 0 ? row.violation_count : "\u2014"}</strong></span>
        <span className="text-muted-foreground">Mola: <strong className="text-foreground">{row.break_minutes > 0 ? fmtMin(row.break_minutes) : "\u2014"}</strong></span>
      </div>
    </div>
  );
}

function PerformanceTable({ data, average, averageLabel }) {
  const sorted = (data || [])
    .filter(r => r.delivery_count > 0 || r.active_hours > 0 || r.violation_count > 0 || r.break_minutes > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "tr"));

  if (sorted.length === 0) {
    return <p className="text-center py-4 text-muted-foreground text-sm">Veri bulunamadı</p>;
  }

  return (
    <>
      {/* Mobil: Kart görünümü */}
      <div className="sm:hidden space-y-2">
        {sorted.map((row) => (
          <PerformanceCard key={row.courier_id || row.name} row={row} />
        ))}
        {average && (
          <div className="border-2 border-slate-300 rounded-lg p-2.5 bg-slate-50">
            <div className="font-semibold text-sm mb-1">{averageLabel || "Ortalama"}</div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-muted-foreground">Teslimat: <strong>{average.delivery_count}</strong></span>
              <span className="text-muted-foreground">Ort: <strong>{average.avg_delivery_minutes > 0 ? `${average.avg_delivery_minutes}dk` : "\u2014"}</strong></span>
              <span className="text-muted-foreground">Saat: <strong>{average.active_hours > 0 ? `${average.active_hours}s` : "\u2014"}</strong></span>
              <span className="text-muted-foreground">T/Saat: <strong>{average.hourly_delivery_avg > 0 ? average.hourly_delivery_avg : "\u2014"}</strong></span>
              <span className="text-muted-foreground">İhlal: <strong>{average.violation_count > 0 ? average.violation_count : "\u2014"}</strong></span>
              <span className="text-muted-foreground">Mola: <strong>{average.break_minutes > 0 ? fmtMin(average.break_minutes) : "\u2014"}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Masaüstü: Tablo görünümü */}
      <div className="hidden sm:block border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">İsim</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Teslimat</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Ort. Süre</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Aktif Saat</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Teslimat/Saat</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">İhlal</th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Mola</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((row) => (
              <tr key={row.courier_id} className="hover:bg-slate-50">
                <td className="py-2 px-3 font-medium whitespace-nowrap">{row.name}</td>
                <td className="py-2 px-3 text-right">{row.delivery_count}</td>
                <td className="py-2 px-3 text-right">{row.avg_delivery_minutes > 0 ? `${row.avg_delivery_minutes} dk` : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{row.active_hours > 0 ? `${row.active_hours}s` : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{row.hourly_delivery_avg > 0 ? row.hourly_delivery_avg : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{row.violation_count > 0 ? row.violation_count : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{row.break_minutes > 0 ? fmtMin(row.break_minutes) : "\u2014"}</td>
              </tr>
            ))}
            {average && (
              <tr className="bg-slate-100 font-semibold">
                <td className="py-2 px-3 whitespace-nowrap">{averageLabel || "Ortalama"}</td>
                <td className="py-2 px-3 text-right">{average.delivery_count}</td>
                <td className="py-2 px-3 text-right">{average.avg_delivery_minutes > 0 ? `${average.avg_delivery_minutes} dk` : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{average.active_hours > 0 ? `${average.active_hours}s` : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{average.hourly_delivery_avg > 0 ? average.hourly_delivery_avg : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{average.violation_count > 0 ? average.violation_count : "\u2014"}</td>
                <td className="py-2 px-3 text-right">{average.break_minutes > 0 ? fmtMin(average.break_minutes) : "\u2014"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

const DAY_NAMES = { 0: "Paz", 1: "Pzt", 2: "Sal", 3: "Car", 4: "Per", 5: "Cum", 6: "Cmt" };

function fmtDayLabel(dateStr) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const day = DAY_NAMES[d.getDay()] || "";
    return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)} ${day}`;
  } catch {
    return dateStr;
  }
}

export default function PerformansRaporu({ companyId, companyLogo, companyName }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [activePreset, setActivePreset] = useState("bugun");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setDateRange({ start, end });
    try {
      const res = await axios.get(`${API}/reports/performance`, {
        params: { company_id: companyId, start_datetime: start, end_datetime: end }
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const showDailyChart = MULTI_DAY_PRESETS.includes(activePreset);

  return (
    <div className="space-y-4" data-testid="performans-raporu">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} onPresetChange={setActivePreset} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <Card>
          <CardContent className="p-2.5 sm:p-3 space-y-6 sm:space-y-8">
          {/* PDF butonu */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => exportPerformansRaporuPDF({ data, companyLogo, companyName, dateRange, companyId })}
              data-testid="btn-export-performans-pdf"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </div>
          {/* 1. Şirket Performansı */}
          <div className="space-y-3 sm:space-y-4">
            <SectionHeader icon={Building2} title="Şirket Performansı" />

            {/* Günlük sipariş grafiği */}
            {showDailyChart && data.daily_distribution && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-slate-500 pl-1">Günlük Sipariş Sayısı</h4>
                <div className="border rounded-lg p-2 sm:p-4" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily_distribution} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d) => d.slice(8, 10)} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={25} />
                      <Tooltip
                        formatter={(val) => [`${val} sipariş`, ""]}
                        labelFormatter={(d) => fmtDayLabel(d)}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="count" fill="#1e40af" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Saatlik sipariş dağılımı */}
            {data.hourly_distribution && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-slate-500 pl-1">Saatlik Sipariş Dağılımı</h4>
                <div className="border rounded-lg p-2 sm:p-4" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.hourly_distribution} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 9 }}
                        tickFormatter={(h) => `${String(h).padStart(2, "0")}`}
                        interval={1}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={25} />
                      <Tooltip
                        formatter={(val) => [`${val} sipariş`, ""]}
                        labelFormatter={(h) => `${String(h).padStart(2, "0")}:00 - ${String(h).padStart(2, "0")}:59`}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="count" fill="#334155" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* 2. Kurye Performansı */}
          <div className="space-y-3">
            <SectionHeader icon={Users} title="Kurye Performansı" />
            <PerformanceTable data={data.couriers} average={data.courier_average} averageLabel="Kurye Ortalaması" />
          </div>

          {/* 3. Yönetici Performansı */}
          <div className="space-y-3">
            <SectionHeader icon={Briefcase} title="Yönetici Performansı" />
            <PerformanceTable data={data.admins} average={null} />
          </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
