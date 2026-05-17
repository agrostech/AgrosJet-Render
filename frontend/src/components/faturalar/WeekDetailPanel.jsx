/**
 * Seçili Hafta Detay Paneli
 *
 * Bir haftanın tüm kuryelerini listeler (obligation olsa da olmasa da).
 * Her satırda: isim, beklenen tutar, durum rozeti, fatura no/tarih, dosya, aksiyon.
 * "Onayla" aksiyonu uploaded → approved geçişi.
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  FileText, Loader2, ExternalLink, CheckCircle2, AlertTriangle, Clock, Plus, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import ManualObligationModal from "./ManualObligationModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

const buildPdfFile = (obligation) => {
  if (!obligation?.invoice_file_url) return null;
  const url = obligation.invoice_file_url;
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  const isPdf = ext === "pdf";
  const contentType = isPdf ? "application/pdf" : `image/${ext || "jpeg"}`;
  const fileName = `${obligation.courier_name || "Fatura"} - ${obligation.invoice_number || obligation.week_start || "fatura"}.${ext || "pdf"}`;
  return { url, fileName, contentType };
};

function StatusBadge({ obligation, isFuture }) {
  const base = "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded";
  if (isFuture) {
    return (
      <span className={`${base} bg-blue-100 text-blue-700`}>
        <Clock className="w-3 h-3" /> Yaklaşan
      </span>
    );
  }
  if (!obligation) {
    return (
      <span className={`${base} bg-slate-100 text-slate-600`}>
        Oluşmadı
      </span>
    );
  }
  const s = obligation.status;
  if (s === "approved") {
    return (
      <span className={`${base} bg-green-100 text-green-700`}>
        <CheckCircle2 className="w-3 h-3" /> Onaylı
      </span>
    );
  }
  if (s === "uploaded") {
    return (
      <span className={`${base} bg-blue-100 text-blue-700`}>
        Yüklendi
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber-100 text-amber-700`}>
      <AlertTriangle className="w-3 h-3" /> Bekliyor
    </span>
  );
}

function ApproveModal({ open, onOpenChange, obligation, onApproved }) {
  const [declared, setDeclared] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && obligation) {
      setDeclared(String(obligation.expected_amount || ""));
      setInvoiceNo(obligation.invoice_number || "");
      setInvoiceDate(obligation.invoice_date || "");
    }
  }, [open, obligation]);

  if (!obligation) return null;
  const expected = Number(obligation.expected_amount || 0);
  const declaredNum = Number(declared || 0);
  const remainder = expected - declaredNum;

  const submit = async () => {
    if (declaredNum <= 0) {
      toast.error("Tutar 0'dan büyük olmalı");
      return;
    }
    if (declaredNum > expected + 0.01) {
      toast.error("Tutar beklenen tutardan büyük olamaz");
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API}/courier-invoice-obligations/${obligation.id}/approve`, {
        declared_amount: declaredNum,
        invoice_number: invoiceNo || undefined,
        invoice_date: invoiceDate || undefined,
      });
      toast.success(
        res.data.remainder_obligation_id
          ? `Onaylandı. Kalan ${formatMoney(remainder)} için yeni yükümlülük oluşturuldu.`
          : "Onaylandı"
      );
      onApproved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Onaylanamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="week-approve-modal">
        <DialogHeader>
          <DialogTitle>Fatura Onayla</DialogTitle>
          <DialogDescription>
            {obligation.courier_name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm bg-slate-50 border rounded p-2 flex items-center justify-between">
            <span>Beklenen Tutar:</span>
            <span className="font-bold">{formatMoney(expected)}</span>
          </div>
          {obligation.invoice_file_url && (
            <a
              href={obligation.invoice_file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Yüklenen faturayı aç <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <div>
            <Label className="text-xs">Onaylanan Tutar</Label>
            <Input
              type="number"
              step="0.01"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              className="h-9"
              data-testid="week-approve-amount"
            />
            {remainder > 0.01 && (
              <p className="text-[11px] text-amber-700 mt-1">
                Kalan {formatMoney(remainder)} için yeni "Kalan" yükümlülük oluşturulacak.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fatura No</Label>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Fatura Tarihi</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Vazgeç</Button>
          <Button onClick={submit} disabled={busy} data-testid="week-approve-submit">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Onayla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WeekDetailPanel({ companyId, week, isFuture, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);

  const fetchData = useCallback(async () => {
    if (!week) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/by-week/${companyId}`, {
        params: { week_start: week.week_start },
      });
      setData(res.data);
    } catch {
      toast.error("Hafta detayı alınamadı");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, week]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!week) return null;

  const rows = data?.rows || [];

  return (
    <div className="border-2 border-border bg-white" data-testid="week-detail-panel">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-700" />
            <h3 className="font-semibold text-base">
              {data?.week_label || week.label}
            </h3>
            {data && (
              <span className="text-sm text-muted-foreground">
                ({data.uploaded}/{data.created}/{data.total_couriers})
              </span>
            )}
            {isFuture && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" /> Yaklaşan Hafta
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm text-right">
              <div>
                Beklenen: <span className="font-bold">{formatMoney(data?.total_expected || 0)}</span>
              </div>
              {data && data.total_processed > 0 && (
                <div className="text-green-600 text-xs">
                  İşlenen: {formatMoney(data.total_processed)}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowManualModal(true)}
              className="h-8 text-xs"
              data-testid="open-manual-obligation-modal"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Manuel Fatura
            </Button>
          </div>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Bu haftada hakediş alan kurye yok.
          </div>
        ) : (
          <>
            {/* Desktop tablo */}
            <table className="hidden sm:table w-full text-sm">
              <thead className="border-b bg-muted/30 sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 text-left font-semibold">Kurye</th>
                  <th className="p-2.5 text-right font-semibold">Beklenen</th>
                  <th className="p-2.5 text-center font-semibold">Durum</th>
                  <th className="p-2.5 text-left font-semibold">Fatura</th>
                  <th className="p-2.5 text-right font-semibold">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row_key} className="border-b hover:bg-slate-50">
                    <td className="p-2.5 max-w-[240px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium truncate" title={r.courier_name}>{r.courier_name}</p>
                        {r.obligation?.is_manual && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                            Manuel
                          </span>
                        )}
                        {r.obligation?.is_remainder && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                            Kalan
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.obligation?.is_manual
                          ? (r.obligation.manual_description || "Manuel fatura")
                          : r.obligation?.is_remainder
                            ? "Kalan tutar"
                            : `${r.days_with_earnings} gün hakediş`}
                      </p>
                    </td>
                    <td className="p-2.5 text-right font-semibold tabular-nums">{formatMoney(r.expected_amount)}</td>
                    <td className="p-2.5 text-center">
                      <StatusBadge obligation={r.obligation} isFuture={isFuture && !r.obligation} />
                    </td>
                    <td className="p-2.5">
                      {r.obligation?.invoice_number ? (
                        <div className="text-xs">
                          <p>No: <strong>{r.obligation.invoice_number}</strong></p>
                          <p>Tarih: {r.obligation.invoice_date}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.obligation?.invoice_file_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => setViewingFile(buildPdfFile(r.obligation))}
                            data-testid={`week-view-btn-${r.courier_id}`}
                            title="Faturayı görüntüle"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {r.obligation?.status === "uploaded" && (
                          <Button
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => setApproveTarget(r.obligation)}
                            data-testid={`week-approve-btn-${r.courier_id}`}
                          >
                            Onayla
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-border">
              {rows.map((r) => (
                <div key={r.row_key} className="p-3" data-testid={`week-row-mob-${r.row_key}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <p className="font-medium text-sm truncate">{r.courier_name}</p>
                      {r.obligation?.is_manual && (
                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-medium">
                          Manuel
                        </span>
                      )}
                      {r.obligation?.is_remainder && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-medium">
                          Kalan
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(r.expected_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge obligation={r.obligation} isFuture={isFuture && !r.obligation} />
                      <span className="text-[10px] text-muted-foreground">
                        {r.obligation?.is_manual
                          ? (r.obligation.manual_description || "Manuel")
                          : r.obligation?.is_remainder
                            ? "Kalan"
                            : `${r.days_with_earnings} gün`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.obligation?.invoice_file_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setViewingFile(buildPdfFile(r.obligation))}
                          title="Görüntüle"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      {r.obligation?.status === "uploaded" && (
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setApproveTarget(r.obligation)}
                        >
                          Onayla
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ApproveModal
        open={!!approveTarget}
        onOpenChange={(v) => !v && setApproveTarget(null)}
        obligation={approveTarget}
        onApproved={() => { fetchData(); onChanged?.(); }}
      />

      <ManualObligationModal
        open={showManualModal}
        onOpenChange={setShowManualModal}
        companyId={companyId}
        weekStart={week.week_start}
        weekLabel={data?.week_label || week.label}
        onCreated={() => { fetchData(); onChanged?.(); }}
      />

      {viewingFile && (
        <PdfViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </div>
  );
}
