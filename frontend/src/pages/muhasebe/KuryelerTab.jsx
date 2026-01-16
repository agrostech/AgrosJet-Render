import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Minus, User, Trash2, Archive, ArchiveRestore, Search, Download } from "lucide-react";
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
  const [txDate, setTxDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef(null);

  // Filtrelenmiş işlemler
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

  useEffect(() => {
    setDisplayCount(10);
  }, [searchQuery]);

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
    if (companyId) {
      fetchCouriers();
      fetchArchivedCouriers();
    }
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
      setAmount("");
      setDescription("");
      setIsHakedis(false);
      setDisplayCount(10);
      setSearchQuery("");
      setTxDate(new Date().toISOString().slice(0, 16));
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
        is_hakedis: type === "in" ? isHakedis : false,
        admin_id: adminId,
        admin_name: adminName,
        custom_date: txDate
      });
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount("");
      setDescription("");
      setIsHakedis(false);
      setTxDate(new Date().toISOString().slice(0, 16));
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
      fetchCouriers();
      fetchArchivedCouriers();
    } catch (err) {
      toast.error("Arşivleme başarısız");
    }
  };

  const handleUnarchive = async (courierId) => {
    try {
      await axios.put(`${API}/companies/${companyId}/couriers/${courierId}/unarchive`);
      toast.success("Kurye arşivden çıkarıldı");
      fetchCouriers();
      fetchArchivedCouriers();
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
    
    // Header
    doc.setFontSize(18);
    doc.text("İşlem Geçmişi Raporu", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.text(`Kurye: ${selectedCourier.name}`, 14, 35);
    doc.text(`Telefon: ${selectedCourier.phone}`, 14, 42);
    doc.text(`Bakiye: ${balance > 0 ? '-' : ''}${formatCurrency(balance)}`, 14, 49);
    doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 56);
    
    // Table header
    let y = 70;
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, pageWidth - 28, 10, 'F');
    doc.setFontSize(10);
    doc.text("Tarih", 16, y);
    doc.text("Açıklama", 50, y);
    doc.text("Tutar", pageWidth - 30, y, { align: "right" });
    
    y += 10;
    
    // Table rows
    transactions.forEach((tx, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      const date = new Date(tx.created_at).toLocaleDateString('tr-TR');
      const amount = `${tx.type === 'payment_out' ? '-' : ''}${formatCurrency(tx.amount)}`;
      const desc = tx.description + (tx.is_hakedis ? ' (Hakediş)' : '');
      
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, y - 5, pageWidth - 28, 8, 'F');
      }
      
      doc.setTextColor(tx.type === 'payment_in' ? 0 : 200, tx.type === 'payment_in' ? 128 : 0, 0);
      doc.text(date, 16, y);
      doc.setTextColor(0, 0, 0);
      doc.text(desc.substring(0, 40), 50, y);
      doc.setTextColor(tx.type === 'payment_in' ? 0 : 200, tx.type === 'payment_in' ? 128 : 0, 0);
      doc.text(amount, pageWidth - 30, y, { align: "right" });
      
      y += 8;
    });
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Toplam ${transactions.length} işlem`, 14, y + 10);
    
    doc.save(`${selectedCourier.name}_islem_gecmisi.pdf`);
    toast.success("PDF indirildi");
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  const getBalanceLabel = (bal) => {
    if (bal === 0 || bal === undefined) return null;
    if (bal > 0) return { text: `-${formatCurrency(bal)}`, color: 'text-red-600 bg-red-50' };
    return { text: formatCurrency(bal), color: 'text-green-600 bg-green-50' };
  };

  // Toplam bakiye - sadece aktif kuryeler için
  const totalBalance = showArchived 
    ? Object.values(archivedBalances).reduce((sum, bal) => sum + (bal || 0), 0)
    : Object.values(courierBalances).reduce((sum, bal) => sum + (bal || 0), 0);
  
  const displayList = showArchived ? archivedCouriers : couriers;
  const balancesMap = showArchived ? archivedBalances : courierBalances;

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Sol: Kurye Listesi */}
      <div className="lg:col-span-1 border-2 border-border bg-white">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
          <h3 className="font-semibold text-sm">{showArchived ? 'Arşiv' : 'Kuryeler'}</h3>
          {totalBalance !== 0 && (
            <span className={`text-xs font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalBalance > 0 && '-'}{formatCurrency(totalBalance)}
            </span>
          )}
          <Button 
            size="sm" 
            variant={showArchived ? "default" : "ghost"} 
            onClick={() => setShowArchived(!showArchived)} 
            className="h-7 px-2 ml-auto"
          >
            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </Button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {displayList.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              {showArchived ? 'Arşivde kurye yok' : 'Kurye bulunamadı'}
            </p>
          ) : (
            displayList.map((c) => {
              const balanceInfo = getBalanceLabel(balancesMap[c.id]);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 p-3 border-b border-slate-100 transition-colors ${selectedCourier?.id === c.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}
                >
                  <button
                    onClick={() => setSelectedCourier(c)}
                    className="flex-1 flex items-center gap-3 text-left"
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
                  {showArchived ? (
                    <button onClick={() => handleUnarchive(c.id)} className="text-green-500 hover:text-green-700 p-1 shrink-0" title="Arşivden Çıkar">
                      <ArchiveRestore className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => handleArchive(c.id)} className="text-slate-400 hover:text-slate-600 p-1 shrink-0" title="Arşivle">
                      <Archive className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
            <div className="p-4 border-b border-slate-200">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <Label className="text-xs">Tutar</Label>
                  <Input 
                    type="number" 
                    placeholder="Tutar" 
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onWheel={(e) => e.target.blur()}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Label className="text-xs">Açıklama</Label>
                  <Input 
                    placeholder="Açıklama" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="w-44">
                  <Label className="text-xs">Tarih</Label>
                  <Input 
                    type="datetime-local" 
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex items-center gap-2 h-9">
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

            {/* Arama ve PDF */}
            <div className="p-3 border-b border-slate-200 flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Açıklama veya tarih ara..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground">{filteredTransactions.length} / {transactions.length}</span>
              <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 ml-auto">
                <Download className="w-4 h-4 mr-1" />PDF
              </Button>
            </div>

            {/* İşlem Geçmişi */}
            <div ref={listRef} onScroll={handleScroll} className="max-h-[280px] overflow-y-auto">
              {filteredTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  {searchQuery ? "Arama sonucu bulunamadı" : "Henüz işlem yok"}
                </p>
              ) : (
                <>
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
                      {filteredTransactions.slice(0, displayCount).map((tx) => (
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
                  {displayCount < filteredTransactions.length && (
                    <p className="text-xs text-muted-foreground text-center py-2">Daha fazla görmek için kaydırın...</p>
                  )}
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
