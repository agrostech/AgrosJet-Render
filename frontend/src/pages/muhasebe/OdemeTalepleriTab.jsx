import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import { PageLoading } from "@/components/ui/loading-spinner";
import WeekSelector from "@/components/muhasebe/WeekSelector";
import {
  Wallet, Eye, CheckCircle2, Loader2, FileText, Clock, User
} from "lucide-react";

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

// ====== Approve Modal ======
function ApproveModal({ open, onOpenChange, request, onApproved, adminId, adminName }) {
  const [approvedAmount, setApprovedAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [showPdf, setShowPdf] = useState(false);

  useEffect(() => {
    if (open && request) {
      setApprovedAmount(request.requested_amount?.toString() || "");
      setInvoiceData(null);
    }
  }, [open, request]);

  const handleViewInvoice = async () => {
    try {
      const res = await axios.get(`${API}/payout-requests/${request.id}/invoice`);
      setInvoiceData(res.data);
      // Onay modal'ını kapat, PDF'yi aç (PDF kapanınca tekrar açılacak)
      onOpenChange(false);
      setTimeout(() => setShowPdf(true), 100);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    }
  };

  const handleClosePdf = () => {
    setShowPdf(false);
    // PDF kapanınca onay modal'ını geri aç (state ve girilen tutar korunur)
    setTimeout(() => onOpenChange(true), 100);
  };

  const numeric = parseFloat(approvedAmount) || 0;
  const percent = request?.installment_snapshot?.withdrawal_percent || 0;
  const deduction = (numeric * percent) / 100;
  const cashPayout = numeric - deduction;
  const valid = numeric > 0 && numeric <= (request?.requested_amount || 0);

  const handleApprove = async () => {
    if (!valid) {
      toast.error("Onay tutarı geçersiz");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("approved_amount", numeric);
      // admin_id ve admin_name JWT token'dan alınıyor (backend tarafı)
      const res = await axios.post(`${API}/payout-requests/${request.id}/approve`, formData);
      toast.success(`Onaylandı: ${formatMoney(res.data.cash_payout)} ödendi`);
      onOpenChange(false);
      if (onApproved) onApproved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onaylanamadı");
    } finally {
      setSubmitting(false);
    }
  };

  if (!request) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="payout-approve-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Talep Onayla
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Kurye bilgisi */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-slate-600" />
                <span className="font-semibold">{request.courier_name}</span>
                <span className="text-muted-foreground">— {request.courier_phone}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Talep tarihi: {formatDateTime(request.created_at)}
              </div>
            </div>

            {/* Talep tutarı */}
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span className="text-sm text-blue-800">Kurye Talebi</span>
              <span className="font-mono font-bold text-blue-900">
                {formatMoney(request.requested_amount)}
              </span>
            </div>

            {/* Fatura görüntüleme */}
            <Button
              variant="outline"
              className="w-full gap-2 h-10"
              onClick={handleViewInvoice}
              data-testid="view-invoice-btn"
            >
              <Eye className="w-4 h-4" />
              Faturayı Görüntüle
            </Button>

            {/* Onay tutarı */}
            <div>
              <label className="text-sm font-semibold text-foreground block mb-1">
                Onaylanan Tutar (Faturadaki tutar)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={request.requested_amount}
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                className="w-full px-3 py-2 border-2 border-border rounded-md focus:outline-none focus:border-primary text-base"
                data-testid="approved-amount-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maksimum: {formatMoney(request.requested_amount)} (talep tutarı)
              </p>
            </div>

            {/* Aktif taksit bilgisi */}
            {request.installment_snapshot && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="font-semibold text-amber-800">Aktif Yüzdeli Taksit</p>
                <p className="text-amber-700 mt-1">
                  {request.installment_snapshot.name} — Kalan{" "}
                  <span className="font-mono">{formatMoney(request.installment_snapshot.remaining_amount)}</span>
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Onay tutarının %{percent}'si taksitten düşülecek
                </p>
              </div>
            )}

            {/* Hesap önizleme */}
            {numeric > 0 && (
              <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Onaylanan Tutar</span>
                  <span className="font-mono">{formatMoney(numeric)}</span>
                </div>
                {deduction > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Taksit Kesintisi (%{percent})</span>
                    <span className="font-mono">-{formatMoney(deduction)}</span>
                  </div>
                )}
                <div className="border-t border-slate-300 pt-1.5 flex justify-between font-bold text-green-700">
                  <span>Kuryeye Ödenecek</span>
                  <span className="font-mono text-base">{formatMoney(cashPayout)}</span>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                İptal
              </Button>
              <Button
                onClick={handleApprove}
                disabled={!valid || submitting}
                className="gap-2 bg-green-600 hover:bg-green-700"
                data-testid="approve-submit-btn"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Onayla ve Ödeme Yap
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Viewer */}
      {invoiceData && (
        <PdfViewerModal
          file={
            showPdf
              ? {
                  url: `data:application/pdf;base64,${invoiceData.file_data}`,
                  fileName: invoiceData.filename || "fatura.pdf",
                  contentType: "application/pdf"
                }
              : null
          }
          onClose={handleClosePdf}
        />
      )}
    </>
  );
}

// ====== Main Tab ======
export default function OdemeTalepleriTab({ companyId, adminId, adminName }) {
  const [activeSubTab, setActiveSubTab] = useState("pending"); // pending | approved
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  
  // Hafta seçici
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  
  // Standalone PDF (onaylanmışta fatura görüntüleme)
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchWeeks = async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/issued-invoices/${companyId}/weeks`);
      const w = res.data.weeks || [];
      setWeeks(w);
      // Bu haftayı default seç
      const current = w.find((x) => x.is_current) || w[0];
      if (current) setSelectedWeek(current);
    } catch (err) {
      console.error("Haftalar yüklenemedi", err);
    }
  };

  const fetchRequests = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { status: activeSubTab, limit: 200 };
      if (selectedWeek) {
        params.week_start = selectedWeek.week_start;
        params.week_end = selectedWeek.week_end;
      }
      const res = await axios.get(`${API}/payout-requests/company/${companyId}`, { params });
      setRequests(res.data.requests || []);
    } catch (err) {
      toast.error("Talepler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const fetchCounts = async () => {
    if (!companyId) return;
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        axios.get(`${API}/payout-requests/company/${companyId}`, { params: { status: "pending", limit: 1 } }),
        axios.get(`${API}/payout-requests/company/${companyId}`, { params: { status: "approved", limit: 1 } })
      ]);
      setPendingCount(pendingRes.data.total || 0);
      setApprovedCount(approvedRes.data.total || 0);
    } catch (err) {
      console.error("Counts fetch error", err);
    }
  };

  const handlePreviewInvoice = async (requestId) => {
    setPreviewLoading(true);
    try {
      const res = await axios.get(`${API}/payout-requests/${requestId}/invoice`);
      setPreviewInvoice(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Fatura yüklenemedi");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
    fetchWeeks();
  }, [companyId]);

  useEffect(() => {
    setRequests([]);
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, activeSubTab, selectedWeek]);

  const openApprove = (req) => {
    setSelectedRequest(req);
    setShowApproveModal(true);
  };

  if (!companyId) {
    return <div className="p-4 text-center text-muted-foreground">Şirket seçilmedi</div>;
  }

  return (
    <div className="space-y-4" data-testid="odeme-talepleri-tab">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pending" className="flex items-center gap-2" data-testid="view-pending-btn">
              <Clock className="w-4 h-4" />
              Bekleyen Talepler
              {pendingCount > 0 && (
                <span className="ml-1 bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="flex items-center gap-2" data-testid="view-approved-btn">
              <CheckCircle2 className="w-4 h-4" />
              Onaylanan Talepler
              {approvedCount > 0 && (
                <span className="ml-1 bg-green-200 text-green-900 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {approvedCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          
          {weeks.length > 0 && (
            <WeekSelector
              weeks={weeks}
              selectedWeek={selectedWeek}
              onSelect={setSelectedWeek}
              loading={loading}
            />
          )}
        </div>

        <TabsContent value="pending" className="mt-0">
          <RequestsTable
            requests={requests}
            loading={loading}
            view="pending"
            onApprove={openApprove}
            onPreviewInvoice={handlePreviewInvoice}
            previewLoading={previewLoading}
          />
        </TabsContent>

        <TabsContent value="approved" className="mt-0">
          <RequestsTable
            requests={requests}
            loading={loading}
            view="approved"
            onApprove={openApprove}
            onPreviewInvoice={handlePreviewInvoice}
            previewLoading={previewLoading}
          />
        </TabsContent>
      </Tabs>

      <ApproveModal
        open={showApproveModal}
        onOpenChange={setShowApproveModal}
        request={selectedRequest}
        adminId={adminId}
        adminName={adminName}
        onApproved={() => {
          fetchRequests();
          fetchCounts();
        }}
      />

      {/* Standalone PDF preview (onaylanmışta veya genel fatura görüntüleme) */}
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
        onClose={() => setPreviewInvoice(null)}
      />
    </div>
  );
}

// ====== Requests Table ======
function RequestsTable({ requests, loading, view, onApprove, onPreviewInvoice, previewLoading }) {
  if (loading) {
    return <PageLoading />;
  }
  if (requests.length === 0) {
    return (
      <div className="border-2 border-dashed border-border bg-white p-12 text-center">
        <Wallet className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
        <p className="text-muted-foreground">
          {view === "pending" ? "Bekleyen talep yok" : "Onaylanmış talep yok"}
        </p>
      </div>
    );
  }
  return (
    <div className="border-2 border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b-2 border-border">
            <tr>
              <th className="text-left p-3 font-semibold">Tarih</th>
              <th className="text-left p-3 font-semibold">Kurye</th>
              <th className="text-right p-3 font-semibold">Talep</th>
              {view === "approved" && (
                <>
                  <th className="text-right p-3 font-semibold">Onay</th>
                  <th className="text-right p-3 font-semibold">Taksit</th>
                  <th className="text-right p-3 font-semibold">Ödenen</th>
                </>
              )}
              {view === "pending" && <th className="text-right p-3 font-semibold">Aktif Taksit</th>}
              <th className="text-center p-3 font-semibold w-[180px]">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50" data-testid={`payout-row-${r.id}`}>
                <td className="p-3 text-xs whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="p-3">
                  <p className="font-medium">{r.courier_name}</p>
                  <p className="text-xs text-muted-foreground">{r.courier_phone}</p>
                </td>
                <td className="p-3 text-right font-mono font-semibold whitespace-nowrap">
                  {formatMoney(r.requested_amount)}
                </td>
                {view === "approved" && (
                  <>
                    <td className="p-3 text-right font-mono whitespace-nowrap">{formatMoney(r.approved_amount)}</td>
                    <td className="p-3 text-right font-mono text-amber-700 whitespace-nowrap">
                      {r.actual_installment_deduction > 0 ? `-${formatMoney(r.actual_installment_deduction)}` : "-"}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-green-700 whitespace-nowrap">
                      {formatMoney(r.cash_payout_amount)}
                    </td>
                  </>
                )}
                {view === "pending" && (
                  <td className="p-3 text-right text-xs">
                    {r.installment_snapshot ? (
                      <span className="text-amber-700 font-medium whitespace-nowrap">
                        %{r.installment_snapshot.withdrawal_percent} kesinti
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                )}
                <td className="p-3 text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1.5">
                    {r.invoice_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPreviewInvoice(r.id)}
                        disabled={previewLoading}
                        className="gap-1 h-8"
                        data-testid={`preview-invoice-btn-${r.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Fatura
                      </Button>
                    )}
                    {view === "pending" ? (
                      <Button
                        size="sm"
                        onClick={() => onApprove(r)}
                        className="gap-1 h-8 bg-green-600 hover:bg-green-700"
                        data-testid={`approve-btn-${r.id}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Onayla
                      </Button>
                    ) : (
                      <span className="text-xs text-green-700 font-medium">
                        {formatDateTime(r.approved_at)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
