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

const DAY_NAMES = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const formatDateTimeWithDay = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const dayName = DAY_NAMES[d.getDay()];
  const dateFormatted = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeFormatted = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${dateFormatted} ${dayName} ${timeFormatted}`;
};

const getWeekRange = (date) => {
  const d = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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

// ========== Ceza Ayarları Bileşeni ==========
function PenaltySettings({ companyId, violationTypes }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [penalties, setPenalties] = useState({});

  useEffect(() => {
    fetchSettings();
  }, [companyId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/penalty-settings/${companyId}`);
      setEnabled(res.data.enabled || false);
      setPenalties(res.data.penalties || {});
    } catch {
      toast.error("Ceza ayarları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/penalty-settings/${companyId}`, { enabled, penalties });
      toast.success("Ceza ayarları kaydedildi");
    } catch {
      toast.error("Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const updatePenalty = (type, field, value) => {
    setPenalties(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value }
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ana toggle */}
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div>
          <p className="font-semibold text-sm">Ceza Sistemi</p>
          <p className="text-xs text-muted-foreground">
            İhlallere otomatik ceza uygulanır ve bakiyeye eklenir
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          data-testid="penalty-system-toggle"
        />
      </div>

      {/* İhlal türü bazlı ayarlar */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">İhlal Türleri</p>
        {Object.entries(violationTypes).map(([type, label]) => {
          const config = penalties[type] || { enabled: false, amount: 0 };
          const Icon = VIOLATION_ICONS[type] || AlertTriangle;
          return (
            <div key={type} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 flex-shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={config.amount || ""}
                  onChange={(e) => updatePenalty(type, "amount", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-20 h-8 text-sm text-center"
                  disabled={!enabled}
                  data-testid={`penalty-amount-${type}`}
                />
                <span className="text-xs text-muted-foreground">TL</span>
                <Switch
                  checked={config.enabled || false}
                  onCheckedChange={(val) => updatePenalty(type, "enabled", val)}
                  disabled={!enabled}
                  data-testid={`penalty-toggle-${type}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        data-testid="save-penalty-settings-btn"
      >
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </Button>
    </div>
  );
}

// ========== Ana Modal ==========
export default function VardiyaIhlalleriModal({ open, onOpenChange, companyId, isSuperAdmin }) {
  const [mainView, setMainView] = useState("list"); // "list" or "penalty_settings"
  const [activeTab, setActiveTab] = useState("courier");
  const [violations, setViolations] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [selectedViolationType, setSelectedViolationType] = useState("");
  const [violationTypes, setViolationTypes] = useState({});
  
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekRange(new Date()));
  
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
      const sorted = [...res.data].sort((a, b) => 
        (a.entity_name || "").localeCompare(b.entity_name || "", 'tr')
      );
      setEntities(sorted);
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
      if (selectedEntity) params.entity_id = selectedEntity;
      
      const res = await axios.get(`${API}/shift-violations/${companyId}`, { params });
      setViolations(res.data.violations);
      
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
    if (open && mainView === "list") {
      fetchEntities();
      fetchViolations();
    }
  }, [open, mainView, fetchEntities, fetchViolations]);

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
    } catch {
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
    } catch {
      toast.error("Silme başarısız");
    }
  };

  const filteredViolations = violations.filter(v => !selectedViolationType || v.violation_type === selectedViolationType);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-slate-500" />
                {mainView === "list" ? "Vardiya İhlalleri Geçmişi" : "Ceza Ayarları"}
              </DialogTitle>
              {/* Ceza Ayarları butonu tüm adminler tarafından görülebilir */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMainView(mainView === "list" ? "penalty_settings" : "list")}
                className="h-8 text-xs"
                data-testid="toggle-penalty-settings-btn"
              >
                {mainView === "list" ? (
                  <><Settings className="w-3.5 h-3.5 mr-1" /> Ceza Ayarları</>
                ) : (
                  <><AlertTriangle className="w-3.5 h-3.5 mr-1" /> İhlaller</>
                )}
              </Button>
            </div>
          </DialogHeader>

          {mainView === "penalty_settings" ? (
            <div className="flex-1 overflow-y-auto">
              <PenaltySettings companyId={companyId} violationTypes={violationTypes} />
            </div>
          ) : (
            <>
              {/* Hafta Seçici */}
              <div className="flex items-center justify-between gap-2 py-2 px-1 bg-slate-50 rounded-lg">
                <button onClick={goToPreviousWeek} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
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
                      <button onClick={goToCurrentWeek} className="text-xs text-primary hover:underline ml-2">
                        Bu Hafta
                      </button>
                    );
                  })()}
                </div>
                <button onClick={goToNextWeek} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button
                  onClick={() => { setActiveTab("courier"); setSelectedEntity(""); setSelectedViolationType(""); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${
                    activeTab === "courier" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Users className="w-4 h-4" /> Kuryeler
                </button>
                <button
                  onClick={() => { setActiveTab("admin"); setSelectedEntity(""); setSelectedViolationType(""); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-semibold text-sm transition-colors ${
                    activeTab === "admin" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Briefcase className="w-4 h-4" /> Yöneticiler
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
                  <option value="">Tüm {activeTab === "courier" ? "Kuryeler" : "Yöneticiler"}</option>
                  {entities.map(e => (
                    <option key={e.entity_id} value={e.entity_id}>
                      {e.entity_name} ({e.violation_count} ihlal)
                    </option>
                  ))}
                </select>
                <select
                  value={selectedViolationType}
                  onChange={(e) => setSelectedViolationType(e.target.value)}
                  className="flex-1 h-9 text-sm border border-slate-200 rounded px-2 bg-white"
                >
                  <option value="">Tüm İhlal Türleri</option>
                  {Object.entries(violationTypes).map(([type, label]) => (
                    <option key={type} value={type}>{label}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={() => { fetchViolations(); fetchEntities(); }} className="h-9">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                {isSuperAdmin && violations.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleClearAll} className="h-9 text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="w-4 h-4 mr-1" /> Tümünü Sil
                  </Button>
                )}
              </div>

              {/* Violations List */}
              <div className="flex-1 overflow-y-auto border rounded-lg">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : filteredViolations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <AlertTriangle className="w-12 h-12 mb-2 opacity-30" />
                    <p className="text-sm">
                      {selectedEntity || selectedViolationType
                        ? "Bu filtre için ihlal kaydı yok" 
                        : `${activeTab === "courier" ? "Kurye" : "Yönetici"} ihlal kaydı yok`
                      }
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredViolations.map((v) => {
                      const Icon = VIOLATION_ICONS[v.violation_type] || AlertTriangle;
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
                                    <span className="ml-1 text-slate-500">({v.details.late_minutes} dk geç)</span>
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
                                  <p className="text-xs text-muted-foreground">Vardiya: {v.details.shift_time}</p>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-xs text-muted-foreground">
                                    {formatDateTimeWithDay(v.created_at)}
                                  </p>
                                  {v.penalty_amount > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                      <BadgeDollarSign className="w-3 h-3" />
                                      {v.penalty_amount} TL
                                    </span>
                                  )}
                                </div>
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
            </>
          )}
        </DialogContent>
      </Dialog>

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
