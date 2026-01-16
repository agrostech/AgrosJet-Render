import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Minus, User, Trash2, Archive, ArchiveRestore, Search, Download, Clock } from "lucide-react";
import jsPDF from "jspdf";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryelerTab({ companyId, adminId, adminName }) {
  const [couriers, setCouriers] = useState([]);
  const [archivedCouriers, setArchivedCouriers] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [displayCount, setDisplayCount] = useState(10);
  const [balance, setBalance] = useState(0);
  const [courierBalances, setCourierBalances] = useState({});
  const [archivedBalances, setArchivedBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isHakedis, setIsHakedis] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [txDate, setTxDate] = useState("");
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

  const fetchCourierBalance = async (courierId, isArchived = false) => {
    try {
      const res = await axios.get(`${API}/transactions/courier/${courierId}`);
      if (isArchived) {
        setArchivedBalances(prev => ({ ...prev, [courierId]: res.data.balance }));
      } else {
        setCourierBalances(prev => ({ ...prev, [courierId]: res.data.balance }));
      }
    } catch (err) {}
  };

  const fetchCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setCouriers(res.data);
      if (res.data.length > 0 && !selectedCourier) {
        setSelectedCourier(res.data[0]);
      }
      res.data.forEach(c => fetchCourierBalance(c.id, false));
    } catch (err) {
      toast.error("Kuryeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedCouriers = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers?include_archived=true`);
      const archived = res.data.filter(c => c.is_archived);
      setArchivedCouriers(archived);
      archived.forEach(c => fetchCourierBalance(c.id, true));
    } catch (err) {}
  };

  useEffect(() => {
    if (companyId) { fetchCouriers(); fetchArchivedCouriers(); }
  }, [companyId]);

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
    if (selectedCourier) {
      fetchTransactions(selectedCourier.id);
      setAmount(""); setDescription(""); setIsHakedis(false);
      setDisplayCount(10); setSearchQuery("");
      setUseCustomDate(false); setTxDate("");
    }
  }, [selectedCourier]);

  const handlePayment = async (type) => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        entity_type: "courier",
        entity_id: selectedCourier.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Verilen" : "Alınan"),
        is_hakedis: type === "in" ? isHakedis : false,
        admin_id: adminId,
        admin_name: adminName
      };
      if (useCustomDate && txDate) {
        payload.custom_date = txDate;
      }
      await axios.post(`${API}/transactions`, payload);
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount(""); setDescription(""); setIsHakedis(false);
      setUseCustomDate(false); setTxDate("");
      fetchTransactions(selectedCourier.id);
      fetchCourierBalance(selectedCourier.id, selectedCourier.is_archived);
    } catch (err) {
      toast.error("İşlem başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (txId) => {
    if (!window.confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/transactions/${txId}`, {
        data: { admin_id: adminId, admin_name: adminName }
      });
      toast.success("İşlem silindi");
      fetchTransactions(selectedCourier.id);
      fetchCourierBalance(selectedCourier.id, selectedCourier.is_archived);
    } catch (err) {
      toast.error("İşlem silinemedi");
    }
  };

  const handleArchive = async (courierId) => {
    if (!window.confirm("Bu kuryeyi arşivlemek istediğinize emin misiniz?")) return;
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/${courierId}/archive`);
      toast.success("Kurye arşivlendi");
      if (selectedCourier?.id === courierId) setSelectedCourier(null);
      fetchCouriers(); fetchArchivedCouriers();
    } catch (err) {
      toast.error("Arşivleme başarısız");
    }
  };

  const handleUnarchive = async (courierId) => {
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/${courierId}/unarchive`);
      toast.success("Kurye arşivden çıkarıldı");
      fetchCouriers(); fetchArchivedCouriers();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const exportPDF = () => {
    if (!selectedCourier || transactions.length === 0) {
      toast.error("İndirilecek işlem bulunamadı");
      return;
    }
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Turkish character mapping
    const turkishMap = { 'ş': 's', 'Ş': 'S', 'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C' };
    const toAscii = (str) => str ? str.replace(/[şŞıİğĞüÜöÖçÇ]/g, c => turkishMap[c] || c) : '';
    const formatMoney = (amt) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Math.abs(amt)) + ' TL';
    
    // Header
    doc.setFillColor(51, 51, 51);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(toAscii("İşlem Geçmişi Raporu"), pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text(toAscii(`Kurye: ${selectedCourier.name}`), pageWidth / 2, 25, { align: "center" });
    doc.text(`Tel: ${selectedCourier.phone}`, pageWidth / 2, 31, { align: "center" });
    
    // Info box
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 42, pageWidth - 28, 18, 'F');
    doc.setFontSize(10);
    doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 20, 52);
    doc.text(toAscii(`Toplam İşlem: ${transactions.length}`), 80, 52);
    const balText = balance > 0 ? `-${formatMoney(balance)} (Borc)` : balance < 0 ? `${formatMoney(balance)} (Alacak)` : '0,00 TL';
    doc.text(`Bakiye: ${balText}`, 140, 52);
    
    // Table header
    let y = 70;
    doc.setFillColor(70, 130, 180);
    doc.rect(14, y, pageWidth - 28, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("Tarih", 18, y + 7);
    doc.text(toAscii("Açıklama"), 55, y + 7);
    doc.text("Tutar", pageWidth - 20, y + 7, { align: "right" });
    y += 14;
    
    // Table rows
    doc.setTextColor(0, 0, 0);
    transactions.forEach((tx, index) => {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
        // Repeat header on new page
        doc.setFillColor(70, 130, 180);
        doc.rect(14, y, pageWidth - 28, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text("Tarih", 18, y + 7);
        doc.text(toAscii("Açıklama"), 55, y + 7);
        doc.text("Tutar", pageWidth - 20, y + 7, { align: "right" });
        y += 14;
        doc.setTextColor(0, 0, 0);
      }
      
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, y - 5, pageWidth - 28, 10, 'F');
      }
      
      const date = new Date(tx.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = new Date(tx.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const desc = toAscii(tx.description) + (tx.is_hakedis ? ' (Hakedis)' : '');
      const amtText = `${tx.type === 'payment_out' ? '-' : ''}${formatMoney(tx.amount)}`;
      
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`${date} ${time}`, 18, y + 2);
      doc.setTextColor(0, 0, 0);
      doc.text(desc.substring(0, 45), 55, y + 2);
      doc.setTextColor(tx.type === 'payment_in' ? 0 : 200, tx.type === 'payment_in' ? 128 : 0, 0);
      doc.text(amtText, pageWidth - 20, y + 2, { align: "right" });
      
      y += 10;
    });
    
    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text("ShiftJet Kurye Yonetim Sistemi", pageWidth / 2, pageHeight - 10, { align: "center" });
    
    doc.save(`${toAscii(selectedCourier.name)}_islem_gecmisi.pdf`);
    toast.success("PDF indirildi");
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  const getBalanceLabel = (bal) => {
    if (bal === 0 || bal === undefined) return null;
    if (bal > 0) return { text: `-${formatCurrency(bal)}`, color: 'text-red-600 bg-red-50' };
    return { text: formatCurrency(bal), color: 'text-green-600 bg-green-50' };
  };

  const totalBalance = showArchived 
    ? Object.values(archivedBalances).reduce((sum, bal) => sum + (bal || 0), 0)
    : Object.values(courierBalances).reduce((sum, bal) => sum + (bal || 0), 0);
  
  const displayList = showArchived ? archivedCouriers : couriers;
  const balancesMap = showArchived ? archivedBalances : courierBalances;

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
          <h3 className="font-semibold text-sm">{showArchived ? 'Arşiv' : 'Kuryeler'}</h3>
          {totalBalance !== 0 && (
            <span className={`text-xs font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance > 0 && '-'}{formatCurrency(totalBalance)}
            </span>
          )}
          <Button size="sm" variant={showArchived ? "default" : "ghost"} onClick={() => setShowArchived(!showArchived)} className="h-7 px-2 ml-auto">
            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {displayList.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">{showArchived ? 'Arşivde kurye yok' : 'Kurye bulunamadı'}</p>
          ) : (
            displayList.map((c) => {
              const balanceInfo = getBalanceLabel(balancesMap[c.id]);
              return (
                <div key={c.id} className={`flex items-center gap-2 p-3 border-b border-slate-100 transition-colors ${selectedCourier?.id === c.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}>
                  <button onClick={() => setSelectedCourier(c)} className="flex-1 flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-slate-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                    </div>
                    {balanceInfo && <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${balanceInfo.color}`}>{balanceInfo.text}</span>}
                  </button>
                  {showArchived ? (
                    <button onClick={() => handleUnarchive(c.id)} className="text-green-500 hover:text-green-700 p-1 shrink-0" title="Arşivden Çıkar"><ArchiveRestore className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => handleArchive(c.id)} className="text-slate-400 hover:text-slate-600 p-1 shrink-0" title="Arşivle"><Archive className="w-4 h-4" /></button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-2 border-2 border-border bg-white">
        {selectedCourier ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div><h3 className="font-semibold">{selectedCourier.name}</h3><p className="text-xs text-muted-foreground">{selectedCourier.phone}</p></div>
              <div className="text-right">
                <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {balance === 0 ? '₺0,00' : balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                </p>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-28">
                  <Label className="text-xs">Tutar</Label>
                  <Input type="number" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} className="h-9" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs">Açıklama</Label>
                  <Input placeholder="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" />
                </div>
                <div className="flex items-center gap-2">
                  {useCustomDate ? (
                    <div className="w-44">
                      <Label className="text-xs">Tarih</Label>
                      <Input type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="h-9" />
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setUseCustomDate(true); setTxDate(new Date().toISOString().slice(0, 16)); }} className="h-9">
                      <Clock className="w-4 h-4 mr-1" />Şimdi
                    </Button>
                  )}
                  {useCustomDate && (
                    <Button size="sm" variant="ghost" onClick={() => { setUseCustomDate(false); setTxDate(""); }} className="h-9 px-2 text-xs">İptal</Button>
                  )}
                </div>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox id="hakedis" checked={isHakedis} onCheckedChange={setIsHakedis} />
                  <Label htmlFor="hakedis" className="text-xs cursor-pointer">Hakediş</Label>
                </div>
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
                          <td className="p-2">{tx.description}{tx.is_hakedis && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Hakediş</span>}</td>
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
          <div className="flex items-center justify-center h-64 text-muted-foreground">Kurye seçin</div>
        )}
      </div>
    </div>
  );
}
