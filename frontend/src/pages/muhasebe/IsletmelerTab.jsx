import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { Plus, Minus, Building2, Trash2, Archive, ArchiveRestore, Search, Download } from "lucide-react";
import jsPDF from "jspdf";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function IsletmelerTab({ companyId, adminId, adminName }) {
  const [businesses, setBusinesses] = useState([]);
  const [archivedBusinesses, setArchivedBusinesses] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [displayCount, setDisplayCount] = useState(10);
  const [balance, setBalance] = useState(0);
  const [businessBalances, setBusinessBalances] = useState({});
  const [archivedBalances, setArchivedBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBusiness, setNewBusiness] = useState({ name: "", phone: "", address: "" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef(null);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const query = searchQuery.toLowerCase().trim();
    return transactions.filter(tx => 
      tx.description?.toLowerCase().includes(query) ||
      new Date(tx.created_at).toLocaleDateString('tr-TR').includes(query)
    );
  }, [transactions, searchQuery]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      setDisplayCount(prev => Math.min(prev + 10, filteredTransactions.length));
    }
  }, [filteredTransactions.length]);

  useEffect(() => { setDisplayCount(10); }, [searchQuery]);

  const fetchBusinessBalance = async (id, isArchived = false) => {
    try {
      const res = await axios.get(`${API}/transactions/business/${id}`);
      if (isArchived) {
        setArchivedBalances(prev => ({ ...prev, [id]: res.data.balance }));
      } else {
        setBusinessBalances(prev => ({ ...prev, [id]: res.data.balance }));
      }
    } catch (err) {}
  };

  const fetchBusinesses = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/businesses`);
      setBusinesses(res.data);
      if (res.data.length > 0 && !selectedBusiness) setSelectedBusiness(res.data[0]);
      res.data.forEach(b => fetchBusinessBalance(b.id, false));
    } catch (err) {
      toast.error("İşletmeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedBusinesses = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/businesses?include_archived=true`);
      const archived = res.data.filter(b => b.is_archived);
      setArchivedBusinesses(archived);
      archived.forEach(b => fetchBusinessBalance(b.id, true));
    } catch (err) {}
  };

  useEffect(() => {
    if (companyId) { fetchBusinesses(); fetchArchivedBusinesses(); }
  }, [companyId]);

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
    if (selectedBusiness) {
      fetchTransactions(selectedBusiness.id);
      setAmount(""); setDescription(""); setDisplayCount(10); setSearchQuery("");
      setTxDate(new Date().toISOString().slice(0, 16));
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
      toast.error("Ekleme başarısız");
    }
  };

  const handleDeleteBusiness = async (id) => {
    if (!window.confirm("Bu işletmeyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/businesses/${id}`);
      toast.success("İşletme silindi");
      if (selectedBusiness?.id === id) setSelectedBusiness(null);
      fetchBusinesses(); fetchArchivedBusinesses();
    } catch (err) {
      toast.error("İşletme silinemedi");
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm("Bu işletmeyi arşivlemek istediğinize emin misiniz?")) return;
    try {
      await axios.put(`${API}/businesses/${id}/archive`);
      toast.success("İşletme arşivlendi");
      if (selectedBusiness?.id === id) setSelectedBusiness(null);
      fetchBusinesses(); fetchArchivedBusinesses();
    } catch (err) {
      toast.error("Arşivleme başarısız");
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await axios.put(`${API}/businesses/${id}/unarchive`);
      toast.success("İşletme arşivden çıkarıldı");
      fetchBusinesses(); fetchArchivedBusinesses();
    } catch (err) {
      toast.error("İşlem başarısız");
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
        is_hakedis: false,
        admin_id: adminId,
        admin_name: adminName,
        custom_date: txDate
      });
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount(""); setDescription(""); setTxDate(new Date().toISOString().slice(0, 16));
      fetchTransactions(selectedBusiness.id);
      fetchBusinessBalance(selectedBusiness.id, selectedBusiness.is_archived);
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/transactions/${txId}`, { data: { admin_id: adminId, admin_name: adminName } });
      toast.success("İşlem silindi");
      fetchTransactions(selectedBusiness.id);
      fetchBusinessBalance(selectedBusiness.id, selectedBusiness.is_archived);
    } catch (err) {
      toast.error("İşlem silinemedi");
    }
  };

  const exportPDF = () => {
    if (!selectedBusiness || transactions.length === 0) { toast.error("İndirilecek işlem bulunamadı"); return; }
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(18);
    doc.text("İşlem Geçmişi Raporu", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.text(`İşletme: ${selectedBusiness.name}`, 14, 35);
    doc.text(`Bakiye: ${balance > 0 ? '-' : ''}${formatCurrency(balance)}`, 14, 42);
    doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 49);
    let y = 65;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, pageWidth - 28, 10, 'F');
    doc.setFontSize(10);
    doc.text("Tarih", 16, y); doc.text("Açıklama", 50, y); doc.text("Tutar", pageWidth - 30, y, { align: "right" });
    y += 10;
    transactions.forEach((tx, index) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (index % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(14, y - 5, pageWidth - 28, 8, 'F'); }
      doc.setTextColor(0, 0, 0);
      doc.text(new Date(tx.created_at).toLocaleDateString('tr-TR'), 16, y);
      doc.text(tx.description.substring(0, 40), 50, y);
      doc.setTextColor(tx.type === 'payment_in' ? 0 : 200, tx.type === 'payment_in' ? 128 : 0, 0);
      doc.text(`${tx.type === 'payment_out' ? '-' : ''}${formatCurrency(tx.amount)}`, pageWidth - 30, y, { align: "right" });
      y += 8;
    });
    doc.save(`${selectedBusiness.name}_islem_gecmisi.pdf`);
    toast.success("PDF indirildi");
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const totalBalance = showArchived 
    ? Object.values(archivedBalances).reduce((sum, bal) => sum + (bal || 0), 0)
    : Object.values(businessBalances).reduce((sum, bal) => sum + (bal || 0), 0);
  const displayList = showArchived ? archivedBusinesses : businesses;
  const balancesMap = showArchived ? archivedBalances : businessBalances;

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
          <h3 className="font-semibold text-sm">{showArchived ? 'Arşiv' : 'İşletmeler'}</h3>
          {totalBalance !== 0 && (
            <span className={`text-xs font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance > 0 && '-'}{formatCurrency(totalBalance)}
            </span>
          )}
          <div className="flex gap-1 ml-auto">
            <Button size="sm" variant={showArchived ? "default" : "ghost"} onClick={() => setShowArchived(!showArchived)} className="h-7 px-2">
              {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </Button>
            {!showArchived && <Button size="sm" variant="ghost" onClick={() => setShowAddModal(true)} className="h-7 px-2"><Plus className="w-4 h-4" /></Button>}
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {displayList.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">{showArchived ? 'Arşivde işletme yok' : 'İşletme bulunamadı'}</p>
          ) : (
            displayList.map((b) => {
              const bal = balancesMap[b.id];
              return (
                <div key={b.id} className={`flex items-center gap-2 p-3 border-b border-slate-100 transition-colors ${selectedBusiness?.id === b.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}>
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
                  <div className="flex gap-1 shrink-0">
                    {showArchived ? (
                      <button onClick={() => handleUnarchive(b.id)} className="text-green-500 hover:text-green-700 p-1" title="Arşivden Çıkar"><ArchiveRestore className="w-4 h-4" /></button>
                    ) : (
                      <>
                        <button onClick={() => handleArchive(b.id)} className="text-slate-400 hover:text-slate-600 p-1" title="Arşivle"><Archive className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteBusiness(b.id)} className="text-red-400 hover:text-red-600 p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedBusiness ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div><h3 className="font-semibold">{selectedBusiness.name}</h3>{selectedBusiness.phone && <p className="text-xs text-muted-foreground">{selectedBusiness.phone}</p>}</div>
              <div className="text-right">
                <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {balance === 0 ? '₺0,00' : balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                </p>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32"><Label className="text-xs">Tutar</Label><Input type="number" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} className="h-9" /></div>
                <div className="flex-1 min-w-[150px]"><Label className="text-xs">Açıklama</Label><Input placeholder="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" /></div>
                <div className="w-44"><Label className="text-xs">Tarih</Label><Input type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="h-9" /></div>
                <Button size="sm" onClick={() => handlePayment("in")} disabled={submitting} className="bg-green-600 hover:bg-green-700 h-9"><Plus className="w-4 h-4 mr-1" />Verilen</Button>
                <Button size="sm" onClick={() => handlePayment("out")} disabled={submitting} className="bg-red-600 hover:bg-red-700 h-9"><Minus className="w-4 h-4 mr-1" />Alınan</Button>
              </div>
            </div>
            <div className="p-3 border-b border-slate-200 flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Açıklama veya tarih ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <span className="text-xs text-muted-foreground">{filteredTransactions.length} / {transactions.length}</span>
              <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 ml-auto"><Download className="w-4 h-4 mr-1" />PDF</Button>
            </div>
            <div ref={listRef} onScroll={handleScroll} className="max-h-[280px] overflow-y-auto">
              {filteredTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">{searchQuery ? "Arama sonucu bulunamadı" : "Henüz işlem yok"}</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0"><tr><th className="text-left p-2 font-semibold">Tarih</th><th className="text-left p-2 font-semibold">Açıklama</th><th className="text-right p-2 font-semibold">Tutar</th><th className="w-10"></th></tr></thead>
                    <tbody>
                      {filteredTransactions.slice(0, displayCount).map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 group">
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at)}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className={`p-2 text-right font-medium ${tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'}`}>{tx.type === 'payment_out' && '-'}{formatCurrency(tx.amount)}</td>
                          <td className="p-1"><button onClick={() => handleDeleteTransaction(tx.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1 transition-opacity"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {displayCount < filteredTransactions.length && <p className="text-xs text-muted-foreground text-center py-2">Daha fazla görmek için kaydırın...</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">İşletme seçin</div>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Yeni İşletme Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddBusiness} className="space-y-4">
            <div><Label>İşletme Adı *</Label><Input value={newBusiness.name} onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label>Telefon</Label><Input value={newBusiness.phone} onChange={(e) => setNewBusiness({ ...newBusiness, phone: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label>Adres</Label><Input value={newBusiness.address} onChange={(e) => setNewBusiness({ ...newBusiness, address: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <Button type="submit" className="w-full h-10 font-semibold">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
