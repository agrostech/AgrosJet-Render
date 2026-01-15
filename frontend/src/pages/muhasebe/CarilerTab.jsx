import { useState, useEffect } from "react";
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
import { Plus, Minus, Wallet, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CarilerTab({ companyId }) {
  const [vendors, setVendors] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchVendors = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/vendors`);
      setVendors(res.data);
      if (res.data.length > 0 && !selectedVendor) setSelectedVendor(res.data[0]);
    } catch (err) {
      toast.error("Cariler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (id) => {
    try {
      const res = await axios.get(`${API}/transactions/vendor/${id}`);
      setTransactions(res.data.transactions);
      setBalance(res.data.balance);
    } catch (err) {
      toast.error("İşlemler yüklenemedi");
    }
  };

  useEffect(() => {
    if (companyId) fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (selectedVendor) {
      fetchTransactions(selectedVendor.id);
      setAmount("");
      setDescription("");
    }
  }, [selectedVendor]);

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (!newVendor.name.trim()) { toast.error("Cari adı gerekli"); return; }
    try {
      await axios.post(`${API}/companies/${companyId}/vendors`, newVendor);
      toast.success("Cari eklendi");
      setShowAddModal(false);
      setNewVendor({ name: "", phone: "", address: "" });
      fetchVendors();
    } catch (err) {
      toast.error("Cari eklenemedi");
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm("Bu cariyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/vendors/${id}`);
      toast.success("Cari silindi");
      if (selectedVendor?.id === id) setSelectedVendor(null);
      fetchVendors();
    } catch (err) {
      toast.error("Cari silinemedi");
    }
  };

  const handlePayment = async (type) => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Geçerli bir tutar girin"); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/transactions`, {
        entity_type: "vendor",
        entity_id: selectedVendor.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Ödeme alındı" : "Ödeme yapıldı"),
        is_hakedis: false
      });
      toast.success(type === "in" ? "Ödeme alındı" : "Ödeme yapıldı");
      setAmount("");
      setDescription("");
      fetchTransactions(selectedVendor.id);
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amt);
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: Liste */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-sm">Cariler</h3>
          <Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)} className="h-7 px-2"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Cari bulunamadı</p>
          ) : (
            vendors.map((v) => (
              <div key={v.id} className={`flex items-center gap-3 p-3 border-b border-slate-100 transition-colors ${selectedVendor?.id === v.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}>
                <button onClick={() => setSelectedVendor(v)} className="flex-1 flex items-center gap-3 text-left">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center"><Wallet className="w-4 h-4 text-purple-600" /></div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{v.name}</p>
                    {v.phone && <p className="text-xs text-muted-foreground">{v.phone}</p>}
                  </div>
                </button>
                <button onClick={() => handleDeleteVendor(v.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sağ: Detay */}
      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedVendor ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <h3 className="font-semibold">{selectedVendor.name}</h3>
                {selectedVendor.phone && <p className="text-xs text-muted-foreground">{selectedVendor.phone}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Bakiye</p>
                <p className={`text-xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(balance)}</p>
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
            <div className="max-h-[320px] overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Henüz işlem yok</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr><th className="text-left p-2 font-semibold">Tarih</th><th className="text-left p-2 font-semibold">Açıklama</th><th className="text-right p-2 font-semibold">Tutar</th></tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="p-2">{tx.description}</td>
                        <td className={`p-2 text-right font-medium ${tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'}`}>{tx.type === 'payment_in' ? '-' : '+'}{formatCurrency(tx.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-muted-foreground">Cari seçin</div>
        )}
      </div>

      {/* Cari Ekle Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Cari Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddVendor} className="space-y-4">
            <div><Label className="text-sm font-semibold">Cari Adı *</Label><Input value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} className="mt-1 h-10 border-2" required /></div>
            <div><Label className="text-sm font-semibold">Telefon</Label><Input value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label className="text-sm font-semibold">Adres</Label><Input value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <Button type="submit" className="w-full h-10 font-semibold">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
