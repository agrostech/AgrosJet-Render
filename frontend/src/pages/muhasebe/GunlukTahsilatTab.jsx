import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/ui/loading-spinner";
import { 
  Calendar, 
  Check,
  Save,
  Banknote,
  CreditCard,
  Search,
  CheckCircle,
  RotateCcw,
  User,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Dünün tarihini al
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

export default function GunlukTahsilatTab({ companyId, adminId, adminName, isSuperAdmin }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [couriers, setCouriers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({});
  const [collectionStatus, setCollectionStatus] = useState({ cash_collected: false, card_collected: false });
  const [savingCollection, setSavingCollection] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [resetting, setResetting] = useState(false);
  
  // Admin bazlı özet - artık kullanılmıyor ama fetchAdminSummary hala tahsilat sonrası çağrılıyor
  const [adminSummary, setAdminSummary] = useState({ admins: [], grand_total: { cash: 0, card: 0 } });
  
  // Kümülatif (tüm zamanlar) özet
  const [cumulativeSummary, setCumulativeSummary] = useState({ admins: [], grand_total: { cash: 0, card: 0 } });
  const [expandedAdmin, setExpandedAdmin] = useState(null);
  const [resettingCumulative, setResettingCumulative] = useState(null);
  const [cumulativeResetConfirm, setCumulativeResetConfirm] = useState(null);
  
  // Geçmiş modal
  const [historyModal, setHistoryModal] = useState(null); // { admin_id, admin_name }
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchCouriersForDate();
    fetchCollectionStatus();
    fetchAdminSummary();
  }, [companyId, selectedDate]);

  useEffect(() => {
    fetchCumulativeSummary();
  }, [companyId]);

  const fetchCouriersForDate = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/couriers-for-date/${selectedDate}`);
      setCouriers(res.data);
      const initialData = {};
      res.data.forEach(c => {
        initialData[c.id] = { cash: "", c1: "", c10: "", c20: "" };
      });
      setFormData(initialData);
    } catch (err) {
      if (!err.handled) {
        toast.error("Kuryeler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCollectionStatus = async () => {
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/collection-status/${selectedDate}`);
      setCollectionStatus(res.data);
    } catch (err) {
      setCollectionStatus({ cash_collected: false, card_collected: false });
    }
  };

  const fetchAdminSummary = async () => {
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/admin-summary/${selectedDate}`);
      setAdminSummary(res.data);
    } catch (err) {
      setAdminSummary({ admins: [], grand_total: { cash: 0, card: 0 } });
    }
  };

  const fetchCumulativeSummary = async () => {
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/admin-cumulative-summary`);
      setCumulativeSummary(res.data);
    } catch (err) {
      setCumulativeSummary({ admins: [], grand_total: { cash: 0, card: 0 } });
    }
  };

  const handleResetCumulative = async () => {
    if (!cumulativeResetConfirm) return;
    
    // Mevcut bakiyeyi bul
    const admin = cumulativeSummary.admins.find(a => a.admin_id === cumulativeResetConfirm.admin_id);
    const cashTotal = admin?.cash_total || 0;
    const cardTotal = admin?.card_total || 0;
    
    setResettingCumulative(cumulativeResetConfirm.admin_id);
    try {
      await axios.post(`${API}/daily-collections/${companyId}/reset-admin-cumulative`, {
        admin_id: cumulativeResetConfirm.admin_id,
        reset_by_id: adminId,
        reset_by_name: adminName,
        cash_total: cashTotal,
        card_total: cardTotal
      });
      toast.success(`${cumulativeResetConfirm.admin_name} için toplam sıfırlandı`);
      fetchCumulativeSummary();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sıfırlama başarısız");
    } finally {
      setResettingCumulative(null);
      setCumulativeResetConfirm(null);
    }
  };

  const fetchHistory = async (adminId, adminName) => {
    setHistoryModal({ admin_id: adminId, admin_name: adminName });
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/admin-cumulative-history/${adminId}`);
      setHistoryData(res.data.history || []);
    } catch (err) {
      toast.error("Geçmiş yüklenemedi");
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleResetCollection = async () => {
    if (!resetConfirm) return;
    
    setResetting(true);
    try {
      await axios.delete(`${API}/daily-collections/${companyId}/reset-courier-collection`, {
        data: {
          courier_id: resetConfirm.courier_id,
          date: selectedDate,
          admin_id: adminId,
          admin_name: adminName
        }
      });
      toast.success(`${resetConfirm.courier_name} için tahsilat sıfırlandı`);
      fetchCouriersForDate();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Sıfırlama başarısız");
    } finally {
      setResetting(false);
      setResetConfirm(null);
    }
  };

  const handleInputChange = (courierId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [courierId]: { ...prev[courierId], [field]: value }
    }));
  };

  const handleSubmit = async (courier) => {
    const data = formData[courier.id];
    const cash = parseFloat(data.cash) || 0;
    const c1 = parseFloat(data.c1) || 0;
    const c10 = parseFloat(data.c10) || 0;
    const c20 = parseFloat(data.c20) || 0;

    // Sıfır değer kaydına izin ver - artık kontrol yok

    setSubmitting(courier.id);
    try {
      await axios.post(`${API}/daily-collections`, {
        company_id: companyId,
        courier_id: courier.id,
        courier_name: courier.name,
        date: selectedDate,
        cash_amount: cash,
        card_percent_1: c1,
        card_percent_10: c10,
        card_percent_20: c20,
        admin_id: adminId,
        admin_name: adminName
      });
      toast.success(`${courier.name} için tahsilat kaydedildi`);
      fetchCouriersForDate();
      fetchAdminSummary();
      fetchCumulativeSummary();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kayıt başarısız");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount) + ' TL';
  };

  const filteredCouriers = couriers
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (a.has_collection && !b.has_collection) return 1;
      if (!a.has_collection && b.has_collection) return -1;
      return a.name.localeCompare(b.name, 'tr');
    });

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="gunluk-tahsilat-tab">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 border-2 font-mono flex-1 max-w-[180px]"
            data-testid="date-picker"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Kurye ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 border-2 w-full"
              data-testid="search-courier"
            />
          </div>
          <div className="flex gap-3 text-sm justify-end">
            <span className="text-muted-foreground">Kurye: <b>{filteredCouriers.length}</b></span>
            <span className="text-green-600">Kayıtlı: <b>{filteredCouriers.filter(c => c.has_collection).length}</b></span>
          </div>
        </div>
      </div>

      {/* Mobile Cards View */}
      <div className="space-y-3 md:hidden">
        {filteredCouriers.map((courier) => (
          <div 
            key={courier.id}
            className={`border-2 rounded-lg p-3 ${courier.has_collection ? 'bg-green-50/50 border-green-200' : 'bg-white border-border'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {courier.has_collection && <Check className="w-4 h-4 text-green-500" />}
                <span className="font-semibold">{courier.name}</span>
              </div>
              {!courier.has_collection && (
                <Button 
                  size="sm"
                  onClick={() => handleSubmit(courier)}
                  disabled={submitting === courier.id}
                  className="h-8 px-3 bg-primary hover:bg-primary/90"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Kaydet
                </Button>
              )}
            </div>
            
            {courier.has_collection ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-green-100 rounded">
                  <Banknote className="w-3 h-3 text-green-700" />
                  <span className="text-green-700">Nakit:</span>
                  <span className="font-mono font-semibold">{courier.collection.cash_total || '-'}</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-100 rounded">
                  <CreditCard className="w-3 h-3 text-blue-700" />
                  <span className="text-blue-700">%1:</span>
                  <span className="font-mono font-semibold">{courier.collection.card_percent_1 || '-'}</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-100 rounded">
                  <span className="text-blue-700">%10:</span>
                  <span className="font-mono font-semibold">{courier.collection.card_percent_10 || '-'}</span>
                </div>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-100 rounded">
                  <span className="text-blue-700">%20:</span>
                  <span className="font-mono font-semibold">{courier.collection.card_percent_20 || '-'}</span>
                </div>
                {/* SuperAdmin Reset Button */}
                {isSuperAdmin && (
                  <div className="col-span-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResetConfirm({ courier_id: courier.id, courier_name: courier.name })}
                      className="w-full h-8 text-xs border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Sıfırla
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3" /> Nakit
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={formData[courier.id]?.cash || ""}
                    onChange={(e) => handleInputChange(courier.id, "cash", e.target.value)}
                    className="h-9 border font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <CreditCard className="w-3 h-3" /> %1
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={formData[courier.id]?.c1 || ""}
                    onChange={(e) => handleInputChange(courier.id, "c1", e.target.value)}
                    className="h-9 border font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">%10</label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={formData[courier.id]?.c10 || ""}
                    onChange={(e) => handleInputChange(courier.id, "c10", e.target.value)}
                    className="h-9 border font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">%20</label>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={formData[courier.id]?.c20 || ""}
                    onChange={(e) => handleInputChange(courier.id, "c20", e.target.value)}
                    className="h-9 border font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white border-2 border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b-2 border-border">
              <tr>
                <th className="text-left p-2 pl-3 font-semibold w-48">Kurye</th>
                <th className="text-left p-2 font-semibold w-24">
                  <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />Nakit</span>
                </th>
                <th className="text-left p-2 font-semibold w-24">
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />%1</span>
                </th>
                <th className="text-left p-2 font-semibold w-24">%10</th>
                <th className="text-left p-2 font-semibold w-24">%20</th>
                <th className="text-center p-2 font-semibold w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCouriers.map((courier) => (
                <tr 
                  key={courier.id} 
                  className={`border-b border-border hover:bg-slate-50 ${courier.has_collection ? 'bg-green-50/30' : ''}`}
                >
                  <td className="p-2 pl-3">
                    <div className="flex items-center gap-2">
                      {courier.has_collection && <Check className="w-4 h-4 text-green-500 flex-shrink-0" />}
                      <span className="font-medium truncate">{courier.name}</span>
                    </div>
                  </td>
                  {courier.has_collection ? (
                    <>
                      <td className="p-1">
                        <div className="h-8 w-24 flex items-center font-mono text-xs px-2 bg-green-50 rounded border border-green-200 text-green-700">
                          {courier.collection.cash_total > 0 ? courier.collection.cash_total : '-'}
                        </div>
                      </td>
                      <td className="p-1">
                        <div className="h-8 w-24 flex items-center font-mono text-xs px-2 bg-green-50 rounded border border-green-200 text-green-700">
                          {courier.collection.card_percent_1 > 0 ? courier.collection.card_percent_1 : '-'}
                        </div>
                      </td>
                      <td className="p-1">
                        <div className="h-8 w-24 flex items-center font-mono text-xs px-2 bg-green-50 rounded border border-green-200 text-green-700">
                          {courier.collection.card_percent_10 > 0 ? courier.collection.card_percent_10 : '-'}
                        </div>
                      </td>
                      <td className="p-1">
                        <div className="h-8 w-24 flex items-center font-mono text-xs px-2 bg-green-50 rounded border border-green-200 text-green-700">
                          {courier.collection.card_percent_20 > 0 ? courier.collection.card_percent_20 : '-'}
                        </div>
                      </td>
                      <td className="p-1 text-center">
                        {isSuperAdmin && (
                          <Button 
                            size="sm"
                            variant="ghost"
                            onClick={() => setResetConfirm({ courier_id: courier.id, courier_name: courier.name })}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Sıfırla"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={formData[courier.id]?.cash || ""}
                          onChange={(e) => handleInputChange(courier.id, "cash", e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className="h-8 w-24 border font-mono text-xs px-2"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={formData[courier.id]?.c1 || ""}
                          onChange={(e) => handleInputChange(courier.id, "c1", e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className="h-8 w-24 border font-mono text-xs px-2"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={formData[courier.id]?.c10 || ""}
                          onChange={(e) => handleInputChange(courier.id, "c10", e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className="h-8 w-24 border font-mono text-xs px-2"
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={formData[courier.id]?.c20 || ""}
                          onChange={(e) => handleInputChange(courier.id, "c20", e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className="h-8 w-24 border font-mono text-xs px-2"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <Button 
                          size="sm"
                          onClick={() => handleSubmit(courier)}
                          disabled={submitting === courier.id}
                          className="h-8 w-8 p-0 bg-primary hover:bg-primary/90"
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kümülatif (Tüm Zamanlar) Yönetici Tahsilat Özeti - Sadece SuperAdmin için */}
      {isSuperAdmin && cumulativeSummary.admins.length > 0 && (
        <div className="border-2 border-primary/30 rounded-lg bg-primary/5 overflow-hidden">
          <div className="p-3 border-b border-primary/20 bg-primary/10">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-primary">Kümülatif Tahsilat (Tüm Zamanlar)</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <Banknote className="w-3 h-3 text-green-600" />
                  <span className="text-green-700 font-medium">{formatMoney(cumulativeSummary.grand_total.cash)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700 font-medium">{formatMoney(cumulativeSummary.grand_total.card)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-primary/10">
            {cumulativeSummary.admins.filter(a => a.cash_total > 0 || a.card_total > 0).map((admin) => (
              <div key={admin.admin_id} className="p-3">
                {/* Admin Header - tıklanabilir */}
                <div 
                  className="flex items-center justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedAdmin(expandedAdmin === admin.admin_id ? null : admin.admin_id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{admin.admin_name}</p>
                      <p className="text-xs text-muted-foreground">{admin.record_count} kayıt</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-600 font-mono font-semibold">{formatMoney(admin.cash_total)}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-blue-600 font-mono font-semibold">{formatMoney(admin.card_total)}</span>
                      </div>
                    </div>
                    {expandedAdmin === admin.admin_id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                
                {/* Detaylı Kayıtlar - genişletildiğinde */}
                {expandedAdmin === admin.admin_id && (
                  <div className="mt-3 pt-3 border-t border-primary/10">
                    {/* Sıfırla butonu */}
                    <div className="flex justify-end mb-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setCumulativeResetConfirm({ admin_id: admin.admin_id, admin_name: admin.admin_name }); }}
                        disabled={resettingCumulative === admin.admin_id}
                        className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 px-3"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Sıfırla
                      </Button>
                    </div>
                    
                    {/* Kayıt listesi */}
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {admin.records?.map((rec, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-2 px-3 bg-white rounded border border-primary/10">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-mono text-muted-foreground whitespace-nowrap">{rec.date}</span>
                            <span className="truncate font-medium">{rec.courier_name}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {rec.cash_amount > 0 && (
                              <span className="text-green-600 font-mono flex items-center gap-1">
                                <Banknote className="w-3 h-3" />
                                {rec.cash_amount.toLocaleString('tr-TR')}
                              </span>
                            )}
                            {rec.card_total > 0 && (
                              <span className="text-blue-600 font-mono flex items-center gap-1">
                                <CreditCard className="w-3 h-3" />
                                {rec.card_total.toLocaleString('tr-TR')}
                              </span>
                            )}
                            {rec.cash_amount === 0 && rec.card_total === 0 && (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={!!resetConfirm} onOpenChange={(open) => !open && setResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tahsilat Sıfırlama</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{resetConfirm?.courier_name}</strong> için <strong>{selectedDate}</strong> tarihli tüm tahsilat kayıtları silinecek.
              <br /><br />
              Bu işlem geri alınamaz. Kurye tekrar veri girişi yapabilir hale gelecektir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetCollection}
              disabled={resetting}
              className="bg-red-500 hover:bg-red-600"
            >
              {resetting ? "Sıfırlanıyor..." : "Sıfırla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cumulative Reset Confirmation Dialog */}
      <AlertDialog open={!!cumulativeResetConfirm} onOpenChange={(open) => !open && setCumulativeResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kümülatif Tahsilat Sıfırlama</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{cumulativeResetConfirm?.admin_name}</strong> için tüm zamanların tahsilat toplamı sıfırlanacak.
              <br /><br />
              Bu işlem kayıtları silmez, sadece yeni bir başlangıç noktası belirler. Bu tarihten sonraki tahsilatlar tekrar birikmeye başlayacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingCumulative}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetCumulative}
              disabled={resettingCumulative}
              className="bg-red-500 hover:bg-red-600"
            >
              {resettingCumulative ? "Sıfırlanıyor..." : "Sıfırla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
