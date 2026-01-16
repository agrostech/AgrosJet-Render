import { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Minus, Wallet, Trash2, Archive, ArchiveRestore, Search, Download, Clock } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RobotoRegular } from "@/utils/robotoFont";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getLocalDateTimeString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const isApproximatelyNow = (dateStr) => {
  if (!dateStr) return true;
  const inputDate = new Date(dateStr);
  const now = new Date();
  const diff = Math.abs(now.getTime() - inputDate.getTime());
  return diff < 2 * 60 * 1000;
};

export default function CarilerTab({ companyId, adminId, adminName, companyLogo, companyName, transactionRef, onSelect }) {
  const [vendors, setVendors] = useState([]);
  const [archivedVendors, setArchivedVendors] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [balance, setBalance] = useState(0);
  const [vendorBalances, setVendorBalances] = useState({});
  const [archivedBalances, setArchivedBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [txDate, setTxDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef(null);

  // Cari seçildiğinde scroll
  const handleVendorSelect = (vendor) => {
    setSelectedVendor(vendor);
    if (onSelect) onSelect();
  };

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const query = searchQuery.toLowerCase().trim();
    return transactions.filter(tx => 
      tx.description?.toLowerCase().includes(query) ||
      new Date(tx.created_at).toLocaleDateString('tr-TR').includes(query)
    );
  }, [transactions, searchQuery]);

  const fetchVendorBalance = async (id, isArchived = false) => {
    try {
      const res = await axios.get(`${API}/transactions/vendor/${id}?limit=1`);
      if (isArchived) {
        setArchivedBalances(prev => ({ ...prev, [id]: res.data.balance }));
      } else {
        setVendorBalances(prev => ({ ...prev, [id]: res.data.balance }));
      }
    } catch (err) {}
  };

  const fetchVendors = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/vendors`);
      setVendors(res.data);
      if (res.data.length > 0 && !selectedVendor) setSelectedVendor(res.data[0]);
      res.data.forEach(v => fetchVendorBalance(v.id, false));
    } catch (err) {
      toast.error("Cariler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedVendors = async () => {
    try {
      const res = await axios.get(`${API}/companies/${companyId}/vendors?include_archived=true`);
      const archived = res.data.filter(v => v.is_archived);
      setArchivedVendors(archived);
      archived.forEach(v => fetchVendorBalance(v.id, true));
    } catch (err) {}
  };

  useEffect(() => {
    if (companyId) { fetchVendors(); fetchArchivedVendors(); }
  }, [companyId]);

  const fetchTransactions = async (vendorId, append = false) => {
    try {
      const skip = append ? transactions.length : 0;
      const res = await axios.get(`${API}/transactions/vendor/${vendorId}?skip=${skip}&limit=10`);
      if (append) {
        setTransactions(prev => [...prev, ...res.data.transactions]);
      } else {
        setTransactions(res.data.transactions);
      }
      setBalance(res.data.balance);
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      toast.error("İşlemler yüklenemedi");
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || !selectedVendor) return;
    setLoadingMore(true);
    await fetchTransactions(selectedVendor.id, true);
    setLoadingMore(false);
  };

  useEffect(() => {
    if (selectedVendor) {
      fetchTransactions(selectedVendor.id);
      setAmount(""); setDescription(""); setSearchQuery("");
      setUseCustomDate(false); setTxDate("");
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
      toast.error("Ekleme başarısız");
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm("Bu cariyi silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/vendors/${id}`);
      toast.success("Cari silindi");
      if (selectedVendor?.id === id) setSelectedVendor(null);
      fetchVendors(); fetchArchivedVendors();
    } catch (err) {
      toast.error("Cari silinemedi");
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm("Bu cariyi arşivlemek istediğinize emin misiniz?")) return;
    try {
      await axios.put(`${API}/vendors/${id}/archive`);
      toast.success("Cari arşivlendi");
      if (selectedVendor?.id === id) setSelectedVendor(null);
      fetchVendors(); fetchArchivedVendors();
    } catch (err) {
      toast.error("Arşivleme başarısız");
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await axios.put(`${API}/vendors/${id}/unarchive`);
      toast.success("Cari arşivden çıkarıldı");
      fetchVendors(); fetchArchivedVendors();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const handlePayment = async (type) => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Geçerli bir tutar girin"); return; }
    setSubmitting(true);
    try {
      const payload = {
        entity_type: "vendor",
        entity_id: selectedVendor.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Verilen" : "Alınan"),
        is_hakedis: false,
        admin_id: adminId,
        admin_name: adminName
      };
      if (useCustomDate && txDate) payload.custom_date = txDate;
      await axios.post(`${API}/transactions`, payload);
      toast.success(type === "in" ? "Verilen kaydedildi" : "Alınan kaydedildi");
      setAmount(""); setDescription(""); setUseCustomDate(false); setTxDate("");
      fetchTransactions(selectedVendor.id);
      fetchVendorBalance(selectedVendor.id, selectedVendor.is_archived);
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
      fetchTransactions(selectedVendor.id);
      fetchVendorBalance(selectedVendor.id, selectedVendor.is_archived);
    } catch (err) {
      toast.error("İşlem silinemedi");
    }
  };

  const formatMoney = (amt) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Math.abs(amt)) + ' TL';

  const exportPDF = async () => {
    if (!selectedVendor || transactions.length === 0) { toast.error("İndirilecek işlem bulunamadı"); return; }
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Add Roboto font for Turkish character support
    doc.addFileToVFS("Roboto-Regular.ttf", RobotoRegular);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");
    
    // Header (white background)
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 32, pageWidth - 14, 32);
    
    // Add company logo if available (top right corner, fits within header)
    if (companyLogo && companyLogo.trim() !== '') {
      try {
        // Fetch image through backend proxy to avoid CORS issues
        const proxyUrl = `${API}/proxy-image?url=${encodeURIComponent(companyLogo)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const blob = await response.blob();
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          // Logo 25x25 mm positioned in header area (y=4 to y=29, within 32mm header)
          const logoSize = 25;
          doc.addImage(dataUrl, 'PNG', pageWidth - logoSize - 14, 4, logoSize, logoSize);
        } else {
          console.log("Logo proxy failed:", response.status);
        }
      } catch (e) {
        console.log("Logo yüklenemedi:", e);
      }
    }
    
    doc.setTextColor(51, 51, 51);
    doc.setFontSize(18);
    doc.text("İşlem Geçmişi Raporu", 14, 15);
    doc.setFontSize(11);
    doc.text(`Cari: ${selectedVendor.name}`, 14, 26);
    
    // Summary box
    doc.setFillColor(250, 250, 250);
    doc.rect(14, 38, pageWidth - 28, 14, 'F');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    
    const cName = companyName || 'Şirket';
    let balanceText;
    if (balance === 0) {
      balanceText = '0,00 TL';
    } else if (balance > 0) {
      balanceText = `${formatMoney(balance)} (${cName} Alacaklı)`;
    } else {
      balanceText = `${formatMoney(balance)} (${cName} Borçlu)`;
    }
    
    doc.text(`Rapor: ${new Date().toLocaleDateString('tr-TR')}  |  Toplam Islem: ${transactions.length}  |  Bakiye: ${balanceText}`, 20, 46);
    
    // Table
    const tableData = transactions.map(tx => [
      new Date(tx.created_at).toLocaleDateString('tr-TR') + ' ' + new Date(tx.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      (tx.description || '').substring(0, 40),
      (tx.type === 'payment_out' ? '-' : '') + formatMoney(tx.amount)
    ]);
    
    autoTable(doc, {
      startY: 58,
      head: [['Tarih', 'Aciklama', 'Tutar']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [70, 130, 180], 
        textColor: 255
      },
      columnStyles: { 
        0: { cellWidth: 40 }, 
        1: { cellWidth: 'auto' }, 
        2: { cellWidth: 35, halign: 'right' } 
      },
      styles: { 
        fontSize: 9
      },
      willDrawCell: (data) => {
        doc.setFont('Roboto', 'normal');
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          if (data.cell.raw.startsWith('-')) data.cell.styles.textColor = [200, 0, 0];
          else data.cell.styles.textColor = [0, 128, 0];
        }
      },
      margin: { left: 14, right: 14 },
    });
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("© 2026 ShiftJet. Tüm hakları saklıdır. Powered by AgrosJet.", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    }
    
    // Format: Ad.Bakiye.pdf
    const safeName = selectedVendor.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '_');
    const formattedBalance = formatMoney(balance).replace(' TL', '').replace(',', '.').replace(/\s/g, '');
    doc.save(`${safeName}.${formattedBalance}TL.pdf`);
    toast.success("PDF indirildi");
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(amt));
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const totalBalance = showArchived 
    ? Object.values(archivedBalances).reduce((sum, bal) => sum + (bal || 0), 0)
    : Object.values(vendorBalances).reduce((sum, bal) => sum + (bal || 0), 0);
  const displayList = showArchived ? archivedVendors : vendors;
  const balancesMap = showArchived ? archivedBalances : vendorBalances;

  const getDateDisplayText = () => {
    if (!useCustomDate) return "Şimdi";
    if (isApproximatelyNow(txDate)) return "Şimdi";
    return new Date(txDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* Cariler Listesi - Sol Kart */}
      <div className="lg:col-span-1 border-2 border-border bg-white flex flex-col h-full">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-2 shrink-0">
          <h3 className="font-semibold text-sm">{showArchived ? 'Arşiv' : 'Cariler'}</h3>
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
        <div className="flex-1 overflow-y-auto">
          {displayList.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">{showArchived ? 'Arşivde cari yok' : 'Cari bulunamadı'}</p>
          ) : (
            displayList.map((v) => {
              const bal = balancesMap[v.id];
              return (
                <div key={v.id} className={`flex items-center gap-2 p-3 border-b border-slate-100 transition-colors ${selectedVendor?.id === v.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}>
                  <button onClick={() => handleVendorSelect(v)} className="flex-1 flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0"><Wallet className="w-4 h-4 text-purple-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{v.name}</p>
                      {v.phone && <p className="text-xs text-muted-foreground">{v.phone}</p>}
                    </div>
                    {bal !== 0 && bal !== undefined && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${bal > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                        {bal > 0 && '-'}{formatCurrency(bal)}
                      </span>
                    )}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    {showArchived ? (
                      <button onClick={() => handleUnarchive(v.id)} className="text-green-500 hover:text-green-700 p-1" title="Arşivden Çıkar"><ArchiveRestore className="w-4 h-4" /></button>
                    ) : (
                      <>
                        <button onClick={() => handleArchive(v.id)} className="text-slate-400 hover:text-slate-600 p-1" title="Arşivle"><Archive className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteVendor(v.id)} className="text-red-400 hover:text-red-600 p-1" title="Sil"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* İşlem Geçmişi - Sağ Kart */}
      <div ref={transactionRef} className="lg:col-span-2 border-2 border-border bg-white flex flex-col h-full">
        {selectedVendor ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2 shrink-0">
              <div><h3 className="font-semibold">{selectedVendor.name}</h3>{selectedVendor.phone && <p className="text-xs text-muted-foreground">{selectedVendor.phone}</p>}</div>
              <div className="text-right">
                <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                  {balance === 0 ? '₺0,00' : balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
                </p>
              </div>
            </div>
            <div className="p-4 border-b border-slate-200 shrink-0">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-32">
                  <Label className="text-xs">Tutar</Label>
                  <Input type="number" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} className="h-9" data-testid="amount-input" />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Label className="text-xs">Açıklama</Label>
                  <Input placeholder="Açıklama" value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" />
                </div>
                <div className="flex items-center gap-2">
                  {useCustomDate ? (
                    <div className="w-44">
                      <Label className="text-xs">{isApproximatelyNow(txDate) ? 'Şimdi' : 'Tarih'}</Label>
                      <Input type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="h-9" />
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setUseCustomDate(true); setTxDate(getLocalDateTimeString()); }} className="h-9" data-testid="date-picker-btn">
                      <Clock className="w-4 h-4 mr-1" />{getDateDisplayText()}
                    </Button>
                  )}
                  {useCustomDate && <Button size="sm" variant="ghost" onClick={() => { setUseCustomDate(false); setTxDate(""); }} className="h-9 px-2 text-xs">İptal</Button>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => handlePayment("in")} disabled={submitting} className="bg-green-600 hover:bg-green-700 h-9 flex-1" data-testid="payment-in-btn"><Plus className="w-4 h-4 mr-1" />Verilen</Button>
                <Button size="sm" onClick={() => handlePayment("out")} disabled={submitting} className="bg-red-600 hover:bg-red-700 h-9 flex-1" data-testid="payment-out-btn"><Minus className="w-4 h-4 mr-1" />Alınan</Button>
              </div>
            </div>
            <div className="p-3 border-b border-slate-200 flex items-center gap-3 shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Açıklama veya tarih ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <span className="text-xs text-muted-foreground">{filteredTransactions.length} / {transactions.length}</span>
              <Button size="sm" variant="outline" onClick={exportPDF} className="h-8 ml-auto" data-testid="export-pdf-btn"><Download className="w-4 h-4 mr-1" />PDF</Button>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto">
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
                  {displayCount < filteredTransactions.length && (
                    <div className="text-center py-3 border-t border-slate-100">
                      <Button size="sm" variant="outline" onClick={() => setDisplayCount(prev => Math.min(prev + 10, filteredTransactions.length))} className="h-8 text-xs">
                        Daha Fazla Yükle ({filteredTransactions.length - displayCount} kaldı)
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">Cari seçin</div>
        )}
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Yeni Cari Ekle</DialogTitle></DialogHeader>
          <form onSubmit={handleAddVendor} className="space-y-4">
            <div><Label>Cari Adı *</Label><Input value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label>Telefon</Label><Input value={newVendor.phone} onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <div><Label>Adres</Label><Input value={newVendor.address} onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} className="mt-1 h-10 border-2" /></div>
            <Button type="submit" className="w-full h-10 font-semibold">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
