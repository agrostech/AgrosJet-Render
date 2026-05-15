import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  AlertTriangle, Users, Briefcase, Filter, Trash2, 
  Clock, UserX, UserCheck, Coffee, RefreshCw, LogOut,
  ChevronLeft, ChevronRight, Calendar, Settings, BadgeDollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const VIOLATION_ICONS = {
  "shift_started_not_active": UserX,
  "active_without_shift": UserCheck,
  "offline_before_shift_end": Clock,
  "still_active_after_shift_end": LogOut,
  "break_limit_exceeded": Coffee
};

const DAY_LABELS = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"];

const formatDateTimeWithDay = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const days = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"];
  const dayName = days[d.getDay()];
  const dateFormatted = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${dateFormatted} ${dayName} ${timeFormatted}`;
};

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
};

const getWeekRange = (date, openingTime = "06:00", closingTime = "06:00") => {
  const monday = getMonday(date);
  const [oH, oM] = openingTime.split(":").map(Number);
  const [cH, cM] = closingTime.split(":").map(Number);
  
  const start = new Date(monday);
  start.setHours(oH, oM, 0, 0);
  
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(cH, cM, 0, 0);
  
  return { start, end: nextMonday };
};

const getDayRange = (weekStart, dayIndex, openingTime = "06:00", closingTime = "06:00") => {
  const [oH, oM] = openingTime.split(":").map(Number);
  const [cH, cM] = closingTime.split(":").map(Number);
  
  const dayStart = new Date(weekStart);
  dayStart.setDate(weekStart.getDate() + dayIndex);
  dayStart.setHours(oH, oM, 0, 0);
  
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayStart.getDate() + 1);
  dayEnd.setHours(cH, cM, 0, 0);
  
  return { start: dayStart, end: dayEnd };
};

const formatDateShort = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}`;

function PenaltySettings({ companyId, violationTypes }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [penalties, setPenalties] = useState({});

  useEffect(() => { fetchSettings(); }, [companyId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/penalty-settings/${companyId}`);
      setEnabled(res.data.enabled || false);
      setPenalties(res.data.penalties || {});
    } catch { toast.error("Ceza ayarları yüklenemedi"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/penalty-settings/${companyId}`, { enabled, penalties });
      toast.success("Ceza ayarları kaydedildi");
    } catch { toast.error("Kaydetme başarısız"); }
    finally { setSaving(false); }
  };

  const updatePenalty = (type, field, value) => {
    setPenalties(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <p className="font-semibold text-sm">Ceza Sistemi</p>
          <p className="text-xs text-muted-foreground">İhlallere otomatik ceza uygulanır</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="penalty-system-toggle" />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">İhlal Türleri</p>
        {Object.entries(violationTypes).map(([type, label]) => {
          const config = penalties[type] || { enabled: false, amount: 0 };
          const Icon = VIOLATION_ICONS[type] || AlertTriangle;
          return (
            <div key={type} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border rounded-lg">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 flex-shrink-0">
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium truncate">{label}</p>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <Input type="number" min="0" step="0.5" value={config.amount || ""} onChange={(e) => updatePenalty(type, "amount", parseFloat(e.target.value) || 0)} placeholder="0" className="w-16 sm:w-20 h-7 sm:h-8 text-xs sm:text-sm text-center" disabled={!enabled} />
                <span className="text-[10px] sm:text-xs text-muted-foreground">TL</span>
                <Switch checked={config.enabled || false} onCheckedChange={(val) => updatePenalty(type, "enabled", val)} disabled={!enabled} />
              </div>
            </div>
          );
        })}
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Kaydediliyor..." : "Kaydet"}</Button>
    </div>
  );
}

export default function VardiyaIhlalleriSection({ companyId, isSuperAdmin }) {
  const [mainView, setMainView] = useState("list");
  const [activeTab, setActiveTab] = useState("courier");
  const [violations, setViolations] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [selectedViolationType, setSelectedViolationType] = useState("");
  const [violationTypes, setViolationTypes] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("06:00");
  const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()));

  // Fetch company work hours
  useEffect(() => {
    if (!companyId) return;
    axios.get(`${API}/companies/${companyId}/work-hours`).then(res => {
      setOpeningTime(res.data.opening_time || "06:00");
      setClosingTime(res.data.closing_time || "06:00");
    }).catch(() => {});
  }, [companyId]);

  const activeRange = selectedDay !== null
    ? getDayRange(weekMonday, selectedDay, openingTime, closingTime)
    : getWeekRange(weekMonday, openingTime, closingTime);

  const goToPreviousWeek = () => {
    const prev = new Date(weekMonday);
    prev.setDate(prev.getDate() - 7);
    setWeekMonday(prev);
    setSelectedDay(null);
  };
  const goToNextWeek = () => {
    const next = new Date(weekMonday);
    next.setDate(next.getDate() + 7);
    setWeekMonday(next);
    setSelectedDay(null);
  };
  const goToCurrentWeek = () => {
    setWeekMonday(getMonday(new Date()));
    setSelectedDay(null);
  };

  const isCurrentWeek = getMonday(new Date()).toDateString() === weekMonday.toDateString();

  const weekLabel = (() => {
    const nextMonday = new Date(weekMonday);
    nextMonday.setDate(weekMonday.getDate() + 7);
    return `${formatDateShort(weekMonday)} - ${formatDateShort(nextMonday)}`;
  })();

  const fetchEntities = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/shift-violations/${companyId}/entities`, { params: { entity_type: activeTab } });
      setEntities([...res.data].sort((a, b) => (a.entity_name || "").localeCompare(b.entity_name || "", 'tr')));
    } catch {}
  }, [companyId, activeTab]);

  const startISO = activeRange.start.toISOString();
  const endISO = activeRange.end.toISOString();

  const fetchViolations = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { entity_type: activeTab, limit: 500, start_date: startISO, end_date: endISO };
      if (selectedEntity) params.entity_id = selectedEntity;
      const res = await axios.get(`${API}/shift-violations/${companyId}`, { params });
      setViolations(res.data.violations);
      const summaryRes = await axios.get(`${API}/shift-violations/${companyId}/summary`);
      setViolationTypes(summaryRes.data.violation_types || {});
    } catch { toast.error("İhlaller yüklenemedi"); }
    finally { setLoading(false); }
  }, [companyId, activeTab, selectedEntity, startISO, endISO]);

  useEffect(() => {
    if (mainView === "list") { fetchEntities(); fetchViolations(); }
  }, [mainView, fetchEntities, fetchViolations]);

  const handleDeleteViolation = (id) => { setPendingDeleteId(id); setConfirmOpen(true); };
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try { await axios.delete(`${API}/shift-violations/${companyId}/${pendingDeleteId}`); toast.success("İhlal silindi"); fetchViolations(); fetchEntities(); } catch { toast.error("Silme başarısız"); }
    finally { setConfirmOpen(false); setPendingDeleteId(null); }
  };

  const handleClearAll = async () => {
    if (!confirm(`Tüm ${activeTab === 'courier' ? 'kurye' : 'yönetici'} ihlallerini silmek istediğinize emin misiniz?`)) return;
    try { await axios.delete(`${API}/shift-violations/${companyId}/clear-all`, { params: { entity_type: activeTab } }); toast.success("Tüm ihlaller silindi"); fetchViolations(); fetchEntities(); } catch { toast.error("Silme başarısız"); }
  };

  const filteredViolations = violations.filter(v => !selectedViolationType || v.violation_type === selectedViolationType);

  return (
    <div className="border-2 border-border bg-white dark:bg-slate-900 rounded-lg overflow-hidden" data-testid="violations-section">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-700 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-slate-800 dark:text-slate-200" />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-sm sm:text-base truncate">{mainView === "list" ? "Vardiya İhlalleri" : "Ceza Ayarları"}</h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{mainView === "list" ? "İhlal kayıtları" : "Ceza tanımları"}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMainView(mainView === "list" ? "penalty_settings" : "list")} className="h-7 sm:h-8 text-[10px] sm:text-xs flex-shrink-0" data-testid="toggle-penalty-settings-btn">
          {mainView === "list" ? <><Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" /> Ceza</> : <><AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" /> İhlaller</>}
        </Button>
      </div>

      <div className="p-3 sm:p-4 space-y-3">

      {mainView === "penalty_settings" ? (
        <PenaltySettings companyId={companyId} violationTypes={violationTypes} />
      ) : (
        <>
          {/* Hafta Secici */}
          <div className="flex items-center justify-between gap-1 py-1.5 px-1 bg-slate-50 rounded-lg">
            <button onClick={goToPreviousWeek} className="p-1 sm:p-1.5 hover:bg-slate-200 rounded-lg flex-shrink-0" data-testid="week-prev-btn">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
              <span className="font-semibold text-[11px] sm:text-sm whitespace-nowrap">{weekLabel}</span>
              {!isCurrentWeek && (
                <button onClick={goToCurrentWeek} className="text-[10px] sm:text-xs text-primary hover:underline ml-1 flex-shrink-0" data-testid="week-current-btn">Bu Hafta</button>
              )}
            </div>
            <button onClick={goToNextWeek} className="p-1 sm:p-1.5 hover:bg-slate-200 rounded-lg flex-shrink-0" data-testid="week-next-btn">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Gun Secici */}
          <div className="flex gap-1" data-testid="day-selector">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setSelectedDay(selectedDay === i ? null : i)}
                className={`flex-1 py-1.5 rounded-md text-[10px] sm:text-xs font-semibold transition-colors ${
                  selectedDay === i
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                data-testid={`day-btn-${i}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Kurye/Yonetici Tabs */}
          <div className="flex gap-1.5">
            <button onClick={() => { setActiveTab("courier"); setSelectedEntity(""); setSelectedViolationType(""); }} className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg font-semibold text-[11px] sm:text-sm transition-colors ${activeTab === "courier" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} data-testid="tab-courier">
              <Users className="w-3.5 h-3.5" /> Kuryeler
            </button>
            <button onClick={() => { setActiveTab("admin"); setSelectedEntity(""); setSelectedViolationType(""); }} className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-1.5 rounded-lg font-semibold text-[11px] sm:text-sm transition-colors ${activeTab === "admin" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} data-testid="tab-admin">
              <Briefcase className="w-3.5 h-3.5" /> Yöneticiler
            </button>
          </div>

          {/* Filtreler */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
              <select value={selectedEntity} onChange={(e) => setSelectedEntity(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm border border-slate-200 rounded px-2 bg-white w-full sm:flex-1" data-testid="filter-entity">
                <option value="">Tüm {activeTab === "courier" ? "Kuryeler" : "Yöneticiler"}</option>
                {entities.map(e => <option key={e.entity_id} value={e.entity_id}>{e.entity_name} ({e.violation_count})</option>)}
              </select>
              <select value={selectedViolationType} onChange={(e) => setSelectedViolationType(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm border border-slate-200 rounded px-2 bg-white w-full sm:flex-1" data-testid="filter-type">
                <option value="">Tüm Türler</option>
                {Object.entries(violationTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => { fetchViolations(); fetchEntities(); }} className="h-8 sm:h-9 flex-1 sm:flex-none" data-testid="refresh-btn">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
              {isSuperAdmin && violations.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleClearAll} className="h-8 sm:h-9 text-red-600 border-red-200 hover:bg-red-50 text-[10px] sm:text-xs flex-1 sm:flex-none" data-testid="clear-all-btn">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Sil
                </Button>
              )}
            </div>
          </div>

          {/* Ihlal Listesi */}
          <div className="border rounded-lg max-h-[400px] sm:max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>
            ) : filteredViolations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <AlertTriangle className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs sm:text-sm">{selectedEntity || selectedViolationType ? "Bu filtre için ihlal kaydı yok" : `${activeTab === "courier" ? "Kurye" : "Yönetici"} ihlal kaydı yok`}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredViolations.map((v) => {
                  const Icon = VIOLATION_ICONS[v.violation_type] || AlertTriangle;
                  return (
                    <div key={v.id} className="p-2 sm:p-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-600">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs sm:text-sm truncate">{v.entity_name}</p>
                            <p className="text-[10px] sm:text-xs font-medium text-slate-600 truncate">
                              {v.violation_label || violationTypes[v.violation_type] || v.violation_type}
                              {v.details?.late_minutes > 0 && <span className="ml-1 text-slate-500">({v.details.late_minutes} dk gec)</span>}
                            </p>
                            {v.details?.shift_time && <p className="text-[10px] text-muted-foreground">Vardiya: {v.details.shift_time}</p>}
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-[10px] text-muted-foreground">{formatDateTimeWithDay(v.created_at)}</p>
                              {v.is_exempt ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                  MUAFİYETLİ{v.exempt_reason_label ? ` (${v.exempt_reason_label})` : ''}
                                </span>
                              ) : v.penalty_amount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  <BadgeDollarSign className="w-2.5 h-2.5" />{v.penalty_amount} TL
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {isSuperAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteViolation(v.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0" data-testid={`delete-violation-${v.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal open={confirmOpen} onOpenChange={setConfirmOpen} title="İhlal Kaydını Sil" description="Bu ihlal kaydını silmek istediğinize emin misiniz?" onConfirm={confirmDelete} variant="danger" />
      </div>
    </div>
  );
}
