import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Users, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtMin = (m) => {
  if (!m) return "—";
  if (m < 60) return `${Math.round(m)} dk`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r > 0 ? `${h}s ${r}dk` : `${h}s`;
};

function PerformanceTable({ data, average, title, icon: Icon }) {
  if (!data || data.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-semibold text-sm text-slate-700">
          <Icon className="w-4 h-4" /> {title}
        </h3>
        <div className="border rounded-lg overflow-x-auto">
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
            <tbody>
              <tr><td colSpan={7} className="text-center py-4 text-muted-foreground text-sm">Veri bulunamadı</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const sorted = [...data]
    .filter(r => r.delivery_count > 0 || r.active_hours > 0 || r.violation_count > 0 || r.break_minutes > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", 'tr'));

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-semibold text-sm text-slate-700">
        <Icon className="w-4 h-4" /> {title}
      </h3>
      <div className="border rounded-lg overflow-x-auto">
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
                <td className="py-2 px-3 text-right">{row.avg_delivery_minutes > 0 ? `${row.avg_delivery_minutes} dk` : "—"}</td>
                <td className="py-2 px-3 text-right">{row.active_hours > 0 ? `${row.active_hours}s` : "—"}</td>
                <td className="py-2 px-3 text-right">{row.hourly_delivery_avg > 0 ? row.hourly_delivery_avg : "—"}</td>
                <td className="py-2 px-3 text-right">{row.violation_count > 0 ? row.violation_count : "—"}</td>
                <td className="py-2 px-3 text-right">{row.break_minutes > 0 ? fmtMin(row.break_minutes) : "—"}</td>
              </tr>
            ))}
            {average && (
              <tr className="bg-slate-100 font-semibold">
                <td className="py-2 px-3 whitespace-nowrap">Kurye Ortalaması</td>
                <td className="py-2 px-3 text-right">{average.delivery_count}</td>
                <td className="py-2 px-3 text-right">{average.avg_delivery_minutes > 0 ? `${average.avg_delivery_minutes} dk` : "—"}</td>
                <td className="py-2 px-3 text-right">{average.active_hours > 0 ? `${average.active_hours}s` : "—"}</td>
                <td className="py-2 px-3 text-right">{average.hourly_delivery_avg > 0 ? average.hourly_delivery_avg : "—"}</td>
                <td className="py-2 px-3 text-right">{average.violation_count > 0 ? average.violation_count : "—"}</td>
                <td className="py-2 px-3 text-right">{average.break_minutes > 0 ? fmtMin(average.break_minutes) : "—"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PerformansRaporu({ companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  const getDefaultDateTimes = useCallback((companyData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const openingTime = companyData?.opening_time || "09:00";
    const closingTime = companyData?.closing_time || "23:00";
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return {
      start: `${formatDate(today)}T${openingTime}`,
      end: `${formatDate(tomorrow)}T${closingTime}`
    };
  }, []);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!companyId) return;
      try {
        const res = await axios.get(`${API}/companies/${companyId}`);
        const defaults = getDefaultDateTimes(res.data);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      } catch {
        const defaults = getDefaultDateTimes(null);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      }
    };
    fetchCompany();
  }, [companyId, getDefaultDateTimes]);

  const handleGenerate = async () => {
    if (!companyId || !startDateTime || !endDateTime) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/performance`, {
        params: { company_id: companyId, start_datetime: startDateTime, end_datetime: endDateTime }
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="performans-raporu">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="datetime-local"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="perf-start-datetime"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="datetime-local"
          value={endDateTime}
          onChange={(e) => setEndDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="perf-end-datetime"
        />
        <Button size="sm" onClick={handleGenerate} disabled={loading} className="h-8 text-xs" data-testid="perf-generate-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rapor Oluştur"}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Saatlik Sipariş Grafiği */}
          {data.hourly_distribution && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-slate-700">Saatlik Sipariş Dağılımı</h3>
              <div className="border rounded-lg p-4" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourly_distribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h) => `${String(h).padStart(2, '0')}:00`} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                    <Tooltip
                      formatter={(val) => [`${val} sipariş`, ""]}
                      labelFormatter={(h) => `${String(h).padStart(2, '0')}:00 - ${String(h).padStart(2, '0')}:59`}
                    />
                    <Bar dataKey="count" fill="#334155" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <PerformanceTable
            data={data.couriers}
            average={data.courier_average}
            title="Kurye Performansı"
            icon={Users}
          />
          <PerformanceTable
            data={data.admins}
            average={null}
            title="Yönetici Performansı"
            icon={Briefcase}
          />
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Tarih aralığı seçip "Rapor Oluştur" butonuna tıklayın
        </div>
      )}
    </div>
  );
}
