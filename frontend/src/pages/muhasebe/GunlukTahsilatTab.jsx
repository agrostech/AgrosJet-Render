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
  
  // Admin bazlı özet
  const [adminSummary, setAdminSummary] = useState({ admins: [], grand_total: { cash: 0, card: 0 } });
  const [expandedAdmin, setExpandedAdmin] = useState(null);
  const [markingAdmin, setMarkingAdmin] = useState(null);

  useEffect(() => {
    fetchCouriersForDate();
    fetchCollectionStatus();
    fetchAdminSummary();
  }, [companyId, selectedDate]);

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

  const handleMarkAdminCollected = async (targetAdminId, type) => {
    setMarkingAdmin(`${targetAdminId}-${type}`);
    try {
      await axios.post(`${API}/daily-collections/${companyId}/mark-admin-collected`, {
        date: selectedDate,
        admin_id: targetAdminId,
        type: type,
        collected_by_id: adminId,
        collected_by_name: adminName
      });
      toast.success(`${type === 'cash' ? 'Nakit' : 'Kart'} alındı olarak işaretlendi`);
      fetchAdminSummary();
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem başarısız");
      }
    } finally {
      setMarkingAdmin(null);
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

    if (cash === 0 && c1 === 0 && c10 === 0 && c20 === 0) {
      toast.error("En az bir değer girin");
      return;
    }

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

      {/* Yönetici Bazlı Tahsilat Özeti */}
      {adminSummary.admins.length > 0 && (
        <div className="border-2 border-border rounded-lg bg-white overflow-hidden">
          <div className="p-3 border-b border-border bg-slate-50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Yönetici Bazlı Tahsilat</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <Banknote className="w-3 h-3 text-green-600" />
                  <span className="text-green-700 font-medium">{formatMoney(adminSummary.grand_total.cash)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-blue-600" />
                  <span className="text-blue-700 font-medium">{formatMoney(adminSummary.grand_total.card)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            {adminSummary.admins.map((admin) => (
              <div key={admin.admin_id} className="p-3">
                <div 
                  className="flex items-center justify-between cursor-pointer gap-2"
                  onClick={() => setExpandedAdmin(expandedAdmin === admin.admin_id ? null : admin.admin_id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{admin.admin_name}</p>
                      <p className="text-xs text-muted-foreground">{admin.courier_count} kurye</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-600 font-mono font-semibold">{formatMoney(admin.cash_total)}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-blue-600 font-mono font-semibold">{formatMoney(admin.card_total)}</span>
                      </div>
                    </div>
                    {expandedAdmin === admin.admin_id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </div>
                
                {/* Expanded details */}
                {expandedAdmin === admin.admin_id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {/* Kurye detayları */}
                    <div className="space-y-1.5 mb-3">
                      {admin.records.map((rec, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 bg-slate-50 rounded">
                          <span className="truncate mr-2">{rec.courier_name}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {rec.cash_amount > 0 && (
                              <span className="text-green-600 font-mono flex items-center gap-0.5">
                                <Banknote className="w-3 h-3" />
                                {rec.cash_amount.toLocaleString('tr-TR')}
                              </span>
                            )}
                            {rec.card_total > 0 && (
                              <span className="text-blue-600 font-mono flex items-center gap-0.5">
                                <CreditCard className="w-3 h-3" />
                                {rec.card_total.toLocaleString('tr-TR')}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Alındı butonları - sadece SuperAdmin */}
                    {isSuperAdmin && (
                      <div className="grid grid-cols-2 gap-2">
                        {/* Nakit Alındı */}
                        <div className={`flex flex-col gap-1 px-3 py-2 rounded border ${admin.cash_collected ? 'bg-green-100 border-green-300' : 'bg-green-50 border-green-200'}`}>
                          <div className="flex items-center gap-1 text-green-700">
                            <Banknote className="w-3.5 h-3.5" />
                            <span className="text-xs">Nakit</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-sm text-green-800">{formatMoney(admin.cash_total)}</span>
                            {admin.cash_collected ? (
                              <div className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle className="w-3 h-3" />
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handleMarkAdminCollected(admin.admin_id, 'cash'); }}
                                disabled={markingAdmin === `${admin.admin_id}-cash`}
                                className="h-6 text-xs border-green-400 text-green-700 hover:bg-green-100 px-2"
                              >
                                {markingAdmin === `${admin.admin_id}-cash` ? '...' : 'Al'}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Kart Alındı */}
                        <div className={`flex flex-col gap-1 px-3 py-2 rounded border ${admin.card_collected ? 'bg-blue-100 border-blue-300' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex items-center gap-1 text-blue-700">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="text-xs">Kart</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-sm text-blue-800">{formatMoney(admin.card_total)}</span>
                            {admin.card_collected ? (
                              <div className="flex items-center gap-1 text-blue-600 text-xs">
                                <CheckCircle className="w-3 h-3" />
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => { e.stopPropagation(); handleMarkAdminCollected(admin.admin_id, 'card'); }}
                                disabled={markingAdmin === `${admin.admin_id}-card`}
                                className="h-6 text-xs border-blue-400 text-blue-700 hover:bg-blue-100 px-2"
                              >
                                {markingAdmin === `${admin.admin_id}-card` ? '...' : 'Al'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Normal admin için sadece görüntüleme */}
                    {!isSuperAdmin && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`flex flex-col gap-1 px-3 py-2 rounded border ${admin.cash_collected ? 'bg-green-100 border-green-300' : 'bg-green-50 border-green-200'}`}>
                          <div className="flex items-center gap-1 text-green-700">
                            <Banknote className="w-3.5 h-3.5" />
                            <span className="text-xs">Nakit</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-sm">{formatMoney(admin.cash_total)}</span>
                            {admin.cash_collected && <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                          </div>
                        </div>
                        <div className={`flex flex-col gap-1 px-3 py-2 rounded border ${admin.card_collected ? 'bg-blue-100 border-blue-300' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex items-center gap-1 text-blue-700">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span className="text-xs">Kart</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold font-mono text-sm">{formatMoney(admin.card_total)}</span>
                            {admin.card_collected && <CheckCircle className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                        </div>
                      </div>
                    )}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
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
    </div>
  );
}
