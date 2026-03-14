import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  Clock, Users, Briefcase, Filter, RefreshCw,
  ChevronLeft, ChevronRight, Calendar,
  CircleDot, Coffee, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_LABELS = { "active": "Aktif", "offline": "Offline", "on_break": "Molada" };
const STATUS_ICONS = { "active": CircleDot, "offline": LogOut, "on_break": Coffee };

const formatTime = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  return `${day}.${month}.${year} ${dayNames[d.getDay()]}`;
};

export default function StatusMovementsSection({ companyId }) {
  const [activeTab, setActiveTab] = useState("courier");
  const [logs, setLogs] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const [selectedDate, setSelectedDate] = useState(() => fmtLocal(new Date()));

  const goToPreviousDay = () => { const c = new Date(selectedDate + 'T12:00:00'); c.setDate(c.getDate() - 1); setSelectedDate(fmtLocal(c)); };
  const goToNextDay = () => { const c = new Date(selectedDate + 'T12:00:00'); c.setDate(c.getDate() + 1); setSelectedDate(fmtLocal(c)); };
  const goToToday = () => { setSelectedDate(fmtLocal(new Date())); };

  const fetchEntities = useCallback(async () => {
    if (!companyId) return;
    try {
      const endpoint = activeTab === "courier" ? `${API}/companies/${companyId}/couriers` : `${API}/admins?company_id=${companyId}`;
      const res = await axios.get(endpoint);
      setEntities(res.data.map(e => ({ id: e.id, name: e.name || e.username || "İsimsiz" })).sort((a, b) => a.name.localeCompare(b.name, 'tr')));
    } catch {}
  }, [companyId, activeTab]);

  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/status-movements/${companyId}`, { params: { entity_type: activeTab, date: selectedDate, entity_id: selectedEntity || undefined } });
      setLogs(res.data.logs || []);
    } catch { toast.error("Hareketler yüklenemedi"); setLogs([]); }
    finally { setLoading(false); }
  }, [companyId, activeTab, selectedDate, selectedEntity]);

  useEffect(() => { fetchEntities(); fetchLogs(); }, [fetchEntities, fetchLogs]);

  const isToday = selectedDate === fmtLocal(new Date());

  return (
    <div className="border-2 border-border bg-white dark:bg-slate-900 rounded-lg overflow-hidden" data-testid="movements-section">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-700">
            <Clock className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base">Durum Hareketleri</h3>
            <p className="text-xs text-muted-foreground">Kurye ve yönetici durum değişiklikleri</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">

      {/* Tarih Seçici */}
      <div className="flex items-center justify-between gap-1 py-1.5 px-1 bg-slate-50 rounded-lg">
        <button onClick={goToPreviousDay} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" /></button>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-semibold text-xs sm:text-sm">{formatDate(selectedDate)}</span>
          {!isToday && <button onClick={goToToday} className="text-[10px] sm:text-xs text-primary hover:underline ml-1">Bugün</button>}
        </div>
        <button onClick={goToNextDay} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 sm:gap-2">
        <button onClick={() => { setActiveTab("courier"); setSelectedEntity(""); }} className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors ${activeTab === "courier" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Kuryeler
        </button>
        <button onClick={() => { setActiveTab("admin"); setSelectedEntity(""); }} className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors ${activeTab === "admin" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Yöneticiler
        </button>
      </div>

      {/* Filtre */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0 hidden sm:block" />
        <select value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)} className="flex-1 h-8 sm:h-9 text-xs sm:text-sm border border-slate-200 rounded px-2 bg-white">
          <option value="">Tüm {activeTab === "courier" ? "Kuryeler" : "Yöneticiler"}</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => { fetchLogs(); fetchEntities(); }} className="h-8 sm:h-9"><RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></Button>
      </div>

      {/* Log Listesi */}
      <div className="border rounded-lg max-h-[400px] sm:max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Clock className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-xs sm:text-sm">{selectedEntity ? "Bu kişi için hareket kaydı yok" : `${activeTab === "courier" ? "Kurye" : "Yönetici"} hareket kaydı yok`}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log, index) => {
              const Icon = STATUS_ICONS[log.status] || Clock;
              return (
                <div key={log.id || index} className="p-2.5 sm:p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-600">
                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs sm:text-sm truncate">{log.entity_name}</p>
                        <p className="text-[11px] sm:text-xs font-medium text-slate-600">{STATUS_LABELS[log.status] || log.status}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700">{formatTime(log.timestamp)}</p>
                      {log.changed_by_name && <p className="text-[10px] sm:text-xs text-muted-foreground">{log.changed_by_name}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px] sm:text-xs">
        {Object.entries(STATUS_LABELS).map(([status, label]) => {
          const Icon = STATUS_ICONS[status] || Clock;
          return <div key={status} className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600"><Icon className="w-3 h-3" /><span>{label}</span></div>;
        })}
      </div>
      </div>
    </div>
  );
}

