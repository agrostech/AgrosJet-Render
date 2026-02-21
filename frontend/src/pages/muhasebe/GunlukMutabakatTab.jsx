import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Calendar, 
  Save, 
  CheckCircle2, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Scale,
  RotateCcw,
  Eye,
  Banknote,
  CreditCard,
  AlertCircle,
  Users,
  ClipboardCheck,
  UtensilsCrossed
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Para formatı
const formatMoney = (amount) => {
  if (!amount && amount !== 0) return "0,00 TL";
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

// Dünün tarihini al
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

export default function GunlukMutabakatTab({ companyId, adminId, adminName, isSuperAdmin }) {
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  const [couriers, setCouriers] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [summary, setSummary] = useState({ total_couriers: 0, completed_couriers: 0, processed_couriers: 0 });
  const [weeklyData, setWeeklyData] = useState(null);
  const [hasMealCardCollection, setHasMealCardCollection] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState([]);
  const [editedCollections, setEditedCollections] = useState({});
  
  // Sipariş detay modal state
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [courierOrders, setCourierOrders] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Veri çekme
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/daily-mutabakat/${companyId}/couriers/${selectedDate}`);
      setCouriers(res.data.couriers);
      setDateRange(res.data.date_range);
      setSummary(res.data.summary);
      setHasMealCardCollection(res.data.hasMealCardCollection || false);
      setSelectedIds([]);
      setEditedCollections({});
    } catch (err) {
      toast.error("Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedDate]);

  // Haftalık özet
  const fetchWeeklySummary = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/daily-mutabakat/${companyId}/weekly-summary`);
      setWeeklyData(res.data);
    } catch (err) {
      console.error("Haftalık özet yüklenemedi");
    }
  }, [companyId]);

  // Kurye siparişlerini getir
  const fetchCourierOrders = async (courier) => {
    setSelectedCourier(courier);
    setShowOrdersModal(true);
    setLoadingOrders(true);
    setCourierOrders(null);
    
    try {
      const res = await axios.get(`${API}/daily-mutabakat/${companyId}/courier/${courier.id}/orders/${selectedDate}`);
      setCourierOrders(res.data);
    } catch (err) {
      toast.error("Siparişler yüklenemedi");
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchWeeklySummary();
  }, [fetchData, fetchWeeklySummary]);

  // Kurye seçimi toggle
  const handleToggleSelect = (courierId) => {
    setSelectedIds(prev => 
      prev.includes(courierId) 
        ? prev.filter(id => id !== courierId)
        : [...prev, courierId]
    );
  };

  // Tümünü seç (işlenmemişler için)
  const handleToggleSelectAll = () => {
    const selectableCouriers = couriers.filter(c => !c.is_processed && c.order_data.order_count > 0);
    const allSelected = selectableCouriers.every(c => selectedIds.includes(c.id));
    
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableCouriers.map(c => c.id));
    }
  };

  // Input değişikliği
  const handleInputChange = (courierId, field, value) => {
    const numValue = parseFloat(value) || 0;
    setEditedCollections(prev => ({
      ...prev,
      [courierId]: {
        ...(prev[courierId] || {}),
        [field]: numValue
      }
    }));
  };

  // Girilen değeri al (edited veya mevcut)
  const getCollectionValue = (courier, field) => {
    if (editedCollections[courier.id] && editedCollections[courier.id][field] !== undefined) {
      return editedCollections[courier.id][field];
    }
    return courier.collection[field] || 0;
  };

  // Seçili kuryeleri kaydet
  const handleSave = async () => {
    if (selectedIds.length === 0) {
      toast.error("Kurye seçilmedi");
      return;
    }

    setSaving(true);
    try {
      const couriersToSave = selectedIds.map(id => {
        const courier = couriers.find(c => c.id === id);
        return {
          courier_id: id,
          courier_name: courier.name,
          cash_amount: getCollectionValue(courier, 'cash_amount'),
          card_percent_1: getCollectionValue(courier, 'card_percent_1'),
          card_percent_10: getCollectionValue(courier, 'card_percent_10'),
          card_percent_20: getCollectionValue(courier, 'card_percent_20'),
          meal_card_amount: getCollectionValue(courier, 'meal_card_amount')
        };
      });

      await axios.post(`${API}/daily-mutabakat/${companyId}/save-collection`, {
        date: selectedDate,
        start_datetime: dateRange?.start,
        end_datetime: dateRange?.end,
        couriers: couriersToSave,
        admin_id: adminId,
        admin_name: adminName
      });

      toast.success(`${couriersToSave.length} kurye tahsilatı kaydedildi`);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  // Mütabakat işle
  const handleProcess = async () => {
    const processableIds = selectedIds.filter(id => {
      const courier = couriers.find(c => c.id === id);
      return courier && courier.has_collection && !courier.is_processed;
    });

    if (processableIds.length === 0) {
      toast.error("İşlenecek kurye yok. Önce tahsilatı kaydedin.");
      return;
    }

    setProcessing(true);
    try {
      const res = await axios.post(`${API}/daily-mutabakat/${companyId}/process`, {
        date: selectedDate,
        start_datetime: dateRange?.start,
        end_datetime: dateRange?.end,
        courier_ids: processableIds,
        admin_id: adminId,
        admin_name: adminName
      });

      toast.success(res.data.message);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setProcessing(false);
    }
  };

  // Geri alma (sadece süper admin)
  const handleRevert = async () => {
    const revertableIds = selectedIds.filter(id => {
      const courier = couriers.find(c => c.id === id);
      return courier && courier.is_processed;
    });

    if (revertableIds.length === 0) {
      toast.error("Geri alınacak işlenmiş kurye yok");
      return;
    }

    setReverting(true);
    try {
      const res = await axios.post(`${API}/daily-mutabakat/${companyId}/revert`, {
        date: selectedDate,
        courier_ids: revertableIds,
        admin_id: adminId,
        admin_name: adminName
      });

      toast.success(res.data.message);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Geri alma başarısız");
    } finally {
      setReverting(false);
    }
  };

  // Tahsilat sıfırlama (sadece süper admin, mütabakat yapılmamışsa)
  const handleResetCollection = async () => {
    const resettableIds = selectedIds.filter(id => {
      const courier = couriers.find(c => c.id === id);
      return courier && courier.has_collection && !courier.is_processed;
    });

    if (resettableIds.length === 0) {
      toast.error("Sıfırlanacak tahsilat yok veya mütabakat yapılmış");
      return;
    }

    setResetting(true);
    try {
      const res = await axios.post(`${API}/daily-mutabakat/${companyId}/reset-collection`, {
        date: selectedDate,
        courier_ids: resettableIds,
        admin_id: adminId,
        admin_name: adminName
      });

      toast.success(res.data.message);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sıfırlama başarısız");
    } finally {
      setResetting(false);
    }
  };

  // Hesaplamalar
  const selectableCouriers = couriers.filter(c => !c.is_processed && c.order_data.order_count > 0);
  const allSelectableSelected = selectableCouriers.length > 0 && selectableCouriers.every(c => selectedIds.includes(c.id));
  
  const selectedCouriers = couriers.filter(c => selectedIds.includes(c.id));
  const selectedWithCollection = selectedCouriers.filter(c => c.has_collection && !c.is_processed);
  const selectedProcessed = selectedCouriers.filter(c => c.is_processed);
  const selectedResettable = selectedCouriers.filter(c => c.has_collection && !c.is_processed);

  // Hafta navigasyonu
  const navigateWeek = (direction) => {
    if (!weeklyData) return;
    const currentStart = new Date(weeklyData.week_start);
    const newStart = new Date(currentStart);
    newStart.setDate(newStart.getDate() + (direction === 'prev' ? -7 : 7));
    
    // Yeni haftanın ilk günü seç
    setSelectedDate(newStart.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-4" data-testid="gunluk-mutabakat-tab">
      {/* Haftalık Gün Seçici - Minimal */}
      <div className="flex items-center gap-1 bg-white border rounded-lg p-1.5 shadow-sm">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigateWeek('prev')}
          className="h-8 w-8 p-0 shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        
        <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
          {weeklyData?.days.map((day) => {
            const isSelected = day.date === selectedDate;
            const isFuture = day.status === 'future';
            const isFullyComplete = day.total_with_orders > 0 && 
              day.completed === day.total_with_orders && 
              day.processed === day.total_with_orders;
            
            return (
              <button
                key={day.date}
                onClick={() => !isFuture && setSelectedDate(day.date)}
                disabled={isFuture}
                className={`
                  flex-1 min-w-[56px] py-1.5 px-1 rounded-md text-center transition-all
                  ${isSelected 
                    ? 'bg-slate-900 text-white shadow-sm' 
                    : isFuture 
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'hover:bg-slate-100 text-slate-600'
                  }
                `}
                data-testid={`day-${day.date}`}
              >
                <div className={`text-[10px] font-medium ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                  {day.day_name}
                </div>
                <div className="text-sm font-semibold">{day.day_number}</div>
                {!isFuture && day.total_with_orders > 0 ? (
                  isFullyComplete ? (
                    <div className={`text-[10px] ${isSelected ? 'text-green-400' : 'text-green-500'}`}>
                      <CheckCircle2 className="w-3 h-3 mx-auto" />
                    </div>
                  ) : (
                    <div className={`text-[9px] space-y-0.5 ${isSelected ? 'text-white' : ''}`}>
                      <div className={isSelected ? 'text-blue-300' : 'text-blue-600'}>T: {day.completed}/{day.total_with_orders}</div>
                      <div className={isSelected ? 'text-green-300' : 'text-green-600'}>M: {day.processed}/{day.total_with_orders}</div>
                    </div>
                  )
                ) : !isFuture ? (
                  <div className={`text-[10px] ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>0 kurye</div>
                ) : (
                  <div className="text-[10px]">-</div>
                )}
              </button>
            );
          })}
        </div>
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigateWeek('next')}
          className="h-8 w-8 p-0 shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Aksiyon Butonları */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium">
            {new Date(selectedDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {dateRange && (
            <span className="text-xs text-slate-500">
              ({dateRange.start?.split('T')[1]?.substring(0,5)} - {dateRange.end?.split('T')[1]?.substring(0,5)})
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Geri Al - Sadece SuperAdmin ve işlenmiş seçili varsa */}
          {isSuperAdmin && selectedProcessed.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevert}
              disabled={reverting}
              className="h-9 text-amber-600 border-amber-300 hover:bg-amber-50"
              data-testid="revert-btn"
            >
              {reverting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
              Geri Al ({selectedProcessed.length})
            </Button>
          )}
          
          {/* Sıfırla - Sadece SuperAdmin, kaydedilmiş ama işlenmemiş seçili varsa */}
          {isSuperAdmin && selectedResettable.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetCollection}
              disabled={resetting}
              className="h-9 text-red-600 border-red-300 hover:bg-red-50"
              data-testid="reset-btn"
            >
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Sıfırla ({selectedResettable.length})
            </Button>
          )}
          
          {/* Kaydet */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving || selectedIds.length === 0}
            className="h-9"
            data-testid="save-btn"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Kaydet ({selectedIds.length})
          </Button>
          
          {/* Mütabakat İşle */}
          <Button
            onClick={handleProcess}
            disabled={processing || selectedWithCollection.length === 0}
            className="h-9"
            data-testid="process-btn"
          >
            {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scale className="w-4 h-4 mr-2" />}
            Mütabakat ({selectedWithCollection.length})
          </Button>
        </div>
      </div>

      {/* Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-2 text-slate-500" />
            <p className="text-2xl font-bold text-slate-800">{summary.total_couriers}</p>
            <p className="text-xs text-slate-500">Toplam Kurye</p>
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <ClipboardCheck className="w-5 h-5 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-slate-800">{summary.completed_couriers}</p>
            <p className="text-xs text-slate-500">Tahsilat Girilen</p>
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <div className="w-5 h-5 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-xs font-bold">✓</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{summary.processed_couriers}</p>
            <p className="text-xs text-slate-500">Mütabakat Tamamlanan</p>
          </CardContent>
        </Card>
        <Card className="border bg-white shadow-sm">
          <CardContent className="p-4 text-center">
            <Scale className="w-5 h-5 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold text-slate-800">{selectedIds.length}</p>
            <p className="text-xs text-slate-500">Seçili Kurye</p>
          </CardContent>
        </Card>
      </div>

      {/* Kurye Tablosu */}
      <Card className="border bg-white shadow-sm overflow-hidden">
        <CardHeader className="pb-2 border-b bg-slate-50">
          <CardTitle className="text-sm font-semibold text-slate-700">
            Kurye Listesi
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : couriers.length === 0 ? (
            <div className="text-center p-8 text-slate-500">
              Bu tarih için kurye bulunamadı
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-100">
                    <th className="p-2 w-8">
                      <Checkbox
                        checked={allSelectableSelected}
                        onCheckedChange={handleToggleSelectAll}
                        disabled={selectableCouriers.length === 0}
                      />
                    </th>
                    <th className="text-left p-2 font-semibold text-xs text-slate-600">Kurye</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={2}>Sipariş (Sistem)</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={4}>Tahsilat (Giriş)</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={4}>Fark</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600 w-16">Durum</th>
                  </tr>
                  <tr className="border-b bg-slate-50 text-[10px] text-slate-500">
                    <th></th>
                    <th></th>
                    <th className="p-1 text-center w-14">Nakit</th>
                    <th className="p-1 text-center w-14">Kart</th>
                    <th className="p-1 text-center w-24">Nakit</th>
                    <th className="p-1 text-center w-24">%1</th>
                    <th className="p-1 text-center w-24">%10</th>
                    <th className="p-1 text-center w-24">%20</th>
                    <th className="p-1 text-center">Nakit</th>
                    <th className="p-1 text-center">Kart</th>
                    <th className="p-1 text-center">Y.Yüzde</th>
                    <th className="p-1 text-center">Toplam</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {couriers.map((courier) => {
                    const isSelected = selectedIds.includes(courier.id);
                    const isProcessed = courier.is_processed;
                    const hasOrders = courier.order_data.order_count > 0;
                    const cashDiff = courier.differences?.cash || 0;
                    const cardDiff = courier.differences?.card || 0;
                    
                    // Komisyon farkı hesapla (yanlış yüzde ile tahsil edilen tutar)
                    // Sistem komisyonu (olması gereken)
                    const systemCommission = 
                      (courier.order_data.card_percent_1 * 0.01) +
                      (courier.order_data.card_percent_10 * 0.10) +
                      (courier.order_data.card_percent_20 * 0.20);
                    
                    // Tahsilat komisyonu (kuryenin girdiği)
                    const collectionCommission = 
                      (getCollectionValue(courier, 'card_percent_1') * 0.01) +
                      (getCollectionValue(courier, 'card_percent_10') * 0.10) +
                      (getCollectionValue(courier, 'card_percent_20') * 0.20);
                    
                    // Komisyon farkı (pozitif = kurye fazla komisyon çekmiş, ceza)
                    const commissionPenalty = collectionCommission - systemCommission;
                    
                    // Toplam fark = nakit + kart + komisyon
                    const totalDiff = cashDiff + cardDiff + commissionPenalty;
                    
                    return (
                      <tr 
                        key={courier.id}
                        className={`border-b transition-colors ${
                          isProcessed ? 'bg-green-50/50' : 
                          isSelected ? 'bg-blue-50/50' : 
                          !hasOrders ? 'opacity-50' : 
                          'hover:bg-slate-50'
                        }`}
                        data-testid={`courier-row-${courier.id}`}
                      >
                        <td className="p-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(courier.id)}
                            disabled={!hasOrders && !isProcessed}
                            className={isProcessed && isSelected ? 'data-[state=checked]:bg-amber-500' : ''}
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="font-medium text-slate-800">{courier.name}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                {courier.order_data.order_count} sipariş
                                {courier.order_data.modified_payment_count > 0 && (
                                  <span className="text-amber-600">
                                    ({courier.order_data.modified_payment_count} değiştirilmiş)
                                  </span>
                                )}
                              </div>
                            </div>
                            {courier.order_data.order_count > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => fetchCourierOrders(courier)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Detay
                              </Button>
                            )}
                          </div>
                        </td>
                        
                        {/* Sipariş Verileri (Read-only) - Kompakt */}
                        <td className="p-1 text-center font-mono text-[10px] bg-emerald-50/50 whitespace-nowrap">
                          {formatMoney(courier.order_data.cash_total)}
                        </td>
                        <td className="p-1 text-center font-mono text-[10px] bg-blue-50/50 whitespace-nowrap">
                          {formatMoney(courier.order_data.card_total)}
                        </td>
                        
                        {/* Tahsilat Girişleri (Editable) - Kaydedildikten sonra düzenlenemez */}
                        <td className="p-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCollectionValue(courier, 'cash_amount') || ''}
                            onChange={(e) => handleInputChange(courier.id, 'cash_amount', e.target.value)}
                            disabled={courier.has_collection}
                            className="h-7 text-xs text-center w-24 mx-auto"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCollectionValue(courier, 'card_percent_1') || ''}
                            onChange={(e) => handleInputChange(courier.id, 'card_percent_1', e.target.value)}
                            disabled={courier.has_collection}
                            className="h-7 text-xs text-center w-24 mx-auto"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCollectionValue(courier, 'card_percent_10') || ''}
                            onChange={(e) => handleInputChange(courier.id, 'card_percent_10', e.target.value)}
                            disabled={courier.has_collection}
                            className="h-7 text-xs text-center w-24 mx-auto"
                            placeholder="0"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCollectionValue(courier, 'card_percent_20') || ''}
                            onChange={(e) => handleInputChange(courier.id, 'card_percent_20', e.target.value)}
                            disabled={courier.has_collection}
                            className="h-7 text-xs text-center w-24 mx-auto"
                            placeholder="0"
                          />
                        </td>
                        
                        {/* Farklar - Nakit */}
                        <td className="p-1 text-center">
                          {courier.has_collection ? (
                            <span className={`font-mono text-[10px] font-medium ${
                              cashDiff > 0 ? 'text-red-600' : 
                              cashDiff < 0 ? 'text-blue-600' : 
                              'text-green-600'
                            }`}>
                              {cashDiff !== 0 ? formatMoney(cashDiff) : '✓'}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>
                        
                        {/* Farklar - Kart */}
                        <td className="p-1 text-center">
                          {courier.has_collection ? (
                            <span className={`font-mono text-[10px] font-medium ${
                              cardDiff > 0 ? 'text-red-600' : 
                              cardDiff < 0 ? 'text-blue-600' : 
                              'text-green-600'
                            }`}>
                              {cardDiff !== 0 ? formatMoney(cardDiff) : '✓'}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>
                        
                        {/* Farklar - Yüzde Komisyon Cezası */}
                        <td className="p-1 text-center">
                          {courier.has_collection ? (
                            <span className={`font-mono text-[10px] font-medium ${
                              commissionPenalty > 0.01 ? 'text-red-600' : 
                              commissionPenalty < -0.01 ? 'text-blue-600' : 
                              'text-green-600'
                            }`}>
                              {Math.abs(commissionPenalty) > 0.01 ? formatMoney(commissionPenalty) : '✓'}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>
                        
                        {/* Farklar - Toplam */}
                        <td className="p-1 text-center">
                          {courier.has_collection ? (
                            <span className={`font-mono text-[10px] font-semibold ${
                              totalDiff > 0 ? 'text-red-600' : 
                              totalDiff < 0 ? 'text-blue-600' : 
                              'text-green-600'
                            }`}>
                              {totalDiff !== 0 ? formatMoney(totalDiff) : '✓'}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>
                        
                        {/* Durum */}
                        <td className="p-2 text-center">
                          {isProcessed ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                              isSelected 
                                ? 'text-amber-700 bg-amber-100 border border-amber-300' 
                                : 'text-green-700 bg-green-100'
                            }`}>
                              <CheckCircle2 className="w-3 h-3" />
                              {isSelected ? 'Seçildi' : 'Tamamlandı'}
                            </span>
                          ) : courier.has_collection ? (
                            <span className="text-xs text-blue-600">Kaydedildi</span>
                          ) : hasOrders ? (
                            <span className="text-xs text-slate-400">Bekliyor</span>
                          ) : (
                            <span className="text-xs text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sipariş Detay Modal */}
      <Dialog open={showOrdersModal} onOpenChange={setShowOrdersModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              {selectedCourier?.name} - Sipariş Detayları
            </DialogTitle>
            <p className="text-sm text-muted-foreground">Seçilen tarih için nakit ve kredi kartı siparişleri</p>
          </DialogHeader>
          
          {loadingOrders ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : courierOrders ? (
            <div className="space-y-4">
              {/* Nakit Kart - Özet ve Siparişler Birleşik */}
              <Card className="border-green-200 overflow-hidden">
                <CardContent className="p-0">
                  {/* Özet Başlık */}
                  <div className="bg-green-50 p-4 flex items-center gap-3 border-b border-green-200">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-green-600 font-medium">
                        Nakit ({courierOrders.cash_orders?.length || 0} sipariş)
                      </p>
                      <p className="text-xl font-bold text-green-700">
                        {formatMoney(courierOrders.cash_total)}
                      </p>
                    </div>
                  </div>
                  {/* Sipariş Tablosu */}
                  {courierOrders.cash_orders?.length > 0 && (
                    <div className="p-3 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-green-600">
                            <th className="pb-2 pr-2">Tarih</th>
                            <th className="pb-2 pr-2">Restoran</th>
                            <th className="pb-2 pr-2">Müşteri</th>
                            <th className="pb-2 pr-2">Adres</th>
                            <th className="pb-2 text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {courierOrders.cash_orders.map((order, idx) => (
                            <tr key={idx} className="border-b border-green-100 last:border-0">
                              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{order.created_at}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[120px]" title={order.restaurant_name}>{order.restaurant_name}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[100px]" title={order.customer_name}>{order.customer_name}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[150px]" title={order.delivery_address}>{order.delivery_address}</td>
                              <td className="py-1.5 text-right font-medium">
                                <span className="inline-flex items-center gap-1">
                                  {formatMoney(order.amount)}
                                  {(order.is_split || order.is_modified) && (
                                    <span className="text-amber-500" title={order.is_split ? "Parçalı ödeme" : "Ödeme değiştirildi"}>
                                      <AlertCircle className="w-3 h-3" />
                                    </span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Kredi Kartı - Özet ve Siparişler Birleşik */}
              <Card className="border-blue-200 overflow-hidden">
                <CardContent className="p-0">
                  {/* Özet Başlık */}
                  <div className="bg-blue-50 p-4 flex items-center gap-3 border-b border-blue-200">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-medium">
                        Kredi Kartı ({courierOrders.card_orders?.length || 0} sipariş)
                      </p>
                      <p className="text-xl font-bold text-blue-700">
                        {formatMoney(courierOrders.card_total)}
                      </p>
                    </div>
                  </div>
                  {/* Sipariş Tablosu */}
                  {courierOrders.card_orders?.length > 0 && (
                    <div className="p-3 max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-blue-600">
                            <th className="pb-2 pr-2">Tarih</th>
                            <th className="pb-2 pr-2">Restoran</th>
                            <th className="pb-2 pr-2">Müşteri</th>
                            <th className="pb-2 pr-2">Adres</th>
                            <th className="pb-2 text-right">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {courierOrders.card_orders.map((order, idx) => (
                            <tr key={idx} className="border-b border-blue-100 last:border-0">
                              <td className="py-1.5 pr-2 text-gray-500 whitespace-nowrap">{order.created_at}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[120px]" title={order.restaurant_name}>{order.restaurant_name}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[100px]" title={order.customer_name}>{order.customer_name}</td>
                              <td className="py-1.5 pr-2 truncate max-w-[150px]" title={order.delivery_address}>{order.delivery_address}</td>
                              <td className="py-1.5 text-right font-medium">
                                <span className="inline-flex items-center gap-1">
                                  {formatMoney(order.amount)}
                                  {(order.is_split || order.is_modified) && (
                                    <span className="text-amber-500" title={order.is_split ? "Parçalı ödeme" : "Ödeme değiştirildi"}>
                                      <AlertCircle className="w-3 h-3" />
                                    </span>
                                  )}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Boş Durum */}
              {(!courierOrders.cash_orders?.length && !courierOrders.card_orders?.length) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Bu tarihte sipariş bulunamadı
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sipariş bilgisi yüklenemedi
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
