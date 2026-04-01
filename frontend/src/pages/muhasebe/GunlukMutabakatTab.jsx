import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Calendar, 
  Save, 
  CheckCircle2, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Eye,
  Banknote,
  CreditCard,
  AlertCircle,
  Users
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Para formatı
const formatMoney = (amount) => {
  if (!amount && amount !== 0) return "0,00 TL";
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

// Dünün tarihini al (local timezone)
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function GunlukMutabakatTab({ companyId, adminId, adminName, isSuperAdmin }) {
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [loading, setLoading] = useState(false);
  
  const [couriers, setCouriers] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [summary, setSummary] = useState({ total_couriers: 0, completed_couriers: 0, processed_couriers: 0 });
  const [weeklyData, setWeeklyData] = useState(null);
  const [hasMealCardCollection, setHasMealCardCollection] = useState(false);
  
  const [editedCollections, setEditedCollections] = useState({});
  const [savingCourierId, setSavingCourierId] = useState(null);
  const [revertingCourierId, setRevertingCourierId] = useState(null);
  
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
      setEditedCollections({});
    } catch (err) {
      toast.error("Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedDate]);

  // Haftalık özet
  const fetchWeeklySummary = useCallback(async (weekStart = null) => {
    try {
      const params = weekStart ? { week_start: weekStart } : {};
      const res = await axios.get(`${API}/daily-mutabakat/${companyId}/weekly-summary`, { params });
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
  }, [fetchData]);
  
  // İlk yüklemede haftalık özeti çek (dünün haftası)
  useEffect(() => {
    // Dünün hangi haftada olduğunu hesapla
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayOfWeek = yesterday.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Pazartesiye git
    const weekStart = new Date(yesterday);
    weekStart.setDate(yesterday.getDate() + mondayOffset);
    
    // Local tarih formatı (timezone sorunu olmadan)
    const year = weekStart.getFullYear();
    const month = String(weekStart.getMonth() + 1).padStart(2, '0');
    const day = String(weekStart.getDate()).padStart(2, '0');
    const weekStartStr = `${year}-${month}-${day}`;
    
    fetchWeeklySummary(weekStartStr);
  }, [companyId, fetchWeeklySummary]);

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

  // Tek kurye kaydet ve mütabakat işle
  const handleSaveSingleCourier = async (courier) => {
    setSavingCourierId(courier.id);
    try {
      await axios.post(`${API}/daily-mutabakat/${companyId}/save-and-process-single-courier`, {
        courier_id: courier.id,
        courier_name: courier.name,
        date: selectedDate,
        start_datetime: dateRange?.start,
        end_datetime: dateRange?.end,
        cash_amount: getCollectionValue(courier, 'cash_amount'),
        card_percent_1: getCollectionValue(courier, 'card_percent_1'),
        card_percent_10: getCollectionValue(courier, 'card_percent_10'),
        card_percent_20: getCollectionValue(courier, 'card_percent_20'),
        meal_card_amount: getCollectionValue(courier, 'meal_card_amount'),
        admin_id: adminId,
        admin_name: adminName,
        // Sipariş verileri
        order_cash: courier.order_data.cash_total,
        order_card_1: courier.order_data.card_percent_1,
        order_card_10: courier.order_data.card_percent_10,
        order_card_20: courier.order_data.card_percent_20
      });

      toast.success(`${courier.name} mütabakatı tamamlandı`);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSavingCourierId(null);
    }
  };

  // Tek kurye sıfırla (sadece süper admin)
  const handleRevertSingleCourier = async (courier) => {
    if (!window.confirm(`${courier.name} için mütabakatı sıfırlamak istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
      return;
    }
    
    setRevertingCourierId(courier.id);
    try {
      await axios.post(`${API}/daily-mutabakat/${companyId}/revert-single-courier`, {
        courier_id: courier.id,
        date: selectedDate,
        admin_id: adminId,
        admin_name: adminName
      });

      toast.success(`${courier.name} mütabakatı sıfırlandı`);
      fetchData();
      fetchWeeklySummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sıfırlama başarısız");
    } finally {
      setRevertingCourierId(null);
    }
  };

  // Hafta navigasyonu
  const navigateWeek = async (direction) => {
    if (!weeklyData) return;
    const currentStart = new Date(weeklyData.week_start + 'T12:00:00'); // Öğlen saati ekle timezone sorunu için
    const newStart = new Date(currentStart);
    newStart.setDate(newStart.getDate() + (direction === 'prev' ? -7 : 7));
    
    // Local tarih formatı
    const year = newStart.getFullYear();
    const month = String(newStart.getMonth() + 1).padStart(2, '0');
    const day = String(newStart.getDate()).padStart(2, '0');
    const newStartStr = `${year}-${month}-${day}`;
    
    // Önce yeni haftanın verilerini çek
    await fetchWeeklySummary(newStartStr);
    setSelectedDate(newStartStr);
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
                    <div className={`text-[10px] font-medium ${isSelected ? 'text-blue-300' : 'text-blue-600'}`}>
                      {day.processed}/{day.total_with_orders}
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

      {/* Tarih Bilgisi */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium">
          {new Date(selectedDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        {dateRange?.label && (
          <span className="text-xs text-slate-500">
            ({dateRange.label})
          </span>
        )}
      </div>

      {/* Özet Kartları - 5 Kart */}
      {(() => {
        // Bekleyen (mütabakatı yapılmamış) kuryeler
        const pendingCouriers = couriers.filter(c => !c.is_processed && c.order_data.order_count > 0);
        const pendingCash = pendingCouriers.reduce((sum, c) => sum + (c.order_data.cash_total || 0), 0);
        const pendingCard = pendingCouriers.reduce((sum, c) => sum + (c.order_data.card_total || 0), 0);
        
        // İşlenmiş (mütabakatı yapılmış) kuryeler
        const processedCouriers = couriers.filter(c => c.is_processed);
        const processedCash = processedCouriers.reduce((sum, c) => sum + (c.order_data.cash_total || 0), 0);
        const processedCard = processedCouriers.reduce((sum, c) => sum + (c.order_data.card_total || 0), 0);
        
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-3 text-center">
                <Users className="w-4 h-4 mx-auto mb-1 text-slate-500" />
                <p className="text-xl font-bold text-slate-800">{summary.total_couriers}</p>
                <p className="text-[10px] text-slate-500">Toplam Kurye</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-3 text-center">
                <Banknote className="w-4 h-4 mx-auto mb-1 text-green-600" />
                <p className="text-lg font-bold text-slate-800">{formatMoney(pendingCash)}</p>
                <p className="text-[10px] text-slate-500">Bekleyen Nakit</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-3 text-center">
                <CreditCard className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                <p className="text-lg font-bold text-slate-800">{formatMoney(pendingCard)}</p>
                <p className="text-[10px] text-slate-500">Bekleyen Kart</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-3 text-center">
                <Banknote className="w-4 h-4 mx-auto mb-1 text-green-600" />
                <p className="text-lg font-bold text-slate-800">{formatMoney(processedCash)}</p>
                <p className="text-[10px] text-slate-500">İşlenen Nakit</p>
              </CardContent>
            </Card>
            <Card className="border bg-white shadow-sm">
              <CardContent className="p-3 text-center">
                <CreditCard className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                <p className="text-lg font-bold text-slate-800">{formatMoney(processedCard)}</p>
                <p className="text-[10px] text-slate-500">İşlenen Kart</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

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
            <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-100">
                    <th className="text-left p-2 font-semibold text-xs text-slate-600">Kurye</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={hasMealCardCollection ? 3 : 2}>Sipariş (Sistem)</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={hasMealCardCollection ? 5 : 4}>Tahsilat (Giriş)</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600" colSpan={4}>Fark</th>
                    <th className="text-center p-2 font-semibold text-xs text-slate-600 w-28">İşlem</th>
                  </tr>
                  <tr className="border-b bg-slate-50 text-[10px] text-slate-500">
                    <th></th>
                    <th className="p-1 text-center w-14">Nakit</th>
                    <th className="p-1 text-center w-14">Kart</th>
                    {hasMealCardCollection && <th className="p-1 text-center w-14">Y.Kartı</th>}
                    <th className="p-1 text-center w-24">Nakit</th>
                    <th className="p-1 text-center w-24">%1</th>
                    <th className="p-1 text-center w-24">%10</th>
                    <th className="p-1 text-center w-24">%20</th>
                    {hasMealCardCollection && <th className="p-1 text-center w-24">Y.Kartı</th>}
                    <th className="p-1 text-center">Nakit</th>
                    <th className="p-1 text-center">Kart</th>
                    <th className="p-1 text-center">Y.Yüzde</th>
                    <th className="p-1 text-center">Toplam</th>
                    <th className="p-1 text-center w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {couriers.map((courier) => {
                    const isProcessed = courier.is_processed;
                    const hasOrders = courier.order_data.order_count > 0;
                    const isSaving = savingCourierId === courier.id;
                    const isReverting = revertingCourierId === courier.id;
                    
                    const cashDiff = courier.differences?.cash || 0;
                    const cardDiff = courier.differences?.card || 0;
                    
                    // Komisyon farkı hesapla
                    const systemCommission = 
                      (courier.order_data.card_percent_1 * 0.01) +
                      (courier.order_data.card_percent_10 * 0.10) +
                      (courier.order_data.card_percent_20 * 0.20);
                    
                    const collectionCommission = 
                      (getCollectionValue(courier, 'card_percent_1') * 0.01) +
                      (getCollectionValue(courier, 'card_percent_10') * 0.10) +
                      (getCollectionValue(courier, 'card_percent_20') * 0.20);
                    
                    const commissionPenalty = collectionCommission - systemCommission;
                    const totalDiff = cashDiff + cardDiff + commissionPenalty;
                    
                    return (
                      <tr 
                        key={courier.id}
                        className={`border-b transition-colors ${
                          isProcessed ? 'bg-green-50/50' : 
                          !hasOrders ? 'opacity-50' : 
                          'hover:bg-slate-50'
                        }`}
                        data-testid={`courier-row-${courier.id}`}
                      >
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
                        
                        {/* Sipariş Verileri (Read-only) */}
                        <td className="p-1 text-center font-mono text-[10px] bg-emerald-50/50 whitespace-nowrap">
                          {formatMoney(courier.order_data.cash_total)}
                        </td>
                        <td className="p-1 text-center font-mono text-[10px] bg-blue-50/50 whitespace-nowrap">
                          {formatMoney(courier.order_data.card_total)}
                        </td>
                        {hasMealCardCollection && (
                          <td className="p-1 text-center font-mono text-[10px] bg-orange-50/50 whitespace-nowrap">
                            {formatMoney(courier.order_data.meal_card_total || 0)}
                          </td>
                        )}
                        
                        {/* Tahsilat Girişleri (Editable - işlenmemişse) */}
                        <td className="p-1 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={getCollectionValue(courier, 'cash_amount') || ''}
                            onChange={(e) => handleInputChange(courier.id, 'cash_amount', e.target.value)}
                            disabled={isProcessed}
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
                            disabled={isProcessed}
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
                            disabled={isProcessed}
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
                            disabled={isProcessed}
                            className="h-7 text-xs text-center w-24 mx-auto"
                            placeholder="0"
                          />
                        </td>
                        
                        {/* Yemek Kartı */}
                        {hasMealCardCollection && (
                          <td className="p-1 text-center">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={getCollectionValue(courier, 'meal_card_amount') || ''}
                              onChange={(e) => handleInputChange(courier.id, 'meal_card_amount', e.target.value)}
                              disabled={isProcessed}
                              className="h-7 text-xs text-center w-24 mx-auto"
                              placeholder="0"
                            />
                          </td>
                        )}
                        
                        {/* Farklar - Nakit */}
                        <td className="p-1 text-center">
                          {courier.has_collection || isProcessed ? (
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
                          {courier.has_collection || isProcessed ? (
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
                        
                        {/* Farklar - Yüzde Komisyon */}
                        <td className="p-1 text-center">
                          {courier.has_collection || isProcessed ? (
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
                          {courier.has_collection || isProcessed ? (
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
                        
                        {/* İşlem Butonları */}
                        <td className="p-2 text-center">
                          {isProcessed ? (
                            <div className="flex items-center justify-center gap-1">
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded text-green-700 bg-green-100">
                                <CheckCircle2 className="w-3 h-3" />
                                Tamam
                              </span>
                              {isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevertSingleCourier(courier)}
                                  disabled={isReverting}
                                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`revert-btn-${courier.id}`}
                                  title="Mütabakatı Sıfırla"
                                >
                                  {isReverting ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                          ) : hasOrders ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSaveSingleCourier(courier)}
                              disabled={isSaving}
                              className="h-7 px-3 text-xs"
                              data-testid={`save-btn-${courier.id}`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3 mr-1" />
                              )}
                              Kaydet
                            </Button>
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

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {couriers.map((courier) => {
                const isProcessed = courier.is_processed;
                const hasOrders = courier.order_data.order_count > 0;
                const isSaving = savingCourierId === courier.id;
                const isReverting = revertingCourierId === courier.id;
                const cashDiff = courier.differences?.cash || 0;
                const cardDiff = courier.differences?.card || 0;
                const totalDiff = cashDiff + cardDiff;

                return (
                  <div key={courier.id} className={`p-3 ${isProcessed ? 'bg-green-50/50' : !hasOrders ? 'opacity-50' : ''}`} data-testid={`mobile-courier-${courier.id}`}>
                    {/* Kurye Adı + İşlem */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button onClick={() => hasOrders && fetchCourierOrders(courier)} className={`font-semibold text-sm truncate ${hasOrders ? 'text-primary hover:underline' : 'text-slate-500'}`} data-testid={`mobile-courier-name-${courier.id}`}>
                          {courier.name}
                        </button>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{courier.order_data.order_count} sip.</span>
                      </div>
                      {isProcessed ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded text-green-700 bg-green-100">
                            <CheckCircle2 className="w-3 h-3" /> Tamam
                          </span>
                          {isSuperAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => handleRevertSingleCourier(courier)} disabled={isReverting} className="h-6 w-6 p-0 text-red-600 hover:bg-red-50">
                              {isReverting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      ) : hasOrders ? (
                        <Button variant="default" size="sm" onClick={() => handleSaveSingleCourier(courier)} disabled={isSaving} className="h-7 px-2 text-[10px] flex-shrink-0" data-testid={`mobile-save-btn-${courier.id}`}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Kaydet</>}
                        </Button>
                      ) : null}
                    </div>

                    {/* Sipariş Özeti */}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-2">
                      <div className="bg-emerald-50 rounded p-1.5 text-center">
                        <p className="text-emerald-600">Nakit</p>
                        <p className="font-semibold">{formatMoney(courier.order_data.cash_total)}</p>
                      </div>
                      <div className="bg-blue-50 rounded p-1.5 text-center">
                        <p className="text-blue-600">Kart</p>
                        <p className="font-semibold">{formatMoney(courier.order_data.card_total)}</p>
                      </div>
                      <div className="bg-slate-100 rounded p-1.5 text-center">
                        <p className="text-slate-600">Toplam</p>
                        <p className="font-bold">{formatMoney((courier.order_data.cash_total || 0) + (courier.order_data.card_total || 0))}</p>
                      </div>
                    </div>

                    {/* Tahsilat Inputları */}
                    {!isProcessed && hasOrders && (
                      <div className="space-y-1.5 mb-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Nakit Tahsilat</label>
                            <Input type="number" min="0" step="0.01" value={getCollectionValue(courier, 'cash_amount') || ''} onChange={(e) => handleInputChange(courier.id, 'cash_amount', e.target.value)} className="h-7 text-xs" placeholder="0" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Kart %1</label>
                            <Input type="number" min="0" step="0.01" value={getCollectionValue(courier, 'card_percent_1') || ''} onChange={(e) => handleInputChange(courier.id, 'card_percent_1', e.target.value)} className="h-7 text-xs" placeholder="0" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Kart %10</label>
                            <Input type="number" min="0" step="0.01" value={getCollectionValue(courier, 'card_percent_10') || ''} onChange={(e) => handleInputChange(courier.id, 'card_percent_10', e.target.value)} className="h-7 text-xs" placeholder="0" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Kart %20</label>
                            <Input type="number" min="0" step="0.01" value={getCollectionValue(courier, 'card_percent_20') || ''} onChange={(e) => handleInputChange(courier.id, 'card_percent_20', e.target.value)} className="h-7 text-xs" placeholder="0" />
                          </div>
                        </div>
                        {hasMealCardCollection && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[10px] text-muted-foreground">Yemek Kartı</label>
                              <Input type="number" min="0" step="0.01" value={getCollectionValue(courier, 'meal_card_amount') || ''} onChange={(e) => handleInputChange(courier.id, 'meal_card_amount', e.target.value)} className="h-7 text-xs" placeholder="0" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fark Gösterimi */}
                    {(courier.has_collection || isProcessed) && (
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-muted-foreground">Fark:</span>
                        <span className={`font-mono font-medium ${totalDiff > 0 ? 'text-red-600' : totalDiff < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                          {totalDiff !== 0 ? formatMoney(totalDiff) : '✓ Eşleşti'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </>
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
              {/* Nakit Kart */}
              <Card className="border-green-200 overflow-hidden">
                <CardContent className="p-0">
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

              {/* Kredi Kartı */}
              <Card className="border-blue-200 overflow-hidden">
                <CardContent className="p-0">
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
