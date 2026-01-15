import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Minus, User, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryelerTab({ companyId }) {
  const [couriers, setCouriers] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [courierBalances, setCourierBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isHakedis, setIsHakedis] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchCourierBalance = async (courierId) => {
    try {
      const res = await axios.get(`${API}/transactions/courier/${courierId}`);
      setCourierBalances(prev => ({ ...prev, [courierId]: res.data.balance }));
    } catch (err) {
      // Silently fail for individual balance fetch
    }
  };

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
      if (res.data.length > 0 && !selectedCourier) {
        setSelectedCourier(res.data[0]);
      }
      // Fetch balances for all couriers
      res.data.forEach(c => fetchCourierBalance(c.id));
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (courierId) => {
    try {
      const res = await axios.get(`${API}/transactions/courier/${courierId}`);
      setTransactions(res.data.transactions);
      setBalance(res.data.balance);
    } catch (err) {
      toast.error("İşlemler yüklenemedi");
    }
  };

  useEffect(() => {
    if (companyId) fetchCouriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (selectedCourier) {
      fetchTransactions(selectedCourier.id);
      setAmount("");
      setDescription("");
      setIsHakedis(false);
    }
  }, [selectedCourier]);

  const handlePayment = async (type) => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/transactions`, {
        entity_type: "courier",
        entity_id: selectedCourier.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Verilen" : "Alınan"),
        is_hakedis: type === "in" ? isHakedis : false
      });
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount("");
      setDescription("");
      setIsHakedis(false);
      fetchTransactions(selectedCourier.id);
      // Update courier balance in list
      fetchCourierBalance(selectedCourier.id);
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/transactions/${txId}`);
      toast.success("İşlem silindi");
      fetchTransactions(selectedCourier.id);
      fetchCourierBalance(selectedCourier.id);
    } catch (err) {
      toast.error("İşlem silinemedi");
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  const getBalanceLabel = (bal) => {
    if (bal === 0 || bal === undefined) return null;
    // balance > 0 = Borçluyuz (kırmızı, - ile)
    // balance < 0 = Alacaklıyız (yeşil)
    if (bal > 0) return { text: `-${formatCurrency(bal)}`, color: 'text-red-600 bg-red-50' };
    return { text: formatCurrency(bal), color: 'text-green-600 bg-green-50' };
  };

  // Toplam bakiye hesaplama
  const totalBalance = Object.values(courierBalances).reduce((sum, bal) => sum + (bal || 0), 0);

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: Kurye Listesi */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-sm">Kuryeler</h3>
          {totalBalance !== 0 && (
            <span className={`text-xs font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance > 0 && '-'}{formatCurrency(totalBalance)}
            </span>
          )}
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {couriers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Kurye bulunamadı</p>
          ) : (
            couriers.map((c) => {
              const balanceInfo = getBalanceLabel(courierBalances[c.id]);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourier(c)}
                  className={`w-full flex items-center gap-3 p-3 text-left border-b border-slate-100 transition-colors ${selectedCourier?.id === c.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                  </div>
                  {balanceInfo && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${balanceInfo.color}`}>
                      {balanceInfo.text}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Sağ: Detay */}
      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedCourier ? (
          <>
            {/* Başlık ve Bakiye */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h3 className="font-semibold">{selectedCourier.name}</h3>
                <p className="text-xs text-muted-foreground">{selectedCourier.phone}</p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {balance === 0 ? '₺0,00' : balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                </p>
              </div>
            </div>

            {/* Ödeme Formu */}
            <div className="p-3 border-b border-slate-200 bg-slate-50/50">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Tutar</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 border-2 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs text-muted-foreground">Açıklama</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-9 border-2 text-sm"
                    placeholder="İsteğe bağlı"
                  />
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <Checkbox id="hakedis" checked={isHakedis} onCheckedChange={setIsHakedis} />
                  <Label htmlFor="hakedis" className="text-xs cursor-pointer">Hakediş</Label>
                </div>
                <Button size="sm" onClick={() => handlePayment("in")} disabled={submitting} className="bg-green-600 hover:bg-green-700 h-9">
                  <Plus className="w-4 h-4 mr-1" />Verilen
                </Button>
                <Button size="sm" onClick={() => handlePayment("out")} disabled={submitting} className="bg-red-600 hover:bg-red-700 h-9">
                  <Minus className="w-4 h-4 mr-1" />Alınan
                </Button>
              </div>
            </div>

            {/* İşlem Geçmişi */}
            <div className="max-h-[320px] overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Henüz işlem yok</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold">Tarih</th>
                      <th className="text-left p-2 font-semibold">Açıklama</th>
                      <th className="text-right p-2 font-semibold">Tutar</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="p-2">
                          {tx.description}
                          {tx.is_hakedis && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Hakediş</span>}
                        </td>
                        <td className={`p-2 text-right font-medium ${tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'payment_out' && '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td className="p-1">
                          <button 
                            onClick={() => handleDeleteTransaction(tx.id)} 
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-muted-foreground">Kurye seçin</div>
        )}
      </div>
    </div>
  );
}
