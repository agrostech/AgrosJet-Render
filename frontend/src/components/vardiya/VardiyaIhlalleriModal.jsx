import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  AlertTriangle, Users, Briefcase, Filter, Trash2, 
  Clock, UserX, UserCheck, Coffee, RefreshCw, LogOut,
  ChevronLeft, ChevronRight, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const VIOLATION_ICONS = {
  "shift_started_not_active": UserX,
  "active_without_shift": UserCheck,
  "offline_before_shift_end": Clock,
  "still_active_after_shift_end": LogOut,
  "break_limit_exceeded": Coffee
};

const VIOLATION_COLORS = {
  "shift_started_not_active": "text-slate-700 bg-slate-100",
  "active_without_shift": "text-slate-700 bg-slate-100",
  "offline_before_shift_end": "text-slate-700 bg-slate-100",
  "still_active_after_shift_end": "text-slate-700 bg-slate-100",
  "break_limit_exceeded": "text-slate-700 bg-slate-100"
};

const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const formatDateTimeWithDay = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const dateFormatted = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${dateFormatted} ${dayName} ${timeFormatted}`;
};

// Haftanın başlangıç ve bitiş tarihlerini hesapla (Pazartesi - Pazar)
const getWeekRange = (date) => {
  // Türkiye saatine göre hesapla
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Pazartesi'ye ayarla
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
};

const formatWeekLabel = (start, end) => {
  const formatDate = (d) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };
  return `${formatDate(start)} - ${formatDate(end)}`;
};

export default function VardiyaIhlalleriModal({ open, onOpenChange, companyId, isSuperAdmin }) {
  const [activeTab, setActiveTab] = useState("courier"); // "courier" or "admin"
  const [violations, setViolations] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [violationTypes, setViolationTypes] = useState({});
  
  // Hafta seçici
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekRange(new Date()));
  
  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const goToPreviousWeek = () => {
    const newStart = new Date(selectedWeek.start);
    newStart.setDate(newStart.getDate() - 7);
    setSelectedWeek(getWeekRange(newStart));
  };

  const goToNextWeek = () => {
    const newStart = new Date(selectedWeek.start);
    newStart.setDate(newStart.getDate() + 7);
    setSelectedWeek(getWeekRange(newStart));
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(getWeekRange(new Date()));
  };

  const fetchEntities = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/shift-violations/${companyId}/entities`, {
        params: { entity_type: activeTab }
      });
      setEntities(res.data);
    } catch (err) {
      console.error("Entityler yüklenemedi:", err);
    }
  }, [companyId, activeTab]);

  const fetchViolations = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { 
        entity_type: activeTab,
        limit: 500,
        start_date: selectedWeek.start.toISOString(),
        end_date: selectedWeek.end.toISOString()
      };
      if (selectedEntity) {
        params.entity_id = selectedEntity;
      }
      
      const res = await axios.get(`${API}/shift-violations/${companyId}`, { params });
      setViolations(res.data.violations);
      
      // Also fetch violation types for labels
      const summaryRes = await axios.get(`${API}/shift-violations/${companyId}/summary`);
      setViolationTypes(summaryRes.data.violation_types || {});
    } catch (err) {
      console.error("İhlaller yüklenemedi:", err);
      toast.error("İhlaller yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, activeTab, selectedEntity, selectedWeek]);

  useEffect(() => {
    if (open) {
      fetchEntities();
      fetchViolations();
    }
  }, [open, fetchEntities, fetchViolations]);

  const handleDeleteViolation = (violationId) => {
    setPendingDeleteId(violationId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await axios.delete(`${API}/shift-violations/${companyId}/${pendingDeleteId}`);
      toast.success("İhlal kaydı silindi");
      fetchViolations();
      fetchEntities();
    } catch (err) {
      toast.error("Silme başarısız");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`Tüm ${activeTab === 'courier' ? 'kurye' : 'yönetici'} ihlallerini silmek istediğinize emin misiniz?`)) return;
    try {
      await axios.delete(`${API}/shift-violations/${companyId}/clear-all`, {
        params: { entity_type: activeTab }
      });
      toast.success("Tüm ihlaller silindi");
      fetchViolations();
      fetchEntities();
    } catch (err) {
      toast.error("Silme başarısız");
    }
  };

  const getViolationIcon = (type) => {
    const Icon = VIOLATION_ICONS[type] || AlertTriangle;
    return Icon;
  };

  const getViolationColor = (type) => {
    return VIOLATION_COLORS[type] || "text-slate-600 bg-slate-50";
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-slate-500" />
              Vardiya İhlalleri Geçmişi
            </DialogTitle>
          </DialogHeader>

          {/* Hafta Seçici */}
          <div className="flex items-center justify-between gap-2 py-2 px-1 bg-slate-50 rounded-lg">
            <button
              onClick={goToPreviousWeek}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
            
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-sm">
                {formatWeekLabel(selectedWeek.start, selectedWeek.end)}
              </span>
              {(() => {
                const currentWeek = getWeekRange(new Date());
                const isSameWeek = currentWeek.start.toDateString() === selectedWeek.start.toDateString();
                return !isSameWeek && (
                  <button
                    onClick={goToCurrentWeek}
                    className="text-xs text-primary hover:underline ml-2"
                  >
                    Bu Hafta
                  </button>
                );
              })()}
            </div>
            
            <button
              onClick={goToNextWeek}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
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
            >
              <option value="">
                Tüm {activeTab === "courier" ? "Kuryeler" : "Yöneticiler"}
              </option>
              {entities.map(e => (
                <option key={e.entity_id} value={e.entity_id}>
                  {e.entity_name} ({e.violation_count} ihlal)
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { fetchViolations(); fetchEntities(); }}
              className="h-9"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            {isSuperAdmin && violations.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearAll}
                className="h-9 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Tümünü Sil
              </Button>
            )}
          </div>

          {/* Violations List */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <AlertTriangle className="w-12 h-12 mb-2 opacity-30" />
                <p className="text-sm">
                  {selectedEntity 
                    ? "Bu kişi için ihlal kaydı yok" 
                    : `${activeTab === "courier" ? "Kurye" : "Yönetici"} ihlal kaydı yok`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {violations.map((v) => {
                  const Icon = getViolationIcon(v.violation_type);
                  const colorClass = getViolationColor(v.violation_type);
                  
                  return (
                    <div key={v.id} className="p-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-600">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{v.entity_name}</p>
                            <p className="text-xs font-medium text-slate-600">
                              {v.violation_label || violationTypes[v.violation_type] || v.violation_type}
                              {v.details?.late_minutes > 0 && (
                                <span className="ml-1 text-slate-500">
                                  ({v.details.late_minutes} dk geç)
                                </span>
                              )}
                            </p>
                            {v.details?.activated_at && v.details?.activated_after_shift && (
                              <p className="text-xs text-muted-foreground">
                                Aktif olduğu saat: {v.details.activated_at} → Kapanış: {v.details.deactivated_at}
                              </p>
                            )}
                            {v.details?.shift_end_time && !v.details?.activated_after_shift && (
                              <p className="text-xs text-muted-foreground">
                                Vardiya bitişi: {v.details.shift_end_time} → Kapanış: {v.details.deactivated_at}
                              </p>
                            )}
                            {v.details?.shift_time && (
                              <p className="text-xs text-muted-foreground">
                                Vardiya: {v.details.shift_time}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDateTimeWithDay(v.created_at)}
                            </p>
                          </div>
                        </div>
                        {isSuperAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteViolation(v.id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="pt-3 border-t border-slate-200">
            <p className="text-xs text-muted-foreground mb-2">İhlal Türleri:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(VIOLATION_ICONS).map(([type, Icon]) => (
                <div 
                  key={type} 
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-100 text-slate-600"
                >
                  <Icon className="w-3 h-3" />
                  <span>{violationTypes[type] || type}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="İhlal Kaydını Sil"
        description="Bu ihlal kaydını silmek istediğinize emin misiniz?"
        onConfirm={confirmDelete}
        variant="danger"
      />
    </>
  );
}
