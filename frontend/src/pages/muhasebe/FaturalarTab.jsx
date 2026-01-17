import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  FileText, Download, User, Calendar, AlertCircle, 
  ChevronLeft, ChevronRight, Archive, Check, CheckCircle, Circle, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR');
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export default function FaturalarTab({ companyId }) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [couriersSummary, setCouriersSummary] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [courierInvoices, setCourierInvoices] = useState([]);
  const [monthInvoices, setMonthInvoices] = useState([]);
  const [missingInvoices, setMissingInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoices, setSelectedInvoices] = useState([]);

  const fetchCouriersSummary = async () => {
    try {
      const res = await axios.get(
        `${API}/invoices/company/${companyId}/couriers-summary?year=${selectedYear}&month=${selectedMonth}`
      );
      setCouriersSummary(res.data);
    } catch (err) {
      console.error("Kurye özeti yüklenemedi");
    }
  };

  const fetchMonthInvoices = async () => {
    try {
      const res = await axios.get(
        `${API}/invoices/company/${companyId}?year=${selectedYear}&month=${selectedMonth}`
      );
      setMonthInvoices(res.data);
    } catch (err) {
      console.error("Aylık faturalar yüklenemedi");
    }
  };

  const fetchMissingInvoices = async () => {
    try {
      const res = await axios.get(`${API}/invoices/company/${companyId}/missing`);
      setMissingInvoices(res.data);
    } catch (err) {
      console.error("Eksik faturalar yüklenemedi");
    }
  };

  const fetchCourierInvoices = async (courierId) => {
    try {
      const res = await axios.get(`${API}/invoices/courier/${courierId}`);
      setCourierInvoices(res.data);
    } catch (err) {
      console.error("Kurye faturaları yüklenemedi");
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchCouriersSummary(),
        fetchMonthInvoices(),
        fetchMissingInvoices()
      ]);
      setLoading(false);
    };
    
    if (companyId) loadData();
  }, [companyId, selectedYear, selectedMonth]);

  useEffect(() => {
    if (selectedCourier) {
      fetchCourierInvoices(selectedCourier.courier_id);
    } else {
      setCourierInvoices([]);
    }
  }, [selectedCourier]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleDownloadSingle = (invoiceId) => {
    window.open(`${API}/invoices/download/${invoiceId}`, '_blank');
  };

  const handleViewInvoice = (invoiceId) => {
    window.open(`${API}/invoices/view/${invoiceId}`, '_blank');
  };

  const handleDownloadBulk = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("En az bir fatura seçin");
      return;
    }

    try {
      const res = await axios.post(
        `${API}/invoices/download-bulk`,
        selectedInvoices,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Faturalar_${selectedMonth}.${selectedYear}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${selectedInvoices.length} fatura indirildi`);
      setSelectedInvoices([]);
    } catch (err) {
      toast.error("Faturalar indirilemedi");
    }
  };

  const toggleInvoiceSelection = (invoiceId) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const selectAllMonthInvoices = () => {
    if (selectedInvoices.length === monthInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(monthInvoices.map(inv => inv.id));
    }
  };

  const handleVerifyInvoice = async (invoiceId, currentStatus) => {
    try {
      if (currentStatus) {
        await axios.put(`${API}/invoices/${invoiceId}/unverify`);
        toast.success("Kontrol durumu kaldırıldı");
      } else {
        await axios.put(`${API}/invoices/${invoiceId}/verify`);
        toast.success("Fatura kontrol edildi olarak işaretlendi");
      }
      fetchMonthInvoices();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="faturalar-tab">
      {/* Month Selector */}
      <div className="flex items-center justify-between border-2 border-border bg-white p-3">
        <Button variant="ghost" size="sm" onClick={handlePrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-semibold">{MONTHS[selectedMonth - 1]} {selectedYear}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 2x2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Row 1 Col 1: All Month Invoices */}
        <div className="border-2 border-border bg-white">
          <div className="p-3 border-b-2 border-border bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Ay Faturaları</h3>
                <span className="text-xs text-muted-foreground">({monthInvoices.length})</span>
              </div>
              {monthInvoices.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={selectAllMonthInvoices}
                    className="h-7 text-xs"
                  >
                    {selectedInvoices.length === monthInvoices.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                  </Button>
                  {selectedInvoices.length > 0 && (
                    <Button
                      size="sm"
                      onClick={handleDownloadBulk}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="w-3 h-3" />
                      İndir ({selectedInvoices.length})
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {monthInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <Archive className="w-12 h-12 mx-auto mb-2 opacity-20" />
                Bu ayda yüklenen fatura yok
              </div>
            ) : (
              <div className="divide-y divide-border">
                {monthInvoices.map((invoice) => (
                  <div 
                    key={invoice.id} 
                    className={`p-3 hover:bg-slate-50 ${
                      selectedInvoices.includes(invoice.id) ? 'bg-primary/5' : ''
                    } ${invoice.verified ? 'bg-green-50/50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div 
                        className="flex items-center gap-2 flex-1 cursor-pointer"
                        onClick={() => toggleInvoiceSelection(invoice.id)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          selectedInvoices.includes(invoice.id) 
                            ? 'bg-primary border-primary text-white' 
                            : 'border-slate-300'
                        }`}>
                          {selectedInvoices.includes(invoice.id) && <Check className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{invoice.courier_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {invoice.file_name} • {formatDate(invoice.uploaded_at)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Transaction Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-sm font-mono text-red-600">
                          {invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadSingle(invoice.id);
                          }}
                          className="h-8 w-8 p-0"
                          title="İndir"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVerifyInvoice(invoice.id, invoice.verified);
                          }}
                          className={`h-8 w-8 p-0 ${invoice.verified ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-green-600'}`}
                          title={invoice.verified ? "Kontrol edildi (tıkla: kaldır)" : "Kontrol edildi olarak işaretle"}
                        >
                          {invoice.verified ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 1 Col 2: Missing Invoices */}
        <div className="border-2 border-border bg-white">
          <div className="p-3 border-b-2 border-border bg-red-50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <h3 className="font-semibold text-sm text-red-700">Eksik Faturalar</h3>
              <span className="text-xs text-red-500">({missingInvoices.length})</span>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {missingInvoices.length === 0 ? (
              <div className="p-8 text-center text-green-600 text-sm">
                <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
                Tüm hakedişler için fatura yüklenmiş
              </div>
            ) : (
              <div className="divide-y divide-border">
                {missingInvoices.map((tx) => (
                  <div key={tx.id} className="p-3 hover:bg-red-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{tx.courier_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.description} • {formatDate(tx.created_at)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-red-600">
                        {formatMoney(tx.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2 Col 1: Couriers List */}
        <div className="border-2 border-border bg-white">
          <div className="p-3 border-b-2 border-border bg-slate-50">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Kuryeler</h3>
              <span className="text-xs text-muted-foreground">({couriersSummary.length})</span>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {couriersSummary.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Kurye bulunamadı
              </div>
            ) : (
              couriersSummary.map((courier) => (
                <div
                  key={courier.courier_id}
                  onClick={() => setSelectedCourier(
                    selectedCourier?.courier_id === courier.courier_id ? null : courier
                  )}
                  className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors ${
                    selectedCourier?.courier_id === courier.courier_id ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{courier.courier_name}</p>
                      <p className="text-xs text-muted-foreground">{courier.phone}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={`text-sm font-semibold ${
                        courier.invoice_count > 0 ? 'text-green-600' : 'text-muted-foreground'
                      }`}>
                        {courier.invoice_count}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Row 2 Col 2: Selected Courier's Invoices */}
        <div className="border-2 border-border bg-white">
          <div className="p-3 border-b-2 border-border bg-slate-50">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">
                {selectedCourier ? `${selectedCourier.courier_name} - Faturalar` : 'Kurye Seçin'}
              </h3>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!selectedCourier ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <User className="w-12 h-12 mx-auto mb-2 opacity-20" />
                Faturalarını görmek için bir kurye seçin
              </div>
            ) : courierInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                Bu kuryenin faturası yok
              </div>
            ) : (
              <div className="divide-y divide-border">
                {courierInvoices.map((invoice) => (
                  <div key={invoice.id} className="p-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{invoice.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(invoice.uploaded_at)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadSingle(invoice.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
