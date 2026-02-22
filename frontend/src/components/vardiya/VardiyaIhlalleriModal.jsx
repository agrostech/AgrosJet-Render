import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  AlertTriangle, Users, Briefcase, Filter, Trash2, 
  Clock, UserX, UserCheck, Coffee, RefreshCw, LogOut
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
  "shift_started_not_active": "text-red-600 bg-red-50",
  "active_without_shift": "text-amber-600 bg-amber-50",
  "offline_before_shift_end": "text-orange-600 bg-orange-50",
  "still_active_after_shift_end": "text-blue-600 bg-blue-50",
  "break_limit_exceeded": "text-purple-600 bg-purple-50"
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function VardiyaIhlalleriModal({ open, onOpenChange, companyId, isSuperAdmin }) {
  const [activeTab, setActiveTab] = useState("courier"); // "courier" or "admin"
  const [violations, setViolations] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [violationTypes, setViolationTypes] = useState({});
  
  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

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
        limit: 100
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
  }, [companyId, activeTab, selectedEntity]);

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
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Vardiya İhlalleri Geçmişi
            </DialogTitle>
          </DialogHeader>

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
                    <div key={v.id} className={`p-3 hover:bg-slate-50 ${colorClass.split(' ')[1]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{v.entity_name}</p>
                            <p className={`text-xs font-medium ${colorClass.split(' ')[0]}`}>
                              {v.violation_label || violationTypes[v.violation_type] || v.violation_type}
                              {v.details?.late_minutes > 0 && (
                                <span className="ml-1 text-slate-500">
                                  ({v.details.late_minutes} dk geç)
                                </span>
                              )}
                            </p>
                            {v.details?.shift_end_time && (
                              <p className="text-xs text-muted-foreground">
                                Vardiya bitişi: {v.details.shift_end_time} → Kapanış: {v.details.deactivated_at}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDateTime(v.created_at)}
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
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${getViolationColor(type)}`}
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
