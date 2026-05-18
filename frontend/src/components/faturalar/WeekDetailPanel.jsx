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
  FileText, Loader2, CheckCircle2, AlertTriangle, Clock, Plus, Eye, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import ManualObligationModal from "./ManualObligationModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

const fetchObligationFile = async (obligation) => {
  if (!obligation?.id) return null;
  try {
    const res = await axios.get(
      `${API}/courier-invoice-obligations/${obligation.id}/file`,
      { responseType: "blob" }
    );
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const contentType = blob.type || "application/pdf";
    const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1] || "bin";
    const fileName = `${obligation.courier_name || "Fatura"} - ${obligation.invoice_number || obligation.week_start || "fatura"}.${ext}`;
    return { url, fileName, contentType, _revoke: () => URL.revokeObjectURL(url) };
  } catch (e) {
    toast.error(e?.response?.data?.detail || "Fatura yüklenemedi");
    return null;
  }
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

function ApproveModal({ open, onOpenChange, obligation, onApproved, onViewFile, pdfOpen }) {
  const [declared, setDeclared] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && obligation) {
      setDeclared(String(obligation.expected_amount || ""));
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
      <DialogContent
        className="max-w-md"
        data-testid="week-approve-modal"
        onPointerDownOutside={(e) => { if (pdfOpen) e.preventDefault(); }}
        onInteractOutside={(e) => { if (pdfOpen) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (pdfOpen) e.preventDefault(); }}
      >
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
          {obligation.invoice_file_key || obligation.invoice_file_url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onViewFile?.(obligation)}
              className="w-full h-9 gap-1.5 text-sm"
              data-testid="week-approve-view-file"
            >
              <Eye className="w-4 h-4" />
              Yüklenen Faturayı Görüntüle
            </Button>
          ) : null}
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

export default function WeekDetailPanel({ companyId, week, isFuture, isSuperAdmin, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCreating, setBulkCreating] = useState(false);

  const weekStart = week?.week_start;
  const fetchData = useCallback(async () => {
    if (!weekStart) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/by-week/${companyId}`, {
        params: { week_start: weekStart },
      });
      setData(res.data);
    } catch {
      toast.error("Hafta detayı alınamadı");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await axios.delete(`${API}/courier-invoice-obligations/${deleteTarget.id}`);
      toast.success(
        res.data.recreated
          ? "Fatura silindi. Aynı kuryeye yeni 'Bekliyor' yükümlülük oluşturuldu."
          : "Fatura silindi"
      );
      setDeleteTarget(null);
      fetchData();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  if (!week) return null;

  const rows = data?.rows || [];
  // "Predicted" (henüz obligation oluşmamış, hakediş tahminli) satırlar
  const selectablePredicted = rows.filter((r) => !r.obligation && r.expected_amount > 0);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === selectablePredicted.length) return new Set();
      return new Set(selectablePredicted.map((r) => r.courier_id));
    });
  };

  const toggleSelect = (cid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  };

  const handleBulkCreate = async () => {
    const picked = selectablePredicted.filter((r) => selectedIds.has(r.courier_id));
    if (picked.length === 0) return;
    setBulkCreating(true);
    try {
      const res = await axios.post(
        `${API}/courier-invoice-obligations/bulk-create/${companyId}`,
        {
          week_start: weekStart,
          couriers: picked.map((r) => ({
            courier_id: r.courier_id,
            expected_amount: r.expected_amount,
          })),
        }
      );
      toast.success(`${res.data.created} fatura yükümlülüğü oluşturuldu`);
      setSelectedIds(new Set());
      fetchData();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Oluşturulamadı");
    } finally {
      setBulkCreating(false);
    }
  };

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
            {selectablePredicted.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleSelectAll}
                  className="h-8 text-xs"
                  data-testid="bulk-select-all"
                >
                  {selectedIds.size === selectablePredicted.length ? "Seçimi Temizle" : "Tümünü Seç"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkCreate}
                  disabled={selectedIds.size === 0 || bulkCreating}
                  className="h-8 text-xs gap-1"
                  data-testid="bulk-create-obligations"
                >
                  {bulkCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Oluştur ({selectedIds.size})
                </Button>
              </>
            )}
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
                  <th className="p-2.5 w-8"></th>
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
                    <td className="p-2.5 text-center">
                      {!r.obligation && r.expected_amount > 0 ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.courier_id)}
                          onChange={() => toggleSelect(r.courier_id)}
                          className="w-4 h-4 cursor-pointer accent-slate-900"
                          data-testid={`week-row-checkbox-${r.courier_id}`}
                        />
                      ) : null}
                    </td>
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
                            onClick={async () => {
                              const file = await fetchObligationFile(r.obligation);
                              if (file) setViewingFile(file);
                            }}
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
                        {isSuperAdmin && r.obligation && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteTarget(r.obligation)}
                            data-testid={`week-delete-btn-${r.courier_id}`}
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
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
                      {!r.obligation && r.expected_amount > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.courier_id)}
                          onChange={() => toggleSelect(r.courier_id)}
                          className="w-4 h-4 cursor-pointer accent-slate-900"
                        />
                      )}
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
                          onClick={async () => {
                            const file = await fetchObligationFile(r.obligation);
                            if (file) setViewingFile(file);
                          }}
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
                      {isSuperAdmin && r.obligation && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600"
                          onClick={() => setDeleteTarget(r.obligation)}
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
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
        onViewFile={async (o) => {
          const file = await fetchObligationFile(o);
          if (file) setViewingFile(file);
        }}
        pdfOpen={!!viewingFile}
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
        <PdfViewerModal
          file={viewingFile}
          onClose={() => {
            viewingFile._revoke?.();
            setViewingFile(null);
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Faturayı Sil"
        description={
          deleteTarget
            ? deleteTarget.status === "approved" || deleteTarget.status === "uploaded"
              ? `${deleteTarget.courier_name} - ${formatMoney(deleteTarget.expected_amount || deleteTarget.declared_amount)} fatura silinecek. Kuryeye aynı hafta için yeni "Bekliyor" yükümlülük otomatik olarak oluşturulacak. Devam etmek istiyor musunuz?`
              : `${deleteTarget.courier_name} - ${formatMoney(deleteTarget.expected_amount)} ${deleteTarget.is_manual ? "manuel " : ""}fatura silinecek. Bu işlem geri alınamaz.`
            : ""
        }
        confirmText={deleting ? "Siliniyor..." : "Sil"}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
