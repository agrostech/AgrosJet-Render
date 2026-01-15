import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Minus, Building2, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IsletmelerTab({ companyId, adminId, adminName }) {
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [displayCount, setDisplayCount] = useState(10);
  const [balance, setBalance] = useState(0);
  const [businessBalances, setBusinessBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBusiness, setNewBusiness] = useState({ name: "", phone: "", address: "" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef(null);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      setDisplayCount(prev => Math.min(prev + 10, transactions.length));
    }
  }, [transactions.length]);

  const fetchBusinessBalance = async (id) => {
    try {
      const res = await axios.get(`${API}/transactions/business/${id}`);
      setBusinessBalances(prev => ({ ...prev, [id]: res.data.balance }));
    } catch (err) {}
  };

  const fetchBusinesses = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/businesses`);
      setBusinesses(res.data);
      if (res.data.length > 0 && !selectedBusiness) setSelectedBusiness(res.data[0]);
      res.data.forEach(b => fetchBusinessBalance(b.id));
    } catch (err) {
      toast.error("İşletmeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (id) => {
    try {
      const res = await axios.get(`${API}/transactions/business/${id}`);
      setTransactions(res.data.transactions);
      setBalance(res.data.balance);
    } catch (err) {
      toast.error("İşlemler yüklenemedi");
    }
  };

  useEffect(() => {
    if (companyId) fetchBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (selectedBusiness) {
      fetchTransactions(selectedBusiness.id);
      setAmount("");
      setDescription("");
      setDisplayCount(10);
    }
  }, [selectedBusiness]);

  const handleAddBusiness = async (e) => {
    e.preventDefault();
    if (!newBusiness.name.trim()) { toast.error("İşletme adı gerekli"); return; }
    try {
      await axios.post(`${API}/companies/${companyId}/businesses`, newBusiness);
      toast.success("İşletme eklendi");
      setShowAddModal(false);
      setNewBusiness({ name: "", phone: "", address: "" });
      fetchBusinesses();
    } catch (err) {
      toast.error("İşletme eklenemedi");
    }
  };

  const handleDeleteBusiness = async (id) => {
    if (!window.confirm("Bu işletmeyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/businesses/${id}`);
      toast.success("İşletme silindi");
      if (selectedBusiness?.id === id) setSelectedBusiness(null);
      fetchBusinesses();
    } catch (err) {
      toast.error("İşletme silinemedi");
    }
  };

  const handlePayment = async (type) => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Geçerli bir tutar girin"); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/transactions`, {
        entity_type: "business",
        entity_id: selectedBusiness.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Verilen" : "Alınan"),
        is_hakedis: false
      });
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount("");
      setDescription("");
      fetchTransactions(selectedBusiness.id);
      fetchBusinessBalance(selectedBusiness.id);
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
      fetchTransactions(selectedBusiness.id);
      fetchBusinessBalance(selectedBusiness.id);
    } catch (err) {
      toast.error("İşlem silinemedi");
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Toplam bakiye
  const totalBalance = Object.values(businessBalances).reduce((sum, bal) => sum + (bal || 0), 0);

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: Liste */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-sm">İşletmeler</h3>
          {totalBalance !== 0 && (
            <span className={`text-xs font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance > 0 && '-'}{formatCurrency(totalBalance)}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)} className="h-7 px-2"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">İşletme bulunamadı</p>
          ) : (
            businesses.map((b) => {
              const bal = businessBalances[b.id];
              return (
                <div key={b.id} className={`flex items-center gap-3 p-3 border-b border-slate-100 transition-colors ${selectedBusiness?.id === b.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}>
                  <button onClick={() => setSelectedBusiness(b)} className="flex-1 flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-blue-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{b.name}</p>
                      {b.phone && <p className="text-xs text-muted-foreground">{b.phone}</p>}
                    </div>
                    {bal !== 0 && bal !== undefined && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${bal > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                        {bal > 0 && '-'}{formatCurrency(bal)}
                      </span>
                    )}
                  </button>
                  <button onClick={() => handleDeleteBusiness(b.id)} className="text-red-400 hover:text-red-600 p-1 shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sağ: Detay */}
      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedBusiness ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h3 className="font-semibold">{selectedBusiness.name}</h3>
                {selectedBusiness.phone && <p className="text-xs text-muted-foreground">{selectedBusiness.phone}</p>}
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
                  <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 border-2 text-sm" placeholder="0.00" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs text-muted-foreground">Açıklama</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 border-2 text-sm" placeholder="İsteğe bağlı" />
                </div>
                <Button size="sm" onClick={() => handlePayment("in")} disabled={submitting} className="bg-green-600 hover:bg-green-700 h-9"><Plus className="w-4 h-4 mr-1" />Verilen</Button>
                <Button size="sm" onClick={() => handlePayment("out")} disabled={submitting} className="bg-red-600 hover:bg-red-700 h-9"><Minus className="w-4 h-4 mr-1" />Alınan</Button>
              </div>
            </div>
            <div ref={listRef} onScroll={handleScroll} className="max-h-[320px] overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Henüz işlem yok</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr><th className="text-left p-2 font-semibold">Tarih</th><th className="text-left p-2 font-semibold">Açıklama</th><th className="text-right p-2 font-semibold">Tutar</th><th className="w-10"></th></tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, displayCount).map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className={`p-2 text-right font-medium ${tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'}`}>{tx.type === 'payment_out' && '-'}{formatCurrency(tx.amount)}</td>
                          <td className="p-1"><button onClick={() => handleDeleteTransaction(tx.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 transition-opacity"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {displayCount < transactions.length && (
                    <p className="text-xs text-muted-foreground text-center py-2">Daha fazla görmek için kaydırın...</p>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-muted-foreground">İşletme seçin</div>
        )}
      </div>

      {/* İşletme Ekle Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">İşletme Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddBusiness} className="space-y-4">
            <div><Label className="text-sm font-semibold">İşletme Adı *</Label><Input value={newBusiness.name} onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })} className="mt-1 h-10 border-2" required /></div>
            <div><Label className="text-sm font-semibold">Telefon</Label><Input value={newBusiness.phone} onChange={(e) => setNewBusiness({ ...newBusiness, phone: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label className="text-sm font-semibold">Adres</Label><Input value={newBusiness.address} onChange={(e) => setNewBusiness({ ...newBusiness, address: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <Button type="submit" className="w-full h-10 font-semibold">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
