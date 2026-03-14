import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  Clock, Users, Briefcase, Filter, RefreshCw,
  ChevronLeft, ChevronRight, Calendar,
  CircleDot, Coffee, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_LABELS = {
  "active": "Aktif",
  "offline": "Offline",
  "on_break": "Molada"
};

const STATUS_COLORS = {
  "active": "text-slate-700 bg-slate-100",
  "offline": "text-slate-500 bg-slate-100",
  "on_break": "text-slate-600 bg-slate-100"
};

const STATUS_ICONS = {
  "active": CircleDot,
  "offline": LogOut,
  "on_break": Coffee
};

const formatTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const dayName = dayNames[d.getDay()];
  return `${day}.${month}.${year} ${dayName}`;
};

export function StatusMovementsModal({ open, onOpenChange, companyId }) {
  const [activeTab, setActiveTab] = useState("courier");
  const [logs, setLogs] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const [selectedDate, setSelectedDate] = useState(() => fmtLocal(new Date()));

  const goToPreviousDay = () => {
    const current = new Date(selectedDate + 'T12:00:00');
    current.setDate(current.getDate() - 1);
    setSelectedDate(fmtLocal(current));
  };

  const goToNextDay = () => {
    const current = new Date(selectedDate + 'T12:00:00');
    current.setDate(current.getDate() + 1);
    setSelectedDate(fmtLocal(current));
  };

  const goToToday = () => {
    setSelectedDate(fmtLocal(new Date()));
  };

  const fetchEntities = useCallback(async () => {
    if (!companyId) return;
    try {
      let endpoint;
      if (activeTab === "courier") {
        endpoint = `${API}/companies/${companyId}/couriers`;
      } else {
        endpoint = `${API}/admins?company_id=${companyId}`;
      }
      
      const res = await axios.get(endpoint);
      const data = res.data;
      
      // Format entities for dropdown and sort alphabetically
      const formatted = data
        .map(e => ({
          id: e.id,
          name: e.name || e.username || "İsimsiz"
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      
      setEntities(formatted);
    } catch (err) {
      console.error("Kişiler yüklenemedi:", err);
    }
  }, [companyId, activeTab]);

  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/status-movements/${companyId}`, {
        params: {
          entity_type: activeTab,
          date: selectedDate,
          entity_id: selectedEntity || undefined
        }
      });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error("Hareketler yüklenemedi:", err);
      toast.error("Hareketler yüklenemedi");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, activeTab, selectedDate, selectedEntity]);

  useEffect(() => {
    if (open) {
      fetchEntities();
      fetchLogs();
    }
  }, [open, fetchEntities, fetchLogs]);

  const isToday = selectedDate === fmtLocal(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-500" />
            Durum Hareketleri
          </DialogTitle>
        </DialogHeader>

        {/* Tarih Seçici */}
        <div className="flex items-center justify-between gap-2 py-2 px-1 bg-slate-50 rounded-lg">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            data-testid="prev-day-btn"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-sm">
              {formatDate(selectedDate)}
            </span>
            {!isToday && (
              <button
                onClick={goToToday}
                className="text-xs text-primary hover:underline ml-2"
                data-testid="go-today-btn"
              >
                Bugün
              </button>
            )}
          </div>
          
          <button
            onClick={goToNextDay}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            data-testid="next-day-btn"
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => { setActiveTab("courier"); setSelectedEntity(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${
              activeTab === "courier"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            data-testid="courier-tab"
          >
            <Users className="w-4 h-4" />
            Kuryeler
          </button>
          <button
            onClick={() => { setActiveTab("admin"); setSelectedEntity(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${
              activeTab === "admin"
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            data-testid="admin-tab"
          >
            <Briefcase className="w-4 h-4" />
            Yöneticiler
          </button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 py-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="flex-1 h-9 text-sm border border-slate-200 rounded px-2 bg-white"
            data-testid="entity-filter"
          >
            <option value="">
              Tüm {activeTab === "courier" ? "Kuryeler" : "Yöneticiler"}
            </option>
            {entities.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { fetchLogs(); fetchEntities(); }}
            className="h-9"
            data-testid="refresh-btn"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Logs List */}
        <div className="flex-1 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Clock className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-sm">
                {selectedEntity 
                  ? "Bu kişi için hareket kaydı yok" 
                  : `${activeTab === "courier" ? "Kurye" : "Yönetici"} hareket kaydı yok`
                }
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log, index) => {
                const Icon = STATUS_ICONS[log.status] || Clock;
                
                return (
                  <div key={log.id || index} className="p-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-600">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{log.entity_name}</p>
                          <p className="text-xs font-medium text-slate-600">
                            {STATUS_LABELS[log.status] || log.status}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-mono font-semibold text-slate-700">
                          {formatTime(log.timestamp)}
                        </p>
                        {log.changed_by_name && (
                          <p className="text-xs text-muted-foreground">
                            {log.changed_by_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs text-muted-foreground mb-2">Durum Türleri:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const Icon = STATUS_ICONS[status] || Clock;
              return (
                <div 
                  key={status} 
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-100 text-slate-600"
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StatusMovementsModal;
