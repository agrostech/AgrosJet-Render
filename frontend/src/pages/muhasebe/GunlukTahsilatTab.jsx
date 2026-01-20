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
  Search
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function GunlukTahsilatTab({ companyId, adminId, adminName }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(null); // courier id being submitted
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [couriers, setCouriers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form data for each courier
  const [formData, setFormData] = useState({});

  useEffect(() => {
    fetchCouriersForDate();
  }, [companyId, selectedDate]);

  const fetchCouriersForDate = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/daily-collections/${companyId}/couriers-for-date/${selectedDate}`);
      setCouriers(res.data);
      // Initialize form data
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
      
      toast.success(`${courier.name} kaydedildi`);
      setFormData(prev => ({
        ...prev,
        [courier.id]: { cash: "", c1: "", c10: "", c20: "" }
      }));
      fetchCouriersForDate();
    } catch (err) {
      if (!err.handled) {
        toast.error("Kayıt başarısız");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const formatMoney = (val) => {
    if (!val && val !== 0) return "0 TL";
    return `${val.toLocaleString('tr-TR', { minimumFractionDigits: 0 })} TL`;
  };

  // Filter and sort couriers: search filter + saved ones at bottom
  const filteredCouriers = couriers
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Saved couriers go to bottom
      if (a.has_collection && !b.has_collection) return 1;
      if (!a.has_collection && b.has_collection) return -1;
      // Then sort by name
      return a.name.localeCompare(b.name, 'tr');
    });

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="gunluk-tahsilat-tab">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-primary" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 border-2 font-mono w-40"
            data-testid="date-picker"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Kurye ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 border-2 w-44"
              data-testid="search-courier"
            />
          </div>
          <div className="flex gap-3 text-sm">
            <span className="text-muted-foreground">Kurye: <b>{filteredCouriers.length}</b></span>
            <span className="text-green-600">Kayıtlı: <b>{filteredCouriers.filter(c => c.has_collection).length}</b></span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border-2 border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b-2 border-border">
              <tr>
                <th className="text-left p-2 pl-3 font-semibold w-48">Kurye</th>
                <th className="text-left p-2 font-semibold w-20">
                  <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />Nakit</span>
                </th>
                <th className="text-left p-2 font-semibold w-20">
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />%1</span>
                </th>
                <th className="text-left p-2 font-semibold w-20">%10</th>
                <th className="text-left p-2 font-semibold w-20">%20</th>
                <th className="text-center p-2 font-semibold w-16"></th>
                <th className="text-right p-2 pr-3 font-semibold w-32">Mevcut</th>
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
                  <td className="p-1">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0"
                      value={formData[courier.id]?.cash || ""}
                      onChange={(e) => handleInputChange(courier.id, "cash", e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      className="h-8 w-20 border font-mono text-xs px-2"
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
                      className="h-8 w-20 border font-mono text-xs px-2"
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
                      className="h-8 w-20 border font-mono text-xs px-2"
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
                      className="h-8 w-20 border font-mono text-xs px-2"
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
                  <td className="p-2 pr-3 text-right">
                    {courier.has_collection ? (
                      <div className="text-xs font-mono">
                        <span className="text-green-600">{formatMoney(courier.collection.cash_total)}</span>
                        <span className="text-muted-foreground mx-1">|</span>
                        <span className="text-blue-600">{formatMoney(courier.collection.card_total)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm justify-end">
        <div className="px-3 py-1.5 bg-green-50 rounded border border-green-200">
          <span className="text-green-700">Nakit: </span>
          <span className="font-bold font-mono">{formatMoney(filteredCouriers.reduce((sum, c) => sum + (c.collection?.cash_total || 0), 0))}</span>
        </div>
        <div className="px-3 py-1.5 bg-blue-50 rounded border border-blue-200">
          <span className="text-blue-700">Kart: </span>
          <span className="font-bold font-mono">{formatMoney(filteredCouriers.reduce((sum, c) => sum + (c.collection?.card_total || 0), 0))}</span>
        </div>
      </div>
    </div>
  );
}
