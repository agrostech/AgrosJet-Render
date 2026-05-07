import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import InvoiceMessageModal from "./InvoiceMessageModal";
import { Wallet, Upload, Loader2, FileText, AlertTriangle, CheckCircle2, X, History, Trash2, Eye, Send } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n || 0)) + " TL";

const formatDateTime = (s) => {
  if (!s) return "-";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
};

export default function PayoutRequestModal({ open, onOpenChange, courierId, companyInfo, onSuccess }) {
  const [activeTab, setActiveTab] = useState("new"); // 'new' | 'history'
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showInvoiceMessage, setShowInvoiceMessage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && courierId) {
      fetchCanRequest();
      fetchHistory();
      setAmount("");
      setFile(null);
      setActiveTab("new");
    }
  }, [open, courierId]);

  const fetchCanRequest = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/payout-requests/courier/${courierId}/can-request`);
      setInfo(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Bilgi alınamadı");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API}/payout-requests/courier/${courierId}/history`);
      setHistory(res.data || []);
    } catch (err) {
      console.error("Geçmiş talepler yüklenemedi");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCancel = async (requestId) => {
    if (!window.confirm("Bu talebi ve yüklenen faturayı silmek istediğinize emin misiniz?")) return;
    setCancelling(requestId);
    try {
      await axios.delete(`${API}/payout-requests/${requestId}`);
      toast.success("Talep iptal edildi");
      fetchHistory();
      fetchCanRequest();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İptal edilemedi");
    } finally {
      setCancelling(null);
    }
  };

  const handlePreviewInvoice = async (requestId) => {
    try {
      const res = await axios.get(`${API}/payout-requests/${requestId}/invoice`);
      setPreviewInvoice(res.data);
      // Ana modal'ı kapat (PDF kapanınca tekrar açılacak)
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    }
  };
  
  const handleClosePreview = () => {
    setPreviewInvoice(null);
    // Ana modal'ı geri aç
    setTimeout(() => onOpenChange(true), 100);
  };

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Sadece PDF formatında fatura yükleyebilirsiniz");
      e.target.value = "";
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Fatura 10MB'ı geçemez");
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const numericAmount = parseFloat(amount) || 0;
  const percent = info?.active_installment?.withdrawal_percent || 0;
  const expectedDeduction = (numericAmount * percent) / 100;
  const cashPayout = numericAmount - expectedDeduction;

  const validation = (() => {
    if (!info) return { ok: false, msg: "" };
    if (!info.can_request) return { ok: false, msg: info.reason };
    if (numericAmount < info.min_amount) return { ok: false, msg: `Minimum ${info.min_amount} TL` };
    if (numericAmount > info.max_amount) return { ok: false, msg: `Maksimum ${formatMoney(info.max_amount)}` };
    if (!file) return { ok: false, msg: "Fatura yüklemelisiniz (PDF)" };
    return { ok: true, msg: "" };
  })();

  const handleSubmit = async () => {
    if (!validation.ok) {
      toast.error(validation.msg);
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("requested_amount", numericAmount);
      formData.append("file", file);
      await axios.post(`${API}/payout-requests/courier/${courierId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Ödeme talebiniz oluşturuldu");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Talep gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status) => {
    if (status === "pending") return <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">Bekliyor</span>;
    if (status === "approved") return <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">Onaylandı</span>;
    if (status === "approving") return <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">İnceleniyor</span>;
    return <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">{status}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col" data-testid="payout-request-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Ödeme Talebi
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b-2 border-border -mx-6 px-6 pb-2">
          <button
            onClick={() => setActiveTab("new")}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "new" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-slate-100"
            }`}
            data-testid="payout-tab-new"
          >
            <Wallet className="w-4 h-4" />
            Yeni Talep
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === "history" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-slate-100"
            }`}
            data-testid="payout-tab-history"
          >
            <History className="w-4 h-4" />
            Geçmiş
            {history.length > 0 && (
              <span className="ml-0.5 bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {history.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {activeTab === "new" ? (
            loading || !info ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !info.can_request ? (
              <div className="py-6 space-y-3">
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700 text-sm">Talep Oluşturamazsınız</p>
                    <p className="text-sm text-red-600 mt-1">{info.reason}</p>
                  </div>
                </div>
                {info.unprocessed_days?.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded border border-slate-200">
                    <p className="font-medium mb-1">İşlenmemiş günler:</p>
                    <p>{info.unprocessed_days.join(", ")}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* Bakiye */}
                <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                  <p className="text-xs text-green-700">Çekilebilir Bakiye</p>
                  <p className="font-bold text-2xl text-green-800 font-mono">{formatMoney(info.balance)}</p>
                </div>

                {info.active_installment && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">
                    <p className="font-semibold text-amber-800">Aktif Yüzdeli Taksit</p>
                    <p className="text-amber-700 mt-1">
                      {info.active_installment.name} — Kalan:{" "}
                      <span className="font-mono font-semibold">
                        {formatMoney(info.active_installment.remaining_amount)}
                      </span>
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Her talepten <span className="font-semibold">%{info.active_installment.withdrawal_percent}</span>{" "}
                      taksit kesintisi yapılacak
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">Talep Tutarı (TL)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={info.min_amount}
                    max={info.max_amount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Min ${info.min_amount}, Max ${info.max_amount}`}
                    className="w-full px-3 py-2 border-2 border-border rounded-md focus:outline-none focus:border-primary text-base"
                    data-testid="payout-amount-input"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      Min: {info.min_amount} TL — Max: {formatMoney(info.max_amount)}
                    </p>
                    {numericAmount > 0 && companyInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          // Ana modal'ı kapatıp WhatsApp modal'ı aç
                          onOpenChange(false);
                          setTimeout(() => setShowInvoiceMessage(true), 100);
                        }}
                        className="text-[11px] text-green-700 hover:text-green-800 underline flex items-center gap-1 font-medium"
                        data-testid="kolay-fatura-btn"
                      >
                        <Send className="w-3 h-3" />
                        Kolay Fatura İste
                      </button>
                    )}
                  </div>
                </div>

                {numericAmount > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Talep Tutarı</span>
                      <span className="font-mono">{formatMoney(numericAmount)}</span>
                    </div>
                    {expectedDeduction > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Taksit Kesintisi (%{percent})</span>
                        <span className="font-mono">-{formatMoney(expectedDeduction)}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-300 pt-1.5 flex justify-between font-semibold text-green-700">
                      <span>Hesabınıza Aktarılacak</span>
                      <span className="font-mono text-base">{formatMoney(cashPayout)}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">Fatura (PDF, zorunlu)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {!file ? (
                    <Button
                      variant="outline"
                      className="w-full h-11 gap-2 border-dashed"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="payout-file-upload-btn"
                    >
                      <Upload className="w-4 h-4" />
                      PDF Fatura Seç
                    </Button>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 border-2 border-green-200 bg-green-50 rounded-md">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-green-700 flex-shrink-0" />
                        <span className="text-sm font-medium text-green-800 truncate">{file.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="h-7 w-7 p-0 text-red-600 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            // History tab
            <div className="py-2 space-y-2">
              {historyLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Henüz talep oluşturmadınız
                </div>
              ) : (
                history.map((req) => (
                  <div
                    key={req.id}
                    className="border border-border rounded-lg p-3 bg-white"
                    data-testid={`history-row-${req.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(req.created_at)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {statusBadge(req.status)}
                          {req.invoice_id && (
                            <button
                              onClick={() => handlePreviewInvoice(req.id)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                              data-testid={`preview-invoice-${req.id}`}
                            >
                              <Eye className="w-3 h-3" />
                              Faturayı Görüntüle
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Talep</p>
                        <p className="font-bold font-mono text-sm">{formatMoney(req.requested_amount)}</p>
                      </div>
                    </div>
                    
                    {req.status === "approved" && (
                      <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Onay</p>
                          <p className="font-mono font-semibold">{formatMoney(req.approved_amount || 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Taksit</p>
                          <p className="font-mono text-amber-700">
                            {req.actual_installment_deduction > 0 ? `-${formatMoney(req.actual_installment_deduction)}` : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Ödenen</p>
                          <p className="font-mono font-bold text-green-700">{formatMoney(req.cash_payout_amount || 0)}</p>
                        </div>
                      </div>
                    )}

                    {req.status === "pending" && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(req.id)}
                          disabled={cancelling === req.id}
                          className="w-full h-8 text-xs gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                          data-testid={`cancel-btn-${req.id}`}
                        >
                          {cancelling === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Talebi İptal Et
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer (sadece new tab'da) */}
        {activeTab === "new" && info?.can_request && (
          <DialogFooter className="gap-2 pt-2 border-t border-border -mx-6 px-6">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              İptal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!validation.ok || submitting}
              className="gap-2"
              data-testid="payout-modal-submit-btn"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Talebi Gönder
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
      
      {/* PDF Viewer */}
      <PdfViewerModal
        file={
          previewInvoice
            ? {
                url: `data:application/pdf;base64,${previewInvoice.file_data}`,
                fileName: previewInvoice.filename || "fatura.pdf",
                contentType: "application/pdf"
              }
            : null
        }
        onClose={handleClosePreview}
      />
      
      {/* Kolay Fatura — WhatsApp mesajı */}
      <InvoiceMessageModal
        open={showInvoiceMessage}
        onOpenChange={(o) => {
          setShowInvoiceMessage(o);
          if (!o) {
            // WhatsApp modal kapanınca ana payout modal'ı geri aç
            setTimeout(() => onOpenChange(true), 100);
          }
        }}
        selectedAmount={numericAmount}
        companyInfo={companyInfo}
      />
    </Dialog>
  );
}
