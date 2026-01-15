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
import { Plus, Minus, Building2, Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IsletmelerTab({ companyId }) {
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState("in");
  const [newBusiness, setNewBusiness] = useState({ name: "", phone: "", address: "" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", description: "" });

  const fetchBusinesses = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/businesses`);
      setBusinesses(res.data);
      if (res.data.length > 0 && !selectedBusiness) {
        setSelectedBusiness(res.data[0]);
      }
    } catch (err) {
      toast.error("İşletmeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (businessId) => {
    try {
      const res = await axios.get(`${API}/transactions/business/${businessId}`);
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
    }
  }, [selectedBusiness]);

  const handleAddBusiness = async (e) => {
    e.preventDefault();
    if (!newBusiness.name.trim()) {
      toast.error("İşletme adı gerekli");
      return;
    }
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

  const openPaymentModal = (type) => {
    setPaymentType(type);
    setPaymentForm({ amount: "", description: "" });
    setShowPaymentModal(true);
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    try {
      await axios.post(`${API}/transactions`, {
        entity_type: "business",
        entity_id: selectedBusiness.id,
        company_id: companyId,
        type: paymentType === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(paymentForm.amount),
        description: paymentForm.description || (paymentType === "in" ? "Ödeme alındı" : "Ödeme yapıldı"),
        is_hakedis: false
      });
      toast.success(paymentType === "in" ? "Ödeme alındı" : "Ödeme yapıldı");
      setShowPaymentModal(false);
      fetchTransactions(selectedBusiness.id);
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: İşletme Listesi */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-semibold text-sm">İşletmeler</h3>
          <Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)} className="h-7 px-2">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">İşletme bulunamadı</p>
          ) : (
            businesses.map((biz) => (
              <div
                key={biz.id}
                className={`flex items-center gap-3 p-3 border-b border-slate-100 transition-colors ${
                  selectedBusiness?.id === biz.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"
                }`}
              >
                <button onClick={() => setSelectedBusiness(biz)} className="flex-1 flex items-center gap-3 text-left">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{biz.name}</p>
                    {biz.phone && <p className="text-xs text-muted-foreground">{biz.phone}</p>}
                  </div>
                </button>
                <button onClick={() => handleDeleteBusiness(biz.id)} className="text-red-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sağ: Bakiye ve İşlemler */}
      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedBusiness ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedBusiness.name}</h3>
                  {selectedBusiness.phone && <p className="text-xs text-muted-foreground">{selectedBusiness.phone}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Bakiye</p>
                  <p className={`text-xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(balance)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-3 border-b border-slate-200 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => openPaymentModal("in")} className="border-green-300 text-green-700 hover:bg-green-50">
                <Plus className="w-4 h-4 mr-1" />Ödeme Al
              </Button>
              <Button size="sm" variant="outline" onClick={() => openPaymentModal("out")} className="border-red-300 text-red-700 hover:bg-red-50">
                <Minus className="w-4 h-4 mr-1" />Ödeme Yap
              </Button>
            </div>
            <div className="max-h-[350px] overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">Henüz işlem yok</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold">Tarih</th>
                      <th className="text-left p-2 font-semibold">Açıklama</th>
                      <th className="text-right p-2 font-semibold">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="p-2">{tx.description}</td>
                        <td className={`p-2 text-right font-medium ${tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'payment_in' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <DialogHeader>
            <DialogTitle className="font-heading">İşletme Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBusiness} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">İşletme Adı *</Label>
              <Input value={newBusiness.name} onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })} className="mt-1 h-10 border-2" required />
            </div>
            <div>
              <Label className="text-sm font-semibold">Telefon</Label>
              <Input value={newBusiness.phone} onChange={(e) => setNewBusiness({ ...newBusiness, phone: e.target.value })} className="mt-1 h-10 border-2" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Adres</Label>
              <Input value={newBusiness.address} onChange={(e) => setNewBusiness({ ...newBusiness, address: e.target.value })} className="mt-1 h-10 border-2" />
            </div>
            <Button type="submit" className="w-full h-10 font-semibold">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ödeme Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{paymentType === "in" ? "Ödeme Al" : "Ödeme Yap"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Tutar (₺)</Label>
              <Input type="number" step="0.01" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="mt-1 h-12 border-2 text-lg" placeholder="0.00" required />
            </div>
            <div>
              <Label className="text-sm font-semibold">Açıklama</Label>
              <Input value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} className="mt-1 h-10 border-2" placeholder="İsteğe bağlı" />
            </div>
            <Button type="submit" className={`w-full h-12 font-semibold ${paymentType === "in" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
              {paymentType === "in" ? "Ödeme Al" : "Ödeme Yap"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
