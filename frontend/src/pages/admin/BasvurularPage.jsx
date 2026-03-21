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
  Users, Store, Building2, Phone, MapPin, Clock, ChevronLeft, ChevronRight,
  RefreshCw, Bike, FileText, Calendar, Package, Loader2, Search, AlertCircle, ChevronDown
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

// --- Status Dropdown ---
function StatusDropdown({ application, statuses, appType, adminName, onSuccess }) {
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

  const currentStatus = statuses.find(s => s.value === application.status) || { label: application.status, color: "#94a3b8" };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: currentStatus.color + "1a", color: currentStatus.color, border: `1.5px solid ${currentStatus.color}40` }}
            data-testid={`status-dropdown-${application.id}`}
          >
            {currentStatus.label}
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {statuses.map(s => (
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
              <StatusBadge status={pendingStatus} statuses={statuses} />
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

// --- Desktop Table ---
function ApplicationTable({ applications, activeTab, statuses, adminName, onSuccess, searchTerm }) {
  const emptyMessage = searchTerm
    ? "Arama sonucu bulunamadı"
    : "Başvuru bulunamadı";

  return (
    <div className="hidden md:block border-2 border-border bg-white overflow-x-auto" data-testid="applications-table">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            {activeTab === "courier" && (
              <>
                <TableHead className="font-bold text-xs">Ad Soyad</TableHead>
                <TableHead className="font-bold text-xs">Telefon</TableHead>
                <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
                <TableHead className="font-bold text-xs">Motosiklet</TableHead>
                <TableHead className="font-bold text-xs">Deneyim</TableHead>
                <TableHead className="font-bold text-xs">Tarih</TableHead>
                <TableHead className="font-bold text-xs text-right">Durum</TableHead>
              </>
            )}
            {activeTab === "restaurant" && (
              <>
                <TableHead className="font-bold text-xs">Restoran Adı</TableHead>
                <TableHead className="font-bold text-xs">Yetkili</TableHead>
                <TableHead className="font-bold text-xs">Telefon</TableHead>
                <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
                <TableHead className="font-bold text-xs">Paket/Gün</TableHead>
                <TableHead className="font-bold text-xs">Tarih</TableHead>
                <TableHead className="font-bold text-xs text-right">Durum</TableHead>
              </>
            )}
            {activeTab === "company" && (
              <>
                <TableHead className="font-bold text-xs">Yetkili Adı</TableHead>
                <TableHead className="font-bold text-xs">Telefon</TableHead>
                <TableHead className="font-bold text-xs">İl / İlçe</TableHead>
                <TableHead className="font-bold text-xs">Başvuru Tipi</TableHead>
                <TableHead className="font-bold text-xs">Tarih</TableHead>
                <TableHead className="font-bold text-xs text-right">Durum</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            applications.map((app) => (
              <TableRow key={app.id} className="border-b border-border hover:bg-slate-50" data-testid={`app-row-${app.id}`}>
                {activeTab === "courier" && (
                  <>
                    <TableCell className="font-medium">{app.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
                    <TableCell className="text-sm">{app.province}{app.district ? ` / ${app.district}` : ""}</TableCell>
                    <TableCell className="text-sm">
                      {app.has_motorcycle
                        ? <span className="text-green-600">{`${app.motorcycle_brand || ""} ${app.motorcycle_model || ""}`.trim() || "Var"}</span>
                        : <span className="text-muted-foreground">Yok</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm">{app.experience || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(app.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <StatusDropdown application={app} statuses={statuses} appType={activeTab} adminName={adminName} onSuccess={onSuccess} />
                    </TableCell>
                  </>
                )}
                {activeTab === "restaurant" && (
                  <>
                    <TableCell className="font-medium">{app.restaurant_name || app.full_name}</TableCell>
                    <TableCell className="text-sm">{app.contact_name || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
                    <TableCell className="text-sm">{app.province}{app.district ? ` / ${app.district}` : ""}</TableCell>
                    <TableCell className="text-sm">{app.package_count || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(app.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <StatusDropdown application={app} statuses={statuses} appType={activeTab} adminName={adminName} onSuccess={onSuccess} />
                    </TableCell>
                  </>
                )}
                {activeTab === "company" && (
                  <>
                    <TableCell className="font-medium">{app.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(app.phone)}</TableCell>
                    <TableCell className="text-sm">{app.province}{app.district ? ` / ${app.district}` : ""}</TableCell>
                    <TableCell className="text-sm">{app.application_type || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(app.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <StatusDropdown application={app} statuses={statuses} appType={activeTab} adminName={adminName} onSuccess={onSuccess} />
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Mobile Cards ---
function ApplicationMobileCards({ applications, activeTab, statuses, adminName, onSuccess, searchTerm }) {
  const emptyMessage = searchTerm
    ? "Arama sonucu bulunamadı"
    : "Başvuru bulunamadı";

  if (applications.length === 0) {
    return (
      <div className="md:hidden border rounded-lg p-6 bg-white dark:bg-card text-center text-muted-foreground">
        {emptyMessage}
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
            <StatusDropdown application={app} statuses={statuses} appType={activeTab} adminName={adminName} onSuccess={onSuccess} />
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
  const [statuses, setStatuses] = useState({
    courier: DEFAULT_STATUSES,
    restaurant: DEFAULT_STATUSES,
    company: DEFAULT_STATUSES
  });
  const [connectionOk, setConnectionOk] = useState(null);

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
  }, [activeTab, statusFilter, companyCity]);

  useEffect(() => {
    fetchApplications();
    fetchStatuses(activeTab);
  }, [activeTab, statusFilter, fetchApplications, fetchStatuses]);

  // Client-side search
  const filtered = applications.filter(app => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = (app.full_name || app.restaurant_name || "").toLowerCase();
    const phone = (app.phone || "").toLowerCase();
    return name.includes(term) || phone.includes(term);
  });

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

      {/* Search + Status filters */}
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
          {currentStatuses.map(s => (
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
          <ApplicationTable
            applications={filtered}
            activeTab={activeTab}
            statuses={currentStatuses}
            adminName={adminName || "Admin"}
            onSuccess={() => fetchApplications(false)}
            searchTerm={searchTerm}
          />
          <ApplicationMobileCards
            applications={filtered}
            activeTab={activeTab}
            statuses={currentStatuses}
            adminName={adminName || "Admin"}
            onSuccess={() => fetchApplications(false)}
            searchTerm={searchTerm}
          />
        </>
      )}
    </div>
  );
}
