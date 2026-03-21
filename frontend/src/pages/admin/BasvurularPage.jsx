import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users, Store, Building2, ChevronLeft, ChevronRight,
  RefreshCw, Loader2, Search, AlertCircle, ChevronDown, MapPin
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TAB_CONFIG = [
  { key: "courier", label: "Kurye", icon: Users },
  { key: "restaurant", label: "Restoran", icon: Store },
  { key: "company", label: "Şirket", icon: Building2 }
];

// Durum rengi al - API'den gelen veya fallback
function getStatusColor(status, statusMap) {
  if (statusMap[status]) return statusMap[status].color;
  // Fallback renkler
  const fallbacks = {
    new: "#3b82f6", pending: "#f59e0b", positive: "#10b981", negative: "#ef4444"
  };
  return fallbacks[status] || "#94a3b8";
}

function getStatusLabel(status, statusMap) {
  if (statusMap[status]) return statusMap[status].label;
  return status;
}

function StatusBadge({ status, statusMap }) {
  const color = getStatusColor(status, statusMap);
  const label = getStatusLabel(status, statusMap);
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ backgroundColor: color + "1a", color, border: `1.5px solid ${color}40` }}
    >
      {label}
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

function boolLabel(val) {
  if (val === true) return "Evet";
  if (val === false) return "Hayır";
  return "-";
}

// --- Status Dropdown ---
function StatusDropdown({ application, statusMap, allStatuses, appType, adminName, onSuccess }) {
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleStatusSelect = (statusValue) => {
    setPendingStatus(statusValue);
    setNote("");
    setShowNoteDialog(true);
  };

  const handleSave = async () => {
    if (!note.trim()) { toast.error("Not yazın"); return; }
    setSaving(true);
    try {
      await axios.patch(`${API}/applications/${appType}/${application.id}/status`, {
        status: pendingStatus,
        note: note.trim(),
        admin_name: adminName
      });
      toast.success("Durum güncellendi");
      setShowNoteDialog(false);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const color = getStatusColor(application.status, statusMap);
  const label = getStatusLabel(application.status, statusMap);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: color + "1a", color, border: `1.5px solid ${color}40` }}
            data-testid={`status-dropdown-${application.id}`}
          >
            {label}
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {allStatuses.map(s => (
            <DropdownMenuItem
              key={s.value}
              onClick={() => handleStatusSelect(s.value)}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`status-option-${s.value}`}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-sm font-medium">{s.label}</span>
              {s.value === application.status && (
                <span className="ml-auto text-[10px] text-muted-foreground">Mevcut</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Durum Notu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <span className="text-sm font-medium">{application.restaurant_name || application.full_name}</span>
              <span className="text-muted-foreground">→</span>
              <StatusBadge status={pendingStatus} statusMap={statusMap} />
            </div>
            <div>
              <Label className="text-sm font-semibold">Not</Label>
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Durum değişiklik notunu yazın..."
                className="mt-1 border-2 text-sm"
                rows={3}
                autoFocus
                data-testid="status-note-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)} className="border-2 font-semibold">İptal</Button>
            <Button onClick={handleSave} disabled={saving || !note.trim()} className="font-semibold" data-testid="status-save-btn">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Kaydediliyor...</> : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Kurye Table ---
function CourierTable({ applications, statusMap, allStatuses, adminName, onSuccess, emptyMsg }) {
  return (
    <div className="hidden md:block border-2 border-border bg-white overflow-x-auto" data-testid="applications-table">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            <TableHead className="font-bold text-xs">Ad Soyad</TableHead>
            <TableHead className="font-bold text-xs">Telefon</TableHead>
            <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
            <TableHead className="font-bold text-xs">Ehliyet</TableHead>
            <TableHead className="font-bold text-xs">Motosiklet</TableHead>
            <TableHead className="font-bold text-xs">Günlük Saat</TableHead>
            <TableHead className="font-bold text-xs">Deneyim</TableHead>
            <TableHead className="font-bold text-xs">Açıklama</TableHead>
            <TableHead className="font-bold text-xs">Tarih</TableHead>
            <TableHead className="font-bold text-xs text-right">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">{emptyMsg}</TableCell></TableRow>
          ) : applications.map(app => (
            <TableRow key={app.id} className="border-b border-border hover:bg-slate-50" data-testid={`app-row-${app.id}`}>
              <TableCell className="font-medium text-sm">{app.full_name}</TableCell>
              <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
              <TableCell className="text-sm">{app.province || "-"}{app.district ? ` / ${app.district}` : ""}</TableCell>
              <TableCell className="text-sm">{(app.license_types || []).join(", ") || "-"}</TableCell>
              <TableCell className="text-sm">
                {app.has_motorcycle
                  ? <span className="text-green-600">{`${app.motorcycle_brand || ""} ${app.motorcycle_model || ""}`.trim() || "Var"}</span>
                  : <span className="text-muted-foreground">Yok</span>}
              </TableCell>
              <TableCell className="text-sm">{app.daily_hours || "-"}</TableCell>
              <TableCell className="text-sm">{app.experience || "-"}</TableCell>
              <TableCell className="text-sm max-w-[200px] truncate" title={app.description}>{app.description || "-"}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(app.created_at)}</TableCell>
              <TableCell className="text-right">
                <StatusDropdown application={app} statusMap={statusMap} allStatuses={allStatuses} appType="courier" adminName={adminName} onSuccess={onSuccess} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Restoran Table ---
function RestaurantTable({ applications, statusMap, allStatuses, adminName, onSuccess, emptyMsg }) {
  return (
    <div className="hidden md:block border-2 border-border bg-white overflow-x-auto" data-testid="applications-table">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            <TableHead className="font-bold text-xs">Restoran Adı</TableHead>
            <TableHead className="font-bold text-xs">Yetkili</TableHead>
            <TableHead className="font-bold text-xs">Telefon</TableHead>
            <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
            <TableHead className="font-bold text-xs">Adres</TableHead>
            <TableHead className="font-bold text-xs">Paket/Gün</TableHead>
            <TableHead className="font-bold text-xs">Kuryesi</TableHead>
            <TableHead className="font-bold text-xs">Başka Servis</TableHead>
            <TableHead className="font-bold text-xs">Ziyaret</TableHead>
            <TableHead className="font-bold text-xs">Tarih</TableHead>
            <TableHead className="font-bold text-xs text-right">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">{emptyMsg}</TableCell></TableRow>
          ) : applications.map(app => (
            <TableRow key={app.id} className="border-b border-border hover:bg-slate-50" data-testid={`app-row-${app.id}`}>
              <TableCell className="font-medium text-sm">{app.restaurant_name || app.full_name}</TableCell>
              <TableCell className="text-sm">{app.contact_name || "-"}</TableCell>
              <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
              <TableCell className="text-sm">{app.province || "-"}{app.district ? ` / ${app.district}` : ""}</TableCell>
              <TableCell className="text-sm max-w-[200px] truncate" title={app.address}>{app.address || "-"}</TableCell>
              <TableCell className="text-sm">{app.package_count || "-"}</TableCell>
              <TableCell className="text-sm">{boolLabel(app.has_courier)}</TableCell>
              <TableCell className="text-sm">{boolLabel(app.uses_other_service)}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">{app.visit_date ? `${app.visit_date}${app.visit_time_slot ? ` ${app.visit_time_slot}` : ""}` : "-"}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(app.created_at)}</TableCell>
              <TableCell className="text-right">
                <StatusDropdown application={app} statusMap={statusMap} allStatuses={allStatuses} appType="restaurant" adminName={adminName} onSuccess={onSuccess} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Şirket Table ---
function CompanyTable({ applications, statusMap, allStatuses, adminName, onSuccess, emptyMsg }) {
  return (
    <div className="hidden md:block border-2 border-border bg-white overflow-x-auto" data-testid="applications-table">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            <TableHead className="font-bold text-xs">Yetkili Adı</TableHead>
            <TableHead className="font-bold text-xs">Telefon</TableHead>
            <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
            <TableHead className="font-bold text-xs">Başvuru Tipi</TableHead>
            <TableHead className="font-bold text-xs">Paket/Gün</TableHead>
            <TableHead className="font-bold text-xs">Aktif Şirket</TableHead>
            <TableHead className="font-bold text-xs">Tarih</TableHead>
            <TableHead className="font-bold text-xs text-right">Durum</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{emptyMsg}</TableCell></TableRow>
          ) : applications.map(app => (
            <TableRow key={app.id} className="border-b border-border hover:bg-slate-50" data-testid={`app-row-${app.id}`}>
              <TableCell className="font-medium text-sm">{app.full_name}</TableCell>
              <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
              <TableCell className="text-sm">{app.province || "-"}{app.district ? ` / ${app.district}` : ""}</TableCell>
              <TableCell className="text-sm">{app.application_type || "-"}</TableCell>
              <TableCell className="text-sm">{app.package_count || "-"}</TableCell>
              <TableCell className="text-sm">{boolLabel(app.has_active_company)}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(app.created_at)}</TableCell>
              <TableCell className="text-right">
                <StatusDropdown application={app} statusMap={statusMap} allStatuses={allStatuses} appType="company" adminName={adminName} onSuccess={onSuccess} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Mobile Cards ---
function ApplicationMobileCards({ applications, activeTab, statusMap, allStatuses, adminName, onSuccess, emptyMsg }) {
  if (applications.length === 0) {
    return (
      <div className="md:hidden border rounded-lg p-6 bg-white dark:bg-card text-center text-muted-foreground">
        {emptyMsg}
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-1.5">
      {applications.map((app) => (
        <div key={app.id} className="border rounded-lg px-2.5 py-2 bg-white dark:bg-card" data-testid={`app-card-${app.id}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate leading-tight">
                {activeTab === "restaurant" ? (app.restaurant_name || app.full_name) : app.full_name}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {formatPhone(app.phone)}
                {app.province ? ` · ${app.province}` : ""}
                {activeTab === "courier" && app.experience ? ` · ${app.experience}` : ""}
                {activeTab === "restaurant" && app.package_count ? ` · ${app.package_count} paket` : ""}
              </p>
            </div>
            <StatusDropdown application={app} statusMap={statusMap} allStatuses={allStatuses} appType={activeTab} adminName={adminName} onSuccess={onSuccess} />
          </div>
        </div>
      ))}
    </div>
  );
}


export default function BasvurularPage({ companyId, adminName, companyCity }) {
  const [activeTab, setActiveTab] = useState("courier");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [connectionOk, setConnectionOk] = useState(null);

  // Dinamik durum listesi - API'den veya veriden türetilir
  const [statusMap, setStatusMap] = useState({});   // { value: { label, color } }
  const [allStatuses, setAllStatuses] = useState([]); // [{ value, label, color }]

  // Tab scroll
  const tabsContainerRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkScrollArrows = () => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    checkScrollArrows();
    window.addEventListener("resize", checkScrollArrows);
    return () => window.removeEventListener("resize", checkScrollArrows);
  }, []);

  const scrollTabs = (direction) => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === "left" ? -120 : 120,
        behavior: "smooth"
      });
      setTimeout(checkScrollArrows, 300);
    }
  };

  // Durumları API'den çek
  const fetchStatuses = useCallback(async (type) => {
    try {
      const res = await axios.get(`${API}/applications/statuses/${type}`);
      const list = res.data.statuses || [];
      if (list.length > 0) {
        const map = {};
        list.forEach(s => { map[s.value] = { label: s.label, color: s.color }; });
        setStatusMap(map);
        setAllStatuses(list);
      }
    } catch {
      // Hata durumunda veri bazlı durum çıkarımı kullanılır
    }
  }, []);

  // Veriden benzersiz durumları çıkar (API boş dönerse)
  const deriveStatusesFromData = useCallback((data) => {
    // Fallback renk paleti
    const palette = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#6366f1"];
    const seen = new Map();
    let colorIdx = 0;

    data.forEach(app => {
      if (app.status && !seen.has(app.status)) {
        seen.set(app.status, {
          value: app.status,
          label: app.status.charAt(0).toUpperCase() + app.status.slice(1),
          color: palette[colorIdx % palette.length]
        });
        colorIdx++;
      }
    });

    return Array.from(seen.values());
  }, []);

  const fetchApplications = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: "500", offset: "0" });
      if (statusFilter) params.append("status", statusFilter);
      const res = await axios.get(`${API}/applications/${activeTab}?${params}`);
      let data = res.data.data || [];

      // Şirketin iline göre filtrele
      if (companyCity) {
        data = data.filter(app => {
          const appProvince = (app.province || "").toLowerCase().trim();
          const cityLower = companyCity.toLowerCase().trim();
          return appProvince === cityLower;
        });
      }

      setApplications(data);
      setTotal(data.length);
      setConnectionOk(true);

      // Eğer API'den durum gelmemişse, veriden çıkar
      if (allStatuses.length === 0 && !statusFilter) {
        // Filtreli sorguda tüm veriye ulaşamayız, sadece filtresizde çıkar
        const allData = res.data.data || [];
        const derived = deriveStatusesFromData(allData);
        if (derived.length > 0) {
          const map = {};
          derived.forEach(s => { map[s.value] = { label: s.label, color: s.color }; });
          setStatusMap(map);
          setAllStatuses(derived);
        }
      }
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
  }, [activeTab, statusFilter, companyCity, allStatuses.length, deriveStatusesFromData]);

  useEffect(() => {
    setStatusMap({});
    setAllStatuses([]);
    fetchStatuses(activeTab);
  }, [activeTab, fetchStatuses]);

  useEffect(() => {
    fetchApplications();
  }, [activeTab, statusFilter, fetchApplications]);

  // Client-side search
  const filtered = applications.filter(app => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = (app.full_name || app.restaurant_name || "").toLowerCase();
    const phone = (app.phone || "").toLowerCase();
    return name.includes(term) || phone.includes(term);
  });

  const emptyMsg = searchTerm ? "Arama sonucu bulunamadı" : "Başvuru bulunamadı";

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
    <div data-testid="basvurular-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Başvurular</h2>
          {companyCity && (
            <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />{companyCity}
            </p>
          )}
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

      {/* Muhasebe-style tabs */}
      <div className="relative mb-4">
        {showLeftArrow && (
          <button
            onClick={() => scrollTabs("left")}
            className="absolute left-0 top-0 bottom-0 z-10 bg-gradient-to-r from-white via-white to-transparent pr-4 pl-1 flex items-center md:hidden"
          >
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </button>
        )}

        <div
          ref={tabsContainerRef}
          onScroll={checkScrollArrows}
          className="overflow-x-auto scrollbar-hide scroll-smooth"
        >
          <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
            {TAB_CONFIG.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setStatusFilter(""); setSearchTerm(""); }}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
                }`}
                data-testid={`tab-${tab.key}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {showRightArrow && (
          <button
            onClick={() => scrollTabs("right")}
            className="absolute right-0 top-0 bottom-0 z-10 bg-gradient-to-l from-white via-white to-transparent pl-4 pr-1 flex items-center md:hidden"
          >
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Search + Dynamic Status filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Ad, telefon ara..."
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
          {allStatuses.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border-2 transition-all ${
                statusFilter === s.value ? "" : "opacity-60 hover:opacity-100"
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

      {/* Content */}
      {loading ? (
        <PageLoading />
      ) : (
        <>
          {activeTab === "courier" && (
            <CourierTable applications={filtered} statusMap={statusMap} allStatuses={allStatuses} adminName={adminName || "Admin"} onSuccess={() => fetchApplications(false)} emptyMsg={emptyMsg} />
          )}
          {activeTab === "restaurant" && (
            <RestaurantTable applications={filtered} statusMap={statusMap} allStatuses={allStatuses} adminName={adminName || "Admin"} onSuccess={() => fetchApplications(false)} emptyMsg={emptyMsg} />
          )}
          {activeTab === "company" && (
            <CompanyTable applications={filtered} statusMap={statusMap} allStatuses={allStatuses} adminName={adminName || "Admin"} onSuccess={() => fetchApplications(false)} emptyMsg={emptyMsg} />
          )}
          <ApplicationMobileCards
            applications={filtered}
            activeTab={activeTab}
            statusMap={statusMap}
            allStatuses={allStatuses}
            adminName={adminName || "Admin"}
            onSuccess={() => fetchApplications(false)}
            emptyMsg={emptyMsg}
          />
        </>
      )}
    </div>
  );
}
