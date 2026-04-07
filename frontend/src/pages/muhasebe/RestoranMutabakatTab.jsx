import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Store, 
  Package,
  Download,
  Plus,
  Undo2,
  RefreshCw,
  Wallet,
  Settings,
  Clock,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";
import WeekSelector from "@/components/muhasebe/WeekSelector";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

export default function RestoranMutabakatTab({ companyId }) {
  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  
  // Week data
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [closingTime, setClosingTime] = useState("06:00");
  
  // Mutabakat data
  const [restaurants, setRestaurants] = useState([]);
  const [summary, setSummary] = useState({ total_orders: 0, total_net: 0, restaurant_count: 0 });
  const [weekDescription, setWeekDescription] = useState("");
  const [vatRate, setVatRate] = useState(10);
  const [posCommissionRate, setPosCommissionRate] = useState(1.79);
  
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

  // Fetch available weeks
  const fetchWeeks = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/restoran-mutabakat/weeks/${companyId}`);
      setWeeks(res.data.weeks);
      setClosingTime(res.data.closing_time);
      
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
      const res = await axios.get(`${API}/restoran-mutabakat/auto-settings/${companyId}`);
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
      const res = await axios.post(`${API}/restoran-mutabakat/data/${companyId}`, {
        week_start: week.week_start,
        week_end: week.week_end,
        label: week.label
      });
      
      setRestaurants(res.data.restaurants);
      setSummary(res.data.summary);
      setWeekDescription(res.data.week_description);
      setVatRate(res.data.vat_rate || 10);
      setPosCommissionRate(res.data.pos_commission_rate || 1.79);
    } catch (err) {
      toast.error("Mütabakat verileri yüklenemedi");
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

  // Toggle selection
  const handleToggleSelect = (restaurantId) => {
    setSelectedIds(prev => 
      prev.includes(restaurantId) 
        ? prev.filter(id => id !== restaurantId)
        : [...prev, restaurantId]
    );
  };

  // Toggle select all unprocessed
  const handleToggleSelectAll = () => {
    const selectableRestaurants = restaurants.filter(r => !r.is_processed);
    const allSelected = selectableRestaurants.every(r => selectedIds.includes(r.restaurant_id));
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !selectableRestaurants.map(r => r.restaurant_id).includes(id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...selectableRestaurants.map(r => r.restaurant_id)])];
      setSelectedIds(newIds);
    }
  };

  // Toggle select all processed
  const handleToggleSelectAllProcessed = () => {
    const processedList = restaurants.filter(r => r.is_processed);
    const allProcessedSelected = processedList.every(r => selectedIds.includes(r.restaurant_id));
    
    if (allProcessedSelected) {
      setSelectedIds(prev => prev.filter(id => !processedList.map(r => r.restaurant_id).includes(id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...processedList.map(r => r.restaurant_id)])];
      setSelectedIds(newIds);
    }
  };

  // Handle auto toggle
  const handleAutoToggle = async (enabled) => {
    setAutoSaving(true);
    try {
      await axios.put(`${API}/restoran-mutabakat/auto-settings/${companyId}`, { enabled });
      setAutoEnabled(enabled);
      toast.success(enabled ? "Otomatik işleme açıldı" : "Otomatik işleme kapatıldı");
    } catch (err) {
      toast.error("Ayar güncellenemedi");
    } finally {
      setAutoSaving(false);
    }
  };

  // Apply mutabakat
  const handleApplyMutabakat = async () => {
    const selectedUnprocessed = restaurants.filter(
      r => selectedIds.includes(r.restaurant_id) && !r.is_processed
    );
    
    if (selectedUnprocessed.length === 0) return;
    
    setApplyLoading(true);
    try {
      const items = selectedUnprocessed.map(r => ({
        restaurant_id: r.restaurant_id,
        restaurant_name: r.restaurant_name,
        order_count: r.order_count,
        delivery_fee: r.delivery_fee,
        delivery_vat: r.delivery_vat,
        total_delivery: r.total_delivery,
        pos_commission: r.pos_commission,
        cash_amount: r.cash_amount,
        card_amount: r.card_amount,
        net_amount: r.net_amount
      }));
      
      const res = await axios.post(`${API}/restoran-mutabakat/apply/${companyId}`, {
        week_start: selectedWeek.week_start,
        week_end: selectedWeek.week_end,
        items,
        admin_id: "manual",
        admin_name: "Admin"
      });
      
      toast.success(res.data.message);
      setShowApplyModal(false);
      setSelectedIds([]);
      fetchWeekData(selectedWeek);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setApplyLoading(false);
    }
  };

  // Revert mutabakat
  const handleRevertMutabakat = async () => {
    const selectedProcessedIds = restaurants
      .filter(r => r.is_processed && selectedIds.includes(r.restaurant_id))
      .map(r => r.restaurant_id);
    
    if (selectedProcessedIds.length === 0) {
      toast.error("Geri alınacak işlenmiş restoran seçilmedi");
      return;
    }
    
    setRevertLoading(true);
    try {
      const res = await axios.post(`${API}/restoran-mutabakat/revert/${companyId}`, {
        week_start: selectedWeek.week_start,
        week_end: selectedWeek.week_end,
        admin_id: "manual",
        admin_name: "Admin",
        restaurant_ids: selectedProcessedIds
      });
      
      toast.success(res.data.message);
      setShowRevertModal(false);
      setSelectedIds([]);
      fetchWeekData(selectedWeek);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setRevertLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!restaurants?.length) return;
    
    const headers = ["Restoran", "Sipariş", "Taşıma", "KDV", "Toplam Taşıma", "POS Kom.", "Nakit", "Kart", "Net Tutar", "Durum"];
    const rows = restaurants.map(r => [
      r.restaurant_name,
      r.order_count,
      r.delivery_fee.toFixed(2),
      r.delivery_vat.toFixed(2),
      r.total_delivery.toFixed(2),
      r.pos_commission.toFixed(2),
      r.cash_amount.toFixed(2),
      r.card_amount.toFixed(2),
      r.net_amount.toFixed(2),
      r.is_processed ? "İşlendi" : "Bekliyor"
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `restoran_mutabakat_${selectedWeek?.label?.replace(/\s/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Calculated values
  const selectedRestaurants = restaurants.filter(r => selectedIds.includes(r.restaurant_id));
  const selectedUnprocessed = selectedRestaurants.filter(r => !r.is_processed);
  const selectedUnprocessedTotal = selectedUnprocessed.reduce((sum, r) => sum + r.net_amount, 0);
  const selectedProcessed = selectedRestaurants.filter(r => r.is_processed);
  const selectedProcessedTotal = selectedProcessed.reduce((sum, r) => sum + r.net_amount, 0);
  const processedRestaurants = restaurants.filter(r => r.is_processed);
  const canRevert = selectedProcessed.length > 0 && selectedWeek?.is_current;

  if (initialLoading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="restoran-mutabakat-tab">
      {/* Header Card */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onSelect={handleWeekSelect}
              loading={dataLoading}
            />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchWeekData(selectedWeek)}
              disabled={dataLoading}
              className="h-8 sm:h-9"
            >
              <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
            </Button>
            
            <div className="flex-1" />
            
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {canRevert && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevertModal(true)}
                  className="h-8 sm:h-9 text-xs sm:text-sm text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Geri Al</span> ({selectedProcessed.length})
                </Button>
              )}
              
              <Button
                onClick={() => setShowApplyModal(true)}
                disabled={selectedUnprocessed.length === 0 || dataLoading}
                className="h-8 sm:h-9 text-xs sm:text-sm"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Mütabakatı Onayla</span><span className="sm:hidden">Onayla</span> ({selectedUnprocessed.length})
              </Button>
              
              {restaurants.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExportCSV}
                  className="h-8 sm:h-9"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">CSV</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Settings */}
      <Card className="border bg-white shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-4 h-4 text-slate-500" />
              <div>
                <p className="text-sm font-medium">Otomatik İşleme</p>
                <p className="text-xs text-muted-foreground">
                  Her Pazartesi {(() => { const [h,m] = closingTime.split(':').map(Number); return `${String((h+1)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`; })()}'da otomatik mütabakat
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lastAutoRun && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Son: {new Date(lastAutoRun).toLocaleDateString('tr-TR')}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-mutabakat"
                  checked={autoEnabled}
                  onCheckedChange={handleAutoToggle}
                  disabled={autoSaving}
                />
                <Label htmlFor="auto-mutabakat" className="text-sm">
                  {autoEnabled ? "Açık" : "Kapalı"}
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {dataLoading && <PageLoading />}

      {/* Results */}
      {!dataLoading && restaurants.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <Store className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                <p className="text-2xl font-bold text-slate-800">{summary.restaurant_count}</p>
                <p className="text-xs text-slate-500">Aktif Restoran</p>
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
                <p className={`text-2xl font-bold ${summary.total_net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatMoney(Math.abs(summary.total_net))}
                </p>
                <p className="text-xs text-slate-500">Toplam Net</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-4 text-center">
                <div className="w-5 h-5 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 text-xs font-bold">✓</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{processedRestaurants.length}</p>
                <p className="text-xs text-slate-500">İşlenen</p>
              </CardContent>
            </Card>
          </div>

          {/* Restaurant Table */}
          <Card className="border bg-white shadow-sm">
            <CardHeader className="pb-2 border-b bg-slate-50">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Restoran Mütabakatları ({restaurants.length} restoran)
                {selectedUnprocessed.length > 0 && (
                  <span className="ml-2 text-primary">
                    — {selectedUnprocessed.length} bekleyen seçili, {formatMoney(selectedUnprocessedTotal)}
                  </span>
                )}
                {selectedProcessed.length > 0 && (
                  <span className="ml-2 text-amber-600">
                    — {selectedProcessed.length} işlenmiş seçili
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-2 text-left w-10">
                        <Checkbox
                          checked={restaurants.filter(r => !r.is_processed).length > 0 &&
                            restaurants.filter(r => !r.is_processed).every(r => selectedIds.includes(r.restaurant_id))}
                          onCheckedChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="p-2 text-left text-xs font-semibold text-slate-600">Restoran</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Sipariş</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Taşıma</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">KDV</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Top. Taşıma</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">POS Kom.</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Nakit</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Kart</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Y.Kartı</th>
                      <th className="p-2 text-right text-xs font-semibold text-slate-600">Net Tutar</th>
                      <th className="p-2 text-center text-xs font-semibold text-slate-600">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restaurants.map((r) => {
                      const isSelected = selectedIds.includes(r.restaurant_id);
                      const canSelect = !r.is_processed;
                      
                      return (
                        <tr 
                          key={r.restaurant_id} 
                          className={`border-b hover:bg-slate-50 transition-colors ${r.is_processed ? 'bg-green-50/50' : ''}`}
                        >
                          <td className="p-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleSelect(r.restaurant_id)}
                              disabled={!canSelect && !r.is_processed}
                            />
                          </td>
                          <td className="p-2 font-medium text-slate-800">
                            {r.restaurant_name}
                          </td>
                          <td className="p-2 text-right font-mono">{r.order_count}</td>
                          <td className="p-2 text-right font-mono">{formatMoney(r.delivery_fee)}</td>
                          <td className="p-2 text-right font-mono text-slate-500">{formatMoney(r.delivery_vat)}</td>
                          <td className="p-2 text-right font-mono font-medium">{formatMoney(r.total_delivery)}</td>
                          <td className="p-2 text-right font-mono text-slate-500">{formatMoney(r.pos_commission)}</td>
                          <td className={`p-2 text-right font-mono ${r.cash_included !== false ? 'text-green-600' : 'text-slate-800'}`} title={r.cash_included === false ? 'Restoran tahsil ediyor - mütabakatta hariç' : 'Kurye firması tahsil ediyor'}>
                            {formatMoney(r.cash_amount)}
                            {r.cash_included === false && <span className="ml-1 text-xs">*</span>}
                          </td>
                          <td className={`p-2 text-right font-mono ${r.card_included !== false ? 'text-blue-600' : 'text-slate-800'}`} title={r.card_included === false ? 'Restoran tahsil ediyor - mütabakatta hariç' : 'Kurye firması tahsil ediyor'}>
                            {formatMoney(r.card_amount)}
                            {r.card_included === false && <span className="ml-1 text-xs">*</span>}
                          </td>
                          <td className={`p-2 text-right font-mono ${r.meal_card_included !== false ? 'text-purple-600' : 'text-slate-800'}`} title={r.meal_card_included === false ? 'Restoran tahsil ediyor - mütabakatta hariç' : 'Kurye firması tahsil ediyor'}>
                            {formatMoney(r.meal_card_amount || 0)}
                            {r.meal_card_included === false && <span className="ml-1 text-xs">*</span>}
                          </td>
                          <td className={`p-2 text-right font-mono font-semibold ${r.net_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span className="flex items-center justify-end gap-1">
                              {r.net_amount >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {formatMoney(Math.abs(r.net_amount))}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {r.is_processed ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                İşlendi
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                Bekliyor
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {restaurants.map((r) => {
                  const isSelected = selectedIds.includes(r.restaurant_id);
                  const canSelect = !r.is_processed;
                  return (
                    <div key={r.restaurant_id} className={`p-3 ${r.is_processed ? 'bg-green-50/50' : ''}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Checkbox checked={isSelected} onCheckedChange={() => handleToggleSelect(r.restaurant_id)} disabled={!canSelect && !r.is_processed} />
                        <span className="font-semibold text-sm flex-1 truncate">{r.restaurant_name}</span>
                        {r.is_processed ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">İşlendi</span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">Bekliyor</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-1.5">
                        <div className="bg-slate-50 rounded p-1.5 text-center">
                          <p className="text-muted-foreground">Sipariş</p>
                          <p className="font-semibold">{r.order_count}</p>
                        </div>
                        <div className="bg-slate-50 rounded p-1.5 text-center">
                          <p className="text-muted-foreground">Taşıma</p>
                          <p className="font-semibold">{formatMoney(r.total_delivery)}</p>
                        </div>
                        <div className="bg-slate-50 rounded p-1.5 text-center">
                          <p className="text-muted-foreground">POS Kom.</p>
                          <p className="font-semibold">{formatMoney(r.pos_commission)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-1.5">
                        <div className="bg-green-50 rounded p-1.5 text-center">
                          <p className="text-green-600">Nakit</p>
                          <p className="font-semibold text-green-700">{formatMoney(r.cash_amount)}</p>
                        </div>
                        <div className="bg-blue-50 rounded p-1.5 text-center">
                          <p className="text-blue-600">Kart</p>
                          <p className="font-semibold text-blue-700">{formatMoney(r.card_amount)}</p>
                        </div>
                        <div className="bg-purple-50 rounded p-1.5 text-center">
                          <p className="text-purple-600">Y.Kartı</p>
                          <p className="font-semibold text-purple-700">{formatMoney(r.meal_card_amount || 0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <span className={`font-mono font-bold text-sm ${r.net_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Net: {formatMoney(Math.abs(r.net_amount))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!dataLoading && restaurants.length === 0 && selectedWeek && (
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-8 text-center text-slate-500">
            <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1 text-slate-700">Bu hafta için veri bulunamadı</p>
            <p className="text-sm">Seçili hafta: {selectedWeek.label}</p>
          </CardContent>
        </Card>
      )}

      {/* Apply Modal */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mütabakatı Onayla</DialogTitle>
            <DialogDescription>
              {selectedUnprocessed.length} restoran için mütabakat işlemi yapılacak.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hafta:</span>
              <span className="font-medium">{selectedWeek?.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Restoran Sayısı:</span>
              <span className="font-medium">{selectedUnprocessed.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Toplam Net Tutar:</span>
              <span className={`font-bold ${selectedUnprocessedTotal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatMoney(Math.abs(selectedUnprocessedTotal))}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Onaylandığında her restoran için bakiyeye işlem eklenecektir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              İptal
            </Button>
            <Button onClick={handleApplyMutabakat} disabled={applyLoading}>
              {applyLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Modal */}
      <Dialog open={showRevertModal} onOpenChange={setShowRevertModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mütabakatı Geri Al</DialogTitle>
            <DialogDescription>
              {selectedProcessed.length} restoran için mütabakat geri alınacak.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hafta:</span>
              <span className="font-medium">{selectedWeek?.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Geri Alınacak:</span>
              <span className="font-medium">{selectedProcessed.length} restoran</span>
            </div>
            <p className="text-xs text-amber-600 mt-4">
              Bu işlem geri alınamaz. Eklenen muhasebe kayıtları silinecektir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevertModal(false)}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleRevertMutabakat} disabled={revertLoading}>
              {revertLoading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
              Geri Al
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
