import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoading } from "@/components/ui/loading-spinner";
import { 
  Calendar, 
  User, 
  Banknote, 
  CreditCard, 
  Check, 
  ChevronDown,
  ChevronUp,
  Save
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GunlukTahsilatTab({ companyId, adminId, adminName }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [couriers, setCouriers] = useState([]);
  const [expandedCourier, setExpandedCourier] = useState(null);
  
  // Form state for each courier
  const [formData, setFormData] = useState({
    cash_amount: "",
    card_percent_1: "",
    card_percent_10: "",
    card_percent_20: ""
  });

  useEffect(() => {
    fetchCouriersForDate();
  }, [companyId, selectedDate]);

  const fetchCouriersForDate = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/couriers-for-date/${selectedDate}`);
      setCouriers(res.data);
    } catch (err) {
      if (!err.handled) {
        toast.error("Kuryeler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (courier) => {
    // Validate at least one field has value
    const cash = parseFloat(formData.cash_amount) || 0;
    const card1 = parseFloat(formData.card_percent_1) || 0;
    const card10 = parseFloat(formData.card_percent_10) || 0;
    const card20 = parseFloat(formData.card_percent_20) || 0;

    if (cash === 0 && card1 === 0 && card10 === 0 && card20 === 0) {
      toast.error("En az bir değer girilmelidir");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API}/daily-collections`, {
        company_id: companyId,
        courier_id: courier.id,
        courier_name: courier.name,
        date: selectedDate,
        cash_amount: cash,
        card_percent_1: card1,
        card_percent_10: card10,
        card_percent_20: card20,
        admin_id: adminId,
        admin_name: adminName
      });
      
      toast.success(`${courier.name} için tahsilat kaydedildi`);
      setFormData({
        cash_amount: "",
        card_percent_1: "",
        card_percent_10: "",
        card_percent_20: ""
      });
      setExpandedCourier(null);
      fetchCouriersForDate();
    } catch (err) {
      if (!err.handled) {
        toast.error("Kayıt başarısız");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (val) => {
    if (!val && val !== 0) return "₺0";
    return `₺${val.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
  };

  const toggleCourier = (courierId) => {
    if (expandedCourier === courierId) {
      setExpandedCourier(null);
      setFormData({
        cash_amount: "",
        card_percent_1: "",
        card_percent_10: "",
        card_percent_20: ""
      });
    } else {
      setExpandedCourier(courierId);
      setFormData({
        cash_amount: "",
        card_percent_1: "",
        card_percent_10: "",
        card_percent_20: ""
      });
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="gunluk-tahsilat-tab">
      {/* Tarih Seçimi */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white border-2 border-border p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <Label className="text-sm font-semibold">Tarih Seçin</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 h-10 border-2 font-mono w-44"
              data-testid="date-picker"
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Toplam Kurye</p>
          <p className="text-xl font-bold">{couriers.length}</p>
        </div>
      </div>

      {/* Kurye Listesi */}
      <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <h3 className="font-heading font-bold text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Kurye Tahsilat Girişi
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Kuryeye tıklayıp nakit ve Z raporu değerlerini girin. Kayıtlar düzenlenemez.
          </p>
        </div>

        <div className="divide-y divide-border max-h-[calc(100vh-380px)] overflow-y-auto">
          {couriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Bu tarih için kurye bulunamadı
            </p>
          ) : (
            couriers.map((courier) => (
              <div key={courier.id} className="transition-colors">
                {/* Kurye Header */}
                <div 
                  onClick={() => toggleCourier(courier.id)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 flex items-center justify-between ${
                    expandedCourier === courier.id ? 'bg-primary/5' : ''
                  }`}
                  data-testid={`courier-row-${courier.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      courier.has_collection ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {courier.has_collection ? <Check className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold">{courier.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{courier.phone}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {courier.has_collection && (
                      <div className="text-right">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1 text-green-600">
                            <Banknote className="w-4 h-4" />
                            {formatMoney(courier.collection.cash_total)}
                          </span>
                          <span className="flex items-center gap-1 text-blue-600">
                            <CreditCard className="w-4 h-4" />
                            {formatMoney(courier.collection.card_total)}
                          </span>
                        </div>
                      </div>
                    )}
                    {expandedCourier === courier.id ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded Form */}
                {expandedCourier === courier.id && (
                  <div className="p-4 bg-slate-50 border-t border-border">
                    {/* Mevcut Kayıtlar */}
                    {courier.has_collection && courier.collection.records.length > 0 && (
                      <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-xs font-semibold text-green-700 mb-2">
                          Mevcut Kayıtlar ({courier.collection.records.length})
                        </p>
                        <div className="space-y-1">
                          {courier.collection.records.map((record, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {new Date(record.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {record.admin_name}
                              </span>
                              <span className="font-mono">
                                N: {formatMoney(record.cash_amount)} | K: {formatMoney(record.card_total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Yeni Kayıt Formu */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <Label className="text-xs font-semibold flex items-center gap-1">
                          <Banknote className="w-3 h-3" /> Nakit
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.cash_amount}
                          onChange={(e) => setFormData({ ...formData, cash_amount: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="mt-1 h-10 border-2 font-mono"
                          data-testid="cash-input"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> %1 Kart
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.card_percent_1}
                          onChange={(e) => setFormData({ ...formData, card_percent_1: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="mt-1 h-10 border-2 font-mono"
                          data-testid="card-1-input"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> %10 Kart
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.card_percent_10}
                          onChange={(e) => setFormData({ ...formData, card_percent_10: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="mt-1 h-10 border-2 font-mono"
                          data-testid="card-10-input"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> %20 Kart
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.card_percent_20}
                          onChange={(e) => setFormData({ ...formData, card_percent_20: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="mt-1 h-10 border-2 font-mono"
                          data-testid="card-20-input"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button 
                          onClick={() => handleSubmit(courier)}
                          disabled={submitting}
                          className="w-full h-10 bg-primary hover:bg-primary/90"
                          data-testid="save-collection-btn"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {submitting ? "Kaydediliyor..." : "Kaydet"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Özet */}
      {couriers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border-2 border-border p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Kayıtlı Kurye</p>
            <p className="text-xl font-bold text-green-600">
              {couriers.filter(c => c.has_collection).length}
            </p>
          </div>
          <div className="bg-white border-2 border-border p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Toplam Nakit</p>
            <p className="text-xl font-bold font-mono">
              {formatMoney(couriers.reduce((sum, c) => sum + (c.collection?.cash_total || 0), 0))}
            </p>
          </div>
          <div className="bg-white border-2 border-border p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Toplam Kart</p>
            <p className="text-xl font-bold font-mono">
              {formatMoney(couriers.reduce((sum, c) => sum + (c.collection?.card_total || 0), 0))}
            </p>
          </div>
          <div className="bg-white border-2 border-border p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">Genel Toplam</p>
            <p className="text-xl font-bold font-mono text-primary">
              {formatMoney(
                couriers.reduce((sum, c) => sum + (c.collection?.cash_total || 0) + (c.collection?.card_total || 0), 0)
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
