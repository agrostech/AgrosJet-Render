import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  Wallet,
  Package,
  Download,
  Plus,
  Undo2,
  RefreshCw
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

// Components
import WeekSelector from "@/components/muhasebe/WeekSelector";
import HakedisTable from "@/components/muhasebe/HakedisTable";
import HakedisAutoSettings from "@/components/muhasebe/HakedisAutoSettings";
import ApplyHakedisModal from "@/components/muhasebe/ApplyHakedisModal";
import RevertHakedisModal from "@/components/muhasebe/RevertHakedisModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

export default function HaftalikHakedisTab({ companyId }) {
  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  
  // Week data
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [closingTime, setClosingTime] = useState("06:00");
  
  // Hakedis data
  const [couriers, setCouriers] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, total_orders: 0 });
  const [weekDescription, setWeekDescription] = useState("");
  const [dateRangeLabel, setDateRangeLabel] = useState("");
  
  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Auto settings
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [lastAutoRun, setLastAutoRun] = useState(null);
  const [autoSaving, setAutoSaving] = useState(false);
  
  // Modals
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  
  // Apply options
  const [addHakedis, setAddHakedis] = useState(true);
  const [addJetpuan, setAddJetpuan] = useState(true);

  // Fetch available weeks
  const fetchWeeks = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/weekly-hakedis/weeks/${companyId}`);
      setWeeks(res.data.weeks);
      setClosingTime(res.data.closing_time);
      
      // Select current week by default
      const currentWeek = res.data.weeks.find(w => w.is_current) || res.data.weeks[0];
      if (currentWeek) {
        setSelectedWeek(currentWeek);
      }
    } catch (err) {
      toast.error("Hafta bilgileri yüklenemedi");
    }
  }, [companyId]);

  // Fetch auto settings
  const fetchAutoSettings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/weekly-hakedis/auto-settings/${companyId}`);
      setAutoEnabled(res.data.enabled);
      setLastAutoRun(res.data.last_auto_run);
    } catch (err) {
      console.error("Auto settings fetch error:", err);
    }
  }, [companyId]);

  // Fetch week data
  const fetchWeekData = useCallback(async (week) => {
    if (!week) return;
    
    setDataLoading(true);
    setSelectedIds([]);
    
    try {
      const res = await axios.post(`${API}/weekly-hakedis/data/${companyId}`, {
        week_start: week.week_start,
        week_end: week.week_end,
        label: week.label
      });
      
      setCouriers(res.data.couriers);
      setSummary(res.data.summary);
      setWeekDescription(res.data.week_description);
      setDateRangeLabel(res.data.date_range_label || "");
    } catch (err) {
      toast.error("Hakediş verileri yüklenemedi");
    } finally {
      setDataLoading(false);
    }
  }, [companyId]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchWeeks(), fetchAutoSettings()]);
      setInitialLoading(false);
    };
    init();
  }, [fetchWeeks, fetchAutoSettings]);

  // Load data when week changes
  useEffect(() => {
    if (selectedWeek) {
      fetchWeekData(selectedWeek);
    }
  }, [selectedWeek, fetchWeekData]);

  // Handle week selection
  const handleWeekSelect = (week) => {
    setSelectedWeek(week);
  };

  // Toggle courier selection (hem işlenmemiş hem işlenmiş için)
  const handleToggleSelect = (courierId) => {
    setSelectedIds(prev => 
      prev.includes(courierId) 
        ? prev.filter(id => id !== courierId)
        : [...prev, courierId]
    );
  };

  // Toggle select all (işlenmemişler için - hakediş ekleme)
  const handleToggleSelectAll = () => {
    const selectableCouriers = couriers.filter(c => !c.is_processed && c.amount > 0);
    const allSelected = selectableCouriers.every(c => selectedIds.includes(c.courier_id));
    
    if (allSelected) {
      // Sadece işlenmemişleri kaldır
      setSelectedIds(prev => prev.filter(id => !selectableCouriers.map(c => c.courier_id).includes(id)));
    } else {
      // İşlenmemişleri ekle
      const newIds = [...new Set([...selectedIds, ...selectableCouriers.map(c => c.courier_id)])];
      setSelectedIds(newIds);
    }
  };

  // Toggle select all processed (işlenmiş kuryeler için - geri alma)
  const handleToggleSelectAllProcessed = () => {
    const processedCouriersList = couriers.filter(c => c.is_processed);
    const allProcessedSelected = processedCouriersList.every(c => selectedIds.includes(c.courier_id));
    
    if (allProcessedSelected) {
      // Sadece işlenmişleri kaldır
      setSelectedIds(prev => prev.filter(id => !processedCouriersList.map(c => c.courier_id).includes(id)));
    } else {
      // İşlenmişleri ekle
      const newIds = [...new Set([...selectedIds, ...processedCouriersList.map(c => c.courier_id)])];
      setSelectedIds(newIds);
    }
  };

  // Handle auto toggle
  const handleAutoToggle = async (enabled) => {
    setAutoSaving(true);
    try {
      await axios.put(`${API}/weekly-hakedis/auto-settings/${companyId}`, { enabled });
      setAutoEnabled(enabled);
      toast.success(enabled ? "Otomatik işleme açıldı" : "Otomatik işleme kapatıldı");
    } catch (err) {
      toast.error("Ayar güncellenemedi");
    } finally {
      setAutoSaving(false);
    }
  };

  // Apply hakedis (sadece işlenmemiş seçili kuryeler için)
  const handleApplyHakedis = async () => {
    const selectedUnprocessedCouriers = couriers.filter(
      c => selectedIds.includes(c.courier_id) && !c.is_processed && c.amount > 0
    );
    
    if (selectedUnprocessedCouriers.length === 0) return;
    
    setApplyLoading(true);
    try {
      const items = selectedUnprocessedCouriers.map(c => ({
        courier_id: c.courier_id,
        courier_name: c.courier_name,
        amount: c.amount,
        order_count: c.order_count,
        distance_km: c.distance_km
      }));
      
      const res = await axios.post(`${API}/weekly-hakedis/apply/${companyId}`, {
        week_start: selectedWeek.week_start,
        week_end: selectedWeek.week_end,
        items,
        admin_id: "manual",
        admin_name: "Admin",
        add_hakedis: addHakedis,
        add_jetpuan: addJetpuan
      });
      
      toast.success(res.data.message);
      setShowApplyModal(false);
      setSelectedIds([]);
      
      // Refresh data
      fetchWeekData(selectedWeek);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setApplyLoading(false);
    }
  };

  // Revert hakedis (seçili işlenmiş kuryeler için)
  const handleRevertHakedis = async () => {
    // Seçili işlenmiş kuryeleri bul
    const selectedProcessedIds = couriers
      .filter(c => c.is_processed && selectedIds.includes(c.courier_id))
      .map(c => c.courier_id);
    
    if (selectedProcessedIds.length === 0) {
      toast.error("Geri alınacak işlenmiş kurye seçilmedi");
      return;
    }
    
    setRevertLoading(true);
    try {
      const res = await axios.post(`${API}/weekly-hakedis/revert/${companyId}`, {
        week_start: selectedWeek.week_start,
        week_end: selectedWeek.week_end,
        admin_id: "manual",
        admin_name: "Admin",
        courier_ids: selectedProcessedIds
      });
      
      toast.success(res.data.message);
      setShowRevertModal(false);
      setSelectedIds([]);
      
      // Refresh data
      fetchWeekData(selectedWeek);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setRevertLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!couriers?.length) return;
    
    const headers = ["Kurye", "Telefon", "Sipariş Sayısı", "Mesafe (km)", "Hakediş (TL)", "Durum"];
    const rows = couriers.map(c => [
      c.courier_name,
      c.courier_phone || "",
      c.order_count,
      c.distance_km.toFixed(2),
      c.amount.toFixed(2),
      c.is_processed ? "İşlendi" : "Bekliyor"
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `haftalik_hakedis_${selectedWeek?.label?.replace(/\s/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Calculated values
  const selectedCouriers = couriers.filter(c => selectedIds.includes(c.courier_id));
  
  // İşlenmemiş seçili kuryeler (hakediş ekleme için)
  const selectedUnprocessed = selectedCouriers.filter(c => !c.is_processed && c.amount > 0);
  const selectedUnprocessedTotal = selectedUnprocessed.reduce((sum, c) => sum + c.amount, 0);
  
  // İşlenmiş seçili kuryeler (geri alma için)
  const selectedProcessed = selectedCouriers.filter(c => c.is_processed);
  const selectedProcessedTotal = selectedProcessed.reduce((sum, c) => sum + c.amount, 0);
  
  // Tüm işlenmiş kuryeler
  const processedCouriers = couriers.filter(c => c.is_processed);
  const processedTotal = processedCouriers.reduce((sum, c) => sum + c.amount, 0);
  
  // Geri alma butonu için: işlenmiş kurye seçili olmalı ve current week olmalı
  const canRevert = selectedProcessed.length > 0 && selectedWeek?.is_current;

  if (initialLoading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="haftalik-hakedis-tab">
      {/* Header Card - Week Selector & Actions */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Week Selector */}
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onSelect={handleWeekSelect}
              loading={dataLoading}
            />
            
            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchWeekData(selectedWeek)}
              disabled={dataLoading}
              className="h-9"
            >
              <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            {/* Spacer */}
            <div className="flex-1" />
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Revert Button - Seçili işlenmiş kuryeler için */}
              {canRevert && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevertModal(true)}
                  className="h-9 text-amber-600 border-amber-300 hover:bg-amber-50"
                  data-testid="revert-btn"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Geri Al ({selectedProcessed.length})
                </Button>
              )}
              
              {/* Apply Button - Seçili işlenmemiş kuryeler için */}
              <Button
                onClick={() => setShowApplyModal(true)}
                disabled={selectedUnprocessed.length === 0 || dataLoading}
                className="h-9"
                data-testid="apply-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Toplu Ekle ({selectedUnprocessed.length})
              </Button>
              
              {/* Export Button */}
              {couriers.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExportCSV}
                  className="h-9"
                  data-testid="export-btn"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Settings */}
      <HakedisAutoSettings
        enabled={autoEnabled}
        onToggle={handleAutoToggle}
        closingTime={closingTime}
        lastAutoRun={lastAutoRun}
        saving={autoSaving}
      />

      {/* Loading */}
      {dataLoading && <PageLoading />}

      {/* Results */}
      {!dataLoading && couriers.length > 0 && (
        <>
          {/* Date Range Info */}
          {dateRangeLabel && (
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-4 py-2 border">
              <span className="font-medium">Tarih Aralığı:</span> {dateRangeLabel}
            </div>
          )}
          
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Users className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">
                  {couriers.filter(c => c.order_count > 0).length}
                </p>
                <p className="text-xs text-slate-500">Aktif Kurye</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Package className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{summary.total_orders}</p>
                <p className="text-xs text-slate-500">Toplam Sipariş</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Wallet className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{formatMoney(summary.total_amount)}</p>
                <p className="text-xs text-slate-500">Toplam Hakediş</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="w-5 h-5 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-xs font-bold">✓</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{processedCouriers.length}</p>
                <p className="text-xs text-slate-500">İşlenen Kurye</p>
              </CardContent>
            </Card>
          </div>

          {/* Courier Table */}
          <Card className="border bg-white shadow-sm">
            <CardHeader className="pb-2 border-b bg-slate-50">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Kurye Hakedişleri ({couriers.filter(c => (c.amount > 0 || c.is_processed) && !c.is_admin_linked).length} kurye)
                {selectedUnprocessed.length > 0 && (
                  <span className="ml-2 text-primary">
                    — {selectedUnprocessed.length} bekleyen seçili, {formatMoney(selectedUnprocessedTotal)}
                  </span>
                )}
                {selectedProcessed.length > 0 && (
                  <span className="ml-2 text-amber-600">
                    — {selectedProcessed.length} işlenmiş seçili, {formatMoney(selectedProcessedTotal)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HakedisTable
                couriers={couriers.filter(c => !c.is_admin_linked)}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                onToggleSelectAllProcessed={handleToggleSelectAllProcessed}
                summary={summary}
                isCurrentWeek={selectedWeek?.is_current}
              />
            </CardContent>
          </Card>

          {/* Yönetici Hakedişleri - Admin bağlantılı kuryeler */}
          {couriers.filter(c => c.is_admin_linked).length > 0 && (
            <Card className="border bg-white shadow-sm mt-4">
              <CardHeader className="pb-2 border-b bg-amber-50">
                <CardTitle className="text-sm font-semibold text-amber-700">
                  Yönetici Hakedişleri ({couriers.filter(c => c.is_admin_linked && (c.amount > 0 || c.is_processed)).length} yönetici)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <HakedisTable
                  couriers={couriers.filter(c => c.is_admin_linked)}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleSelectAll={() => {}}
                  onToggleSelectAllProcessed={() => {}}
                  summary={summary}
                  isCurrentWeek={selectedWeek?.is_current}
                  isAdminTable={true}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {!dataLoading && couriers.length === 0 && selectedWeek && (
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1 text-slate-700">Bu hafta için veri bulunamadı</p>
            <p className="text-sm">Seçili hafta: {selectedWeek.label}</p>
          </CardContent>
        </Card>
      )}

      {/* Apply Modal */}
      <ApplyHakedisModal
        open={showApplyModal}
        onOpenChange={setShowApplyModal}
        selectedCount={selectedUnprocessed.length}
        totalAmount={selectedUnprocessedTotal}
        weekLabel={selectedWeek?.label}
        addHakedis={addHakedis}
        setAddHakedis={setAddHakedis}
        addJetpuan={addJetpuan}
        setAddJetpuan={setAddJetpuan}
        onConfirm={handleApplyHakedis}
        loading={applyLoading}
      />

      {/* Revert Modal */}
      <RevertHakedisModal
        open={showRevertModal}
        onOpenChange={setShowRevertModal}
        weekLabel={selectedWeek?.label}
        processedCount={selectedProcessed.length}
        totalAmount={selectedProcessedTotal}
        onConfirm={handleRevertHakedis}
        loading={revertLoading}
      />
    </div>
  );
}
