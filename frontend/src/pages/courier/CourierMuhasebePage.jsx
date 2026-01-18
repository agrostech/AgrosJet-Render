import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Calculator, CreditCard, Upload, FileText, Trash2, Download, ChevronDown, ChevronUp, MessageSquare, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// Haftanın pazartesi tarihini bul
const getMondayDate = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Pazar için -6, diğerleri için 1-gün
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toLocaleDateString('tr-TR');
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
  const [uploadingFor, setUploadingFor] = useState(null);
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [showInvoiceMessageModal, setShowInvoiceMessageModal] = useState(false);
  const [selectedHakedisAmount, setSelectedHakedisAmount] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

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
      toast.error("İşlemler yüklenemedi");
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
      // Map invoices by transaction_id for quick lookup
      const invoiceMap = {};
      res.data.forEach(inv => {
        invoiceMap[inv.transaction_id] = inv;
      });
      setInvoices(invoiceMap);
    } catch (err) {
      console.error("Faturalar yüklenemedi");
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
    }
    if (companyId) {
      fetchCompanyInfo();
    }
  }, [courierId, companyId]);

  const generateInvoiceMessage = (amount) => {
    if (!companyInfo) return "";
    
    const mondayDate = getMondayDate();
    
    return `Merhaba, hizmet vermiş olduğum şirket için fatura kesmem gerekiyor. Yardımcı olur musunuz?

FATURA BİLGİLERİ

Kesilecek Firma:
${companyInfo.name}
${companyInfo.tckn_vkn ? `TCKN/VKN: ${companyInfo.tckn_vkn}` : ''}
${companyInfo.address ? `Adres: ${companyInfo.address}` : ''}
${companyInfo.tax_office ? `Vergi Dairesi: ${companyInfo.tax_office}` : ''}
${companyInfo.email ? `E-posta: ${companyInfo.email}` : ''}

Fatura Tarihi: ${mondayDate} (Hafta Pazartesi)
Hizmet: Kurye Hizmeti

FATURA TUTARI: ${formatMoney(amount)} (KDV DAHİL)

Teşekkürler.`.trim().replace(/\n{3,}/g, '\n\n');
  };

  const openInvoiceMessageModal = (amount) => {
    setSelectedHakedisAmount(amount);
    setCopied(false);
    setShowInvoiceMessageModal(true);
  };

  const copyToClipboard = async () => {
    const message = generateInvoiceMessage(selectedHakedisAmount);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Mesaj kopyalandı!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Kopyalama başarısız");
    }
  };

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
      toast.error("Sadece PDF dosyası yüklenebilir");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('transaction_id', uploadingFor);
    formData.append('courier_id', courierId);
    formData.append('courier_name', courierName);
    
    // Get company_id from user data
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    formData.append('company_id', user.company_id || '');

    try {
      const res = await axios.post(`${API}/invoices/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data.message);
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    } finally {
      setUploadingFor(null);
      e.target.value = '';
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!confirm("Faturayı silmek istediğinizden emin misiniz?")) return;

    try {
      await axios.delete(`${API}/invoices/${invoiceId}?courier_id=${courierId}`);
      toast.success("Fatura silindi");
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura silinemedi");
    }
  };

  const handleDownloadInvoice = (invoiceId) => {
    window.open(`${API}/invoices/download/${invoiceId}`, '_blank');
  };

  const canDeleteInvoice = (invoice) => {
    if (!invoice?.uploaded_at) return false;
    const uploadedAt = new Date(invoice.uploaded_at);
    const now = new Date();
    const hoursPassed = (now - uploadedAt) / (1000 * 60 * 60);
    return hoursPassed <= 24;
  };

  const totalRemainingInstallments = installmentProducts.reduce((sum, p) => sum + p.remaining_installments, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Kurye için bakiye renkleri TERSİNE çevrildi
  const getBalanceColor = (bal) => {
    if (bal === 0) return '';
    return bal > 0 ? 'text-green-600' : 'text-red-600';
  };
  const getBalanceBg = (bal) => {
    if (bal === 0) return 'bg-slate-100';
    return bal > 0 ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className="space-y-4" data-testid="courier-muhasebe-page">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf"
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
              <p className={`text-xl font-bold font-mono ${getBalanceColor(balance)}`}>
                {balance === 0 ? '0 TL' : formatMoney(balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Taksitli Ürünler - Collapsible */}
        {installmentProducts.length > 0 && (
          <div className="border-b-2 border-border">
            <button 
              onClick={() => setInstallmentsExpanded(!installmentsExpanded)}
              className="w-full p-3 sm:p-4 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <h3 className="font-semibold text-sm sm:text-base">Taksitli Ürünler</h3>
                {totalRemainingInstallments > 0 && (
                  <span className="text-[10px] sm:text-xs bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                    {totalRemainingInstallments} taksit
                  </span>
                )}
              </div>
              {installmentsExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {installmentsExpanded && (
              <div className="divide-y divide-border">
                {installmentProducts.map((product) => (
                  <div key={product.id} className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(product.installment_amount)} x {product.installment_count}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-purple-600">
                          {product.installment_count - product.remaining_installments}/{product.installment_count}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          Kalan: {formatMoney(product.total_amount - product.paid_amount)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 bg-slate-200 rounded-full h-1.5 sm:h-2">
                      <div 
                        className="bg-purple-600 h-1.5 sm:h-2 rounded-full transition-all"
                        style={{ width: `${((product.installment_count - product.remaining_installments) / product.installment_count) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Tarih</th>
                    <th className="text-left p-3 font-semibold">Açıklama</th>
                    <th className="text-right p-3 font-semibold">Tutar</th>
                    <th className="text-center p-3 font-semibold w-32">Fatura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const invoice = invoices[tx.id];
                    const hasInvoice = !!invoice;
                    const showUploadButton = tx.is_hakedis && !hasInvoice;
                    
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                        <td className="p-3">
                          {tx.description}
                          {tx.is_hakedis && (
                            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                              Hakediş
                            </span>
                          )}
                          {tx.installment_product_id && (
                            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                              Taksit
                            </span>
                          )}
                        </td>
                        <td className={`p-3 text-right font-mono font-semibold ${
                          tx.type === 'payment_in' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {tx.type === 'payment_in' ? '-' : '+'}{formatMoney(tx.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Fatura Mesajı Butonu - Desktop */}
                            {showUploadButton && companyInfo && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openInvoiceMessageModal(tx.amount)}
                                className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Fatura Mesajı Oluştur"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                            )}
                            {showUploadButton ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUploadClick(tx.id)}
                                disabled={uploadingFor === tx.id}
                                className="h-7 text-xs gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                {uploadingFor === tx.id ? "..." : "Yükle"}
                              </Button>
                            ) : hasInvoice ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDownloadInvoice(invoice.id)}
                                  className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  title="İndir"
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                {canDeleteInvoice(invoice) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteInvoice(invoice.id)}
                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                    title="Sil (24 saat içinde)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
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
            <div className="sm:hidden divide-y divide-border">
              {transactions.map((tx) => {
                const invoice = invoices[tx.id];
                const hasInvoice = !!invoice;
                const showUploadButton = tx.is_hakedis && !hasInvoice;
                
                return (
                  <div key={tx.id} className="p-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatDate(tx.created_at)}
                          </span>
                          {tx.is_hakedis && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                              Hakediş
                            </span>
                          )}
                          {tx.installment_product_id && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                              Taksit
                            </span>
                          )}
                        </div>
                        <p className="text-sm mt-0.5 truncate">{tx.description || '-'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono font-semibold text-sm ${
                          tx.type === 'payment_in' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {tx.type === 'payment_in' ? '-' : '+'}{formatMoney(tx.amount)}
                        </p>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          {/* Fatura Mesajı Butonu */}
                          {showUploadButton && companyInfo && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openInvoiceMessageModal(tx.amount)}
                              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Fatura Mesajı"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {showUploadButton ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUploadClick(tx.id)}
                              disabled={uploadingFor === tx.id}
                              className="h-6 text-[10px] gap-1 px-2"
                            >
                              <Upload className="w-3 h-3" />
                              Fatura
                            </Button>
                          ) : hasInvoice ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadInvoice(invoice.id)}
                                className="h-6 w-6 p-0 text-green-600"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
                              {canDeleteInvoice(invoice) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteInvoice(invoice.id)}
                                  className="h-6 w-6 p-0 text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
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
    </div>
  );
}
