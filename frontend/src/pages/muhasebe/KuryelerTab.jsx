import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Minus, User } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryelerTab({ companyId }) {
  const [couriers, setCouriers] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState("in"); // "in" = ödeme al, "out" = ödeme yap
  const [paymentForm, setPaymentForm] = useState({ amount: "", description: "", is_hakedis: false });

  // Kuryeleri getir
  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
      if (res.data.length > 0 && !selectedCourier) {
        setSelectedCourier(res.data[0]);
      }
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Seçili kurye için işlemleri getir
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
    }
  }, [selectedCourier]);

  const openPaymentModal = (type) => {
    setPaymentType(type);
    setPaymentForm({ amount: "", description: "", is_hakedis: false });
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
        entity_type: "courier",
        entity_id: selectedCourier.id,
        company_id: companyId,
        type: paymentType === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(paymentForm.amount),
        description: paymentForm.description || (paymentType === "in" ? "Ödeme alındı" : "Ödeme yapıldı"),
        is_hakedis: paymentType === "in" ? paymentForm.is_hakedis : false
      });
      toast.success(paymentType === "in" ? "Ödeme alındı" : "Ödeme yapıldı");
      setShowPaymentModal(false);
      fetchTransactions(selectedCourier.id);
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: Kurye Listesi */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-sm">Kuryeler</h3>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {couriers.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Kurye bulunamadı</p>
          ) : (
            couriers.map((courier) => (
              <button
                key={courier.id}
                onClick={() => setSelectedCourier(courier)}
                className={`w-full flex items-center gap-3 p-3 text-left border-b border-slate-100 transition-colors ${
                  selectedCourier?.id === courier.id
                    ? "bg-primary/10 border-l-4 border-l-primary"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{courier.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{courier.phone}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Sağ: Bakiye ve İşlemler */}
      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedCourier ? (
          <>
            {/* Başlık ve Bakiye */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{selectedCourier.name}</h3>
                  <p className="text-xs text-muted-foreground">{selectedCourier.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Bakiye</p>
                  <p className={`text-xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(balance)}
                  </p>
                </div>
              </div>
            </div>

            {/* Butonlar */}
            <div className="p-3 border-b border-slate-200 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPaymentModal("in")}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                <Plus className="w-4 h-4 mr-1" />
                Ödeme Al
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPaymentModal("out")}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <Minus className="w-4 h-4 mr-1" />
                Ödeme Yap
              </Button>
            </div>

            {/* İşlem Geçmişi */}
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
                        <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(tx.created_at)}
                        </td>
                        <td className="p-2">
                          <span>{tx.description}</span>
                          {tx.is_hakedis && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              Hakediş
                            </span>
                          )}
                        </td>
                        <td className={`p-2 text-right font-medium ${
                          tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'
                        }`}>
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
          <div className="p-8 text-center text-muted-foreground">
            Kurye seçin
          </div>
        )}
      </div>

      {/* Ödeme Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {paymentType === "in" ? "Ödeme Al" : "Ödeme Yap"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Tutar (₺)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className="mt-1 h-12 border-2 text-lg"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Açıklama</Label>
              <Input
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                className="mt-1 h-10 border-2"
                placeholder="İsteğe bağlı"
              />
            </div>
            {paymentType === "in" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hakedis"
                  checked={paymentForm.is_hakedis}
                  onCheckedChange={(checked) => setPaymentForm({ ...paymentForm, is_hakedis: checked })}
                />
                <Label htmlFor="hakedis" className="text-sm cursor-pointer">Hakediş</Label>
              </div>
            )}
            <Button 
              type="submit" 
              className={`w-full h-12 font-semibold ${
                paymentType === "in" 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {paymentType === "in" ? "Ödeme Al" : "Ödeme Yap"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
