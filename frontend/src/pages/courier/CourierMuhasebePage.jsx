import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Calculator, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  InstallmentSection, 
  TransactionTable, 
  TransactionMobileList,
  InvoiceMessageModal 
} from "@/components/courier/muhasebe";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export default function CourierMuhasebePage({ courierId, courierName, companyId }) {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installmentProducts, setInstallmentProducts] = useState([]);
  const [invoices, setInvoices] = useState({});
  const [shortfalls, setShortfalls] = useState([]);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [showInvoiceMessageModal, setShowInvoiceMessageModal] = useState(false);
  const [selectedHakedisAmount, setSelectedHakedisAmount] = useState(0);
  const fileInputRef = useRef(null);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteInvoiceId, setPendingDeleteInvoiceId] = useState(null);

  const fetchTransactions = async (append = false) => {
    try {
      const skip = append ? transactions.length : 0;
      const res = await axios.get(`${API}/transactions/courier/${courierId}?skip=${skip}&limit=10`);
      
      if (append) {
        setTransactions(prev => [...prev, ...res.data.transactions]);
      } else {
        setTransactions(res.data.transactions);
      }
      setBalance(res.data.balance);
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      console.error("İşlemler yüklenemedi");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchInstallmentProducts = async () => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}/installment-products?include_completed=false`);
      setInstallmentProducts(res.data);
    } catch (err) {
      console.error("Taksitli ürünler yüklenemedi");
    }
  };

  const fetchInvoices = async () => {
    try {
      const res = await axios.get(`${API}/invoices/courier/${courierId}`);
      const invoiceMap = {};
      res.data.forEach(inv => {
        // Support multiple invoices per transaction (for shortfall invoices)
        if (!invoiceMap[inv.transaction_id]) {
          invoiceMap[inv.transaction_id] = [];
        }
        invoiceMap[inv.transaction_id].push(inv);
      });
      setInvoices(invoiceMap);
    } catch (err) {
      console.error("Faturalar yüklenemedi");
    }
  };

  const fetchShortfalls = async () => {
    try {
      const res = await axios.get(`${API}/invoices/shortfalls/courier/${courierId}`);
      setShortfalls(res.data);
    } catch (err) {
      console.error("Eksik faturalar yüklenemedi");
    }
  };

  const fetchCompanyInfo = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyInfo(res.data);
    } catch (err) {
      console.error("Şirket bilgisi alınamadı");
    }
  };

  useEffect(() => {
    if (courierId) {
      fetchTransactions();
      fetchInstallmentProducts();
      fetchInvoices();
      fetchShortfalls();
    }
    if (companyId) {
      fetchCompanyInfo();
    }
  }, [courierId, companyId]);

  const loadMore = () => {
    setLoadingMore(true);
    fetchTransactions(true);
  };

  const handleUploadClick = (transactionId) => {
    setUploadingFor(transactionId);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFor) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('transaction_id', uploadingFor);
    formData.append('courier_id', courierId);
    formData.append('courier_name', courierName);
    
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    formData.append('company_id', user.company_id || '');

    try {
      const res = await axios.post(`${API}/invoices/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchInvoices();
      fetchShortfalls(); // Refresh shortfalls after upload
    } catch (err) {
      console.error("Fatura yüklenemedi");
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  // Eksik fatura yükleme için ayrı bir file input
  const shortfallFileInputRef = useRef(null);
  const [pendingShortfallTxId, setPendingShortfallTxId] = useState(null);

  const handleUploadShortfallClick = (transactionId) => {
    setPendingShortfallTxId(transactionId);
    shortfallFileInputRef.current?.click();
  };

  const handleShortfallFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingShortfallTxId) return;

    // File validation
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      return;
    }

    setUploadingFor(`shortfall_${pendingShortfallTxId}`);

    const formData = new FormData();
    formData.append("transaction_id", pendingShortfallTxId);
    formData.append("courier_id", courierId);
    formData.append("courier_name", courierName);
    formData.append("company_id", companyId);
    formData.append("is_shortfall_invoice", "true");
    formData.append("file", file);

    try {
      const res = await axios.post(`${API}/invoices/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchInvoices();
      fetchShortfalls();
      fetchTransactions(); // Refresh to update shortfall status
    } catch (err) {
      console.error("Fatura yüklenemedi");
    } finally {
      setUploadingFor(null);
      setPendingShortfallTxId(null);
      e.target.value = '';
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    setPendingDeleteInvoiceId(invoiceId);
    setConfirmOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!pendingDeleteInvoiceId) return;
    try {
      await axios.delete(`${API}/invoices/${pendingDeleteInvoiceId}?courier_id=${courierId}`);
      fetchInvoices();
    } catch (err) {
      console.error("Fatura silinemedi");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteInvoiceId(null);
    }
  };

  const handleDownloadInvoice = (invoiceId) => {
    window.open(`${API}/invoices/download/${invoiceId}`, '_blank');
  };

  const openInvoiceMessageModal = (amount) => {
    setSelectedHakedisAmount(amount);
    setShowInvoiceMessageModal(true);
  };

  if (loading) return <PageLoading />;

  // Kurye için bakiye renkleri
  const getBalanceColor = (bal) => {
    if (bal === 0) return '';
    return bal > 0 ? 'text-red-600' : 'text-green-600';
  };
  const getBalanceBg = (bal) => {
    if (bal === 0) return 'bg-slate-100';
    return bal > 0 ? 'bg-red-50' : 'bg-green-50';
  };

  return (
    <div className="space-y-4" data-testid="courier-muhasebe-page">
      {/* Hidden file input - tüm dosya türleri kabul edilir, doğrulama JS'te yapılır */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="*/*"
        className="hidden"
      />
      {/* Hidden file input for shortfall invoices */}
      <input
        type="file"
        ref={shortfallFileInputRef}
        onChange={handleShortfallFileChange}
        accept="*/*"
        className="hidden"
      />

      {/* Main Card */}
      <div className="border-2 border-border bg-white">
        {/* Header */}
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                <Calculator className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-xl">Muhasebe</h2>
                <p className="text-sm text-muted-foreground">İşlem geçmişiniz ve bakiyeniz</p>
              </div>
            </div>
            <div className={`text-right px-4 py-2 rounded-lg ${getBalanceBg(balance)}`}>
              <p className="text-xs text-muted-foreground">Güncel Bakiye</p>
              <p className="text-xl font-bold font-mono ${getBalanceColor(balance)}">
                {balance === 0 ? '0 TL' : formatMoney(balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Eksik Fatura Uyarısı - Minimal */}
        {shortfalls.length > 0 && (
          <div className="mx-3 sm:mx-4 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm text-amber-700">
                <span className="font-medium">{shortfalls.length} eksik fatura</span>
                <span className="text-amber-600"> • Toplam: {formatMoney(shortfalls.reduce((sum, s) => sum + s.shortfall_amount, 0))}</span>
              </span>
            </div>
          </div>
        )}

        {/* Taksitli Ürünler */}
        <InstallmentSection
          installmentProducts={installmentProducts}
          installmentsExpanded={installmentsExpanded}
          setInstallmentsExpanded={setInstallmentsExpanded}
        />

        {/* Transaction History */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-border">
          <h3 className="font-semibold text-sm sm:text-base">İşlem Geçmişi ({totalCount})</h3>
        </div>
        
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>Henüz işlem bulunmuyor</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <TransactionTable
              transactions={transactions}
              invoices={invoices}
              companyInfo={companyInfo}
              uploadingFor={uploadingFor}
              onUploadClick={handleUploadClick}
              onUploadShortfallClick={handleUploadShortfallClick}
              onDownloadInvoice={handleDownloadInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              onOpenInvoiceMessage={openInvoiceMessageModal}
            />
            
            {/* Load More - Desktop */}
            {hasMore && (
              <div className="hidden sm:block p-4 text-center border-t border-border">
                <Button 
                  variant="outline" 
                  onClick={loadMore} 
                  disabled={loadingMore}
                  className="h-9"
                >
                  {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalCount - transactions.length} kaldı)`}
                </Button>
              </div>
            )}

            {/* Mobile Card List */}
            <TransactionMobileList
              transactions={transactions}
              invoices={invoices}
              companyInfo={companyInfo}
              uploadingFor={uploadingFor}
              onUploadClick={handleUploadClick}
              onUploadShortfallClick={handleUploadShortfallClick}
              onDownloadInvoice={handleDownloadInvoice}
              onDeleteInvoice={handleDeleteInvoice}
              onOpenInvoiceMessage={openInvoiceMessageModal}
            />
            
            {/* Load More - Mobile */}
            {hasMore && (
              <div className="sm:hidden p-4 text-center border-t border-border">
                <Button 
                  variant="outline" 
                  onClick={loadMore} 
                  disabled={loadingMore}
                  className="h-9 w-full"
                >
                  {loadingMore ? "Yükleniyor..." : `Daha Fazla (${totalCount - transactions.length})`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Invoice Message Modal */}
      <InvoiceMessageModal
        open={showInvoiceMessageModal}
        onOpenChange={setShowInvoiceMessageModal}
        selectedAmount={selectedHakedisAmount}
        companyInfo={companyInfo}
      />

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Fatura Silme"
        description="Bu faturayı silmek istediğinize emin misiniz?"
        onConfirm={confirmDeleteInvoice}
        variant="danger"
      />
    </div>
  );
}
