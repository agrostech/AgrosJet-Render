import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Store, Building2, Phone, MapPin, Clock,
  RefreshCw, Bike, FileText,
  Calendar, Package, Loader2, Search, AlertCircle
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DEFAULT_STATUSES = [
  { value: "new", label: "Yeni", color: "#3b82f6" },
  { value: "pending", label: "Beklemede", color: "#f59e0b" },
  { value: "positive", label: "Olumlu", color: "#10b981" },
  { value: "negative", label: "Olumsuz", color: "#ef4444" }
];

const TAB_CONFIG = [
  { key: "courier", label: "Kurye", icon: Users },
  { key: "restaurant", label: "Restoran", icon: Store },
  { key: "company", label: "Şirket", icon: Building2 }
];

function StatusBadge({ status, statuses }) {
  const s = statuses.find(st => st.value === status) || { label: status, color: "#94a3b8" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ backgroundColor: s.color + "1a", color: s.color, border: `1.5px solid ${s.color}40` }}
      data-testid={`status-badge-${status}`}
    >
      {s.label}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return dateStr; }
}

function formatPhone(phone) {
  if (!phone) return "-";
  const p = phone.replace(/\D/g, "");
  if (p.length === 10) return `0${p.slice(0,3)} ${p.slice(3,6)} ${p.slice(6)}`;
  if (p.length === 11) return `${p.slice(0,4)} ${p.slice(4,7)} ${p.slice(7)}`;
  return phone;
}

function CourierCard({ app, statuses, onStatusClick }) {
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3.5 hover:shadow-sm transition-shadow" data-testid={`courier-card-${app.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{app.full_name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 flex-shrink-0" />{formatPhone(app.phone)}
          </p>
        </div>
        <StatusBadge status={app.status} statuses={statuses} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
        {app.province && (
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{app.province}{app.district ? ` / ${app.district}` : ""}</span>
        )}
        {app.has_motorcycle !== undefined && (
          <span className="flex items-center gap-1"><Bike className="w-3 h-3" />{app.has_motorcycle ? `${app.motorcycle_brand || ""} ${app.motorcycle_model || ""}`.trim() || "Var" : "Yok"}</span>
        )}
        {app.experience && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{app.experience}</span>
        )}
        {app.daily_hours && (
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{app.daily_hours} saat</span>
        )}
      </div>
      {app.description && (
        <p className="text-xs text-muted-foreground mt-2 bg-slate-50 dark:bg-slate-700/50 rounded p-2 line-clamp-2">{app.description}</p>
      )}
      <div className="flex items-center justify-between mt-3 pt-2 border-t dark:border-slate-700">
        <span className="text-[10px] text-muted-foreground">{formatDate(app.created_at)}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs font-semibold border-2" onClick={() => onStatusClick(app)} data-testid={`status-update-btn-${app.id}`}>
          Durum Güncelle
        </Button>
      </div>
    </div>
  );
}

function RestaurantCard({ app, statuses, onStatusClick }) {
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3.5 hover:shadow-sm transition-shadow" data-testid={`restaurant-card-${app.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{app.restaurant_name || app.full_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{app.contact_name}</p>
        </div>
        <StatusBadge status={app.status} statuses={statuses} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(app.phone)}</span>
        {app.province && (
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{app.province}{app.district ? ` / ${app.district}` : ""}</span>
        )}
        {app.package_count && (
          <span className="flex items-center gap-1"><Package className="w-3 h-3" />{app.package_count} paket/gün</span>
        )}
      </div>
      {app.address && (
        <p className="text-xs text-muted-foreground mt-2 bg-slate-50 dark:bg-slate-700/50 rounded p-2 line-clamp-2">{app.address}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {app.has_courier !== undefined && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${app.has_courier ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
            {app.has_courier ? "Kurye Var" : "Kurye Yok"}
          </span>
        )}
        {app.visit_date && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-semibold">
            Ziyaret: {app.visit_date} {app.visit_time_slot || ""}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t dark:border-slate-700">
        <span className="text-[10px] text-muted-foreground">{formatDate(app.created_at)}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs font-semibold border-2" onClick={() => onStatusClick(app)} data-testid={`status-update-btn-${app.id}`}>
          Durum Güncelle
        </Button>
      </div>
    </div>
  );
}

function CompanyCard({ app, statuses, onStatusClick }) {
  return (
    <div className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-3.5 hover:shadow-sm transition-shadow" data-testid={`company-card-${app.id}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">{app.full_name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 flex-shrink-0" />{formatPhone(app.phone)}
          </p>
        </div>
        <StatusBadge status={app.status} statuses={statuses} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
        {app.province && (
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{app.province}{app.district ? ` / ${app.district}` : ""}</span>
        )}
        {app.application_type && (
          <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{app.application_type}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {app.has_active_company !== undefined && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${app.has_active_company ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>
            {app.has_active_company ? "Aktif Şirketi Var" : "Aktif Şirketi Yok"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t dark:border-slate-700">
        <span className="text-[10px] text-muted-foreground">{formatDate(app.created_at)}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs font-semibold border-2" onClick={() => onStatusClick(app)} data-testid={`status-update-btn-${app.id}`}>
          Durum Güncelle
        </Button>
      </div>
    </div>
  );
}

function StatusHistory({ history }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Durum Geçmişi</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {[...history].reverse().map((h, i) => (
          <div key={i} className="flex items-start gap-2 text-xs bg-slate-50 dark:bg-slate-700/50 rounded p-2">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold">{h.status}</span>
              {h.note && <span className="text-muted-foreground ml-1">- {h.note}</span>}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {h.admin}{h.source === "agrosjet_app" ? " (AgrosJet.app)" : ""} · {formatDate(h.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusUpdateModal({ open, onOpenChange, application, statuses, appType, adminName, onSuccess }) {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && application) {
      setSelectedStatus(application.status || "");
      setNote("");
    }
  }, [open, application]);

  const handleSave = async () => {
    if (!selectedStatus) { toast.error("Durum seçin"); return; }
    if (!note.trim()) { toast.error("Not yazın"); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/applications/${appType}/${application.id}/status`, {
        status: selectedStatus,
        note: note.trim(),
        admin_name: adminName
      });
      toast.success("Durum güncellendi");
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Durum Güncelle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            <p className="font-semibold text-sm">{application.restaurant_name || application.full_name}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(application.phone)}</p>
          </div>

          <div>
            <Label className="text-sm font-semibold">Yeni Durum</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statuses.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSelectedStatus(s.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                    selectedStatus === s.value
                      ? "ring-2 ring-offset-1"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: selectedStatus === s.value ? s.color + "20" : "transparent",
                    borderColor: s.color,
                    color: s.color
                  }}
                  data-testid={`status-option-${s.value}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">Not</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Durum değişiklik notunu yazın..."
              className="mt-1 border-2 text-sm"
              rows={3}
              data-testid="status-note-input"
            />
          </div>

          <StatusHistory history={application.status_history} />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-2 font-semibold">
            İptal
          </Button>
          <Button onClick={handleSave} disabled={saving || !selectedStatus || !note.trim()} className="font-semibold" data-testid="status-save-btn">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function BasvurularPage({ companyId, adminName }) {
  const [activeTab, setActiveTab] = useState("courier");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statuses, setStatuses] = useState({
    courier: DEFAULT_STATUSES,
    restaurant: DEFAULT_STATUSES,
    company: DEFAULT_STATUSES
  });
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [connectionOk, setConnectionOk] = useState(null);

  const fetchStatuses = useCallback(async (type) => {
    try {
      const res = await axios.get(`${API}/applications/statuses/${type}`);
      if (res.data.statuses && res.data.statuses.length > 0) {
        setStatuses(prev => ({ ...prev, [type]: res.data.statuses }));
      }
    } catch {
      // Varsayılan durumlar kullanılır
    }
  }, []);

  const fetchApplications = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: "200", offset: "0" });
      if (statusFilter) params.append("status", statusFilter);
      const res = await axios.get(`${API}/applications/${activeTab}?${params}`);
      setApplications(res.data.data || []);
      setTotal(res.data.total || 0);
      setConnectionOk(true);
    } catch (err) {
      const detail = err.response?.data?.detail || "";
      if (detail.includes("yapılandırma") || detail.includes("yapilandirma")) {
        setConnectionOk(false);
      }
      toast.error(detail || "Başvurular yüklenemedi");
      setApplications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, statusFilter]);

  useEffect(() => {
    fetchApplications();
    fetchStatuses(activeTab);
  }, [activeTab, statusFilter, fetchApplications, fetchStatuses]);

  const filtered = applications.filter(app => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = (app.full_name || app.restaurant_name || "").toLowerCase();
    const phone = (app.phone || "").toLowerCase();
    const province = (app.province || "").toLowerCase();
    return name.includes(term) || phone.includes(term) || province.includes(term);
  });

  const handleStatusClick = (app) => {
    setSelectedApp(app);
    setShowStatusModal(true);
  };

  const currentStatuses = statuses[activeTab] || DEFAULT_STATUSES;

  if (connectionOk === false) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-orange-500" />
        </div>
        <h2 className="text-lg font-bold mb-2">AgrosJet Bağlantısı Yapılandırılmamış</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Başvuruları görüntüleyebilmek için Sistem Yönetimi &gt; Ayarlar &gt; AgrosJet kartından API anahtarını yapılandırın.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="basvurular-page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl sm:text-2xl font-bold">Başvurular</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">AgrosJet.com başvuru yönetimi</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchApplications(false)}
          disabled={refreshing}
          className="border-2 font-semibold"
          data-testid="refresh-applications-btn"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Yenile</span>
        </Button>
      </div>

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg" data-testid="app-type-tabs">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setStatusFilter(""); setSearchTerm(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs sm:text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? "bg-white dark:bg-slate-700 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Ad, telefon veya il ara..."
            className="pl-9 border-2 text-sm"
            data-testid="search-applications-input"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setStatusFilter("")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-2 transition-all ${
              !statusFilter ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100" : "border-slate-300 dark:border-slate-600 text-muted-foreground hover:border-slate-400"
            }`}
            data-testid="filter-all"
          >
            Tümü ({total})
          </button>
          {currentStatuses.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-2 transition-all ${
                statusFilter === s.value
                  ? ""
                  : "opacity-60 hover:opacity-100"
              }`}
              style={{
                borderColor: s.color,
                backgroundColor: statusFilter === s.value ? s.color + "20" : "transparent",
                color: s.color
              }}
              data-testid={`filter-${s.value}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            {searchTerm ? "Aramayla eşleşen başvuru bulunamadı" : "Henüz başvuru yok"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="applications-grid">
          {filtered.map(app => {
            if (activeTab === "courier") return <CourierCard key={app.id} app={app} statuses={currentStatuses} onStatusClick={handleStatusClick} />;
            if (activeTab === "restaurant") return <RestaurantCard key={app.id} app={app} statuses={currentStatuses} onStatusClick={handleStatusClick} />;
            return <CompanyCard key={app.id} app={app} statuses={currentStatuses} onStatusClick={handleStatusClick} />;
          })}
        </div>
      )}

      <StatusUpdateModal
        open={showStatusModal}
        onOpenChange={setShowStatusModal}
        application={selectedApp}
        statuses={currentStatuses}
        appType={activeTab}
        adminName={adminName || "Admin"}
        onSuccess={() => fetchApplications(false)}
      />
    </div>
  );
}
