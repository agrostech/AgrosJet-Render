/**
 * Ay Faturaları (Birleşik) Kartı
 *
 * Hem yeni sistem (approved obligation) hem eski sistem (invoices koleksiyonu)
 * faturalarını tek listede gösterir. Kendi ay seçicisi vardır.
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Receipt, ChevronLeft, ChevronRight, Loader2, Download, FileDown, Eye, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

export default function MonthlyInvoicesCard({ companyId, isSuperAdmin }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total_amount: 0 });
  const [mergingPdf, setMergingPdf] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAndView = async (item) => {
    try {
      const endpoint = item.source === "obligation"
        ? `${API}/courier-invoice-obligations/${item.id}/file`
        : `${API}/invoices/download/${item.id}`;
      const res = await axios.get(endpoint, { responseType: "blob" });
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const contentType = blob.type || "application/pdf";
      const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1] || "bin";
      const fileName = `${item.courier_name || "Fatura"} - ${item.invoice_number || item.invoice_date || "fatura"}.${ext}`;
      setViewingFile({ url, fileName, contentType, _revoke: () => URL.revokeObjectURL(url) });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Fatura yüklenemedi");
    }
  };

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/monthly-invoices/${companyId}`, {
        params: { year, month },
      });
      setData(res.data);
    } catch {
      toast.error("Ay faturaları alınamadı");
      setData({ items: [], total_amount: 0 });
    } finally {
      setLoading(false);
    }
  }, [companyId, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const next = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.source === "obligation") {
        const res = await axios.delete(`${API}/courier-invoice-obligations/${deleteTarget.id}`);
        toast.success(
          res.data.recreated
            ? "Fatura silindi. Aynı kuryeye yeni 'Bekliyor' yükümlülük oluşturuldu."
            : "Fatura silindi"
        );
      } else {
        await axios.delete(`${API}/invoices/admin/${deleteTarget.id}`);
        toast.success("Fatura silindi");
      }
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  const downloadOldInvoice = async (invId) => {
    try {
      const res = await axios.get(`${API}/invoices/download/${invId}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers["content-disposition"]?.split('filename="')[1]?.replace('"', "") || "fatura";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Fatura indirilemedi");
    }
  };

  const downloadMergedPdf = async () => {
    setMergingPdf(true);
    try {
      const res = await axios.get(
        `${API}/courier-invoice-obligations/monthly-invoices/${companyId}/merged-pdf`,
        { params: { year, month }, responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Kurye_Faturalari_${MONTHS_TR[month - 1]}_${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF indirildi");
    } catch (e) {
      let detail = "PDF birleştirilemedi";
      if (e.response?.data instanceof Blob) {
        try {
          const txt = await e.response.data.text();
          detail = JSON.parse(txt).detail || detail;
        } catch {/* ignore */}
      }
      toast.error(detail);
    } finally {
      setMergingPdf(false);
    }
  };

  return (
    <div className="border-2 border-border bg-white" data-testid="monthly-invoices-card">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-700" />
            <h3 className="font-semibold text-sm">Ay Faturaları</h3>
            <span className="text-xs text-muted-foreground">({data.items.length})</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={downloadMergedPdf}
              disabled={mergingPdf || loading || data.items.length === 0}
              className="h-8 text-xs"
              data-testid="monthly-invoices-merge-pdf"
              title="Bu ayın tüm faturalarını tek PDF olarak indir"
            >
              {mergingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : (
                <FileDown className="w-3.5 h-3.5 mr-1" />
              )}
              Tek PDF İndir
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={prev}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {MONTHS_TR[month - 1]} {year}
              </span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={next}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Bu ayda fatura yok.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.items.map((it) => (
              <div key={`${it.source}-${it.id}`} className="p-3 flex items-center gap-3"
                   data-testid={`monthly-invoice-row-${it.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{it.courier_name || "—"}</p>
                    {it.source === "obligation" ? (
                      <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        Haftalık
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        Eski
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {it.invoice_number ? `No: ${it.invoice_number}` : "(no yok)"}
                    {it.invoice_date && ` • Tarih: ${it.invoice_date}`}
                    {it.week_start && ` • Hafta: ${it.week_start} → ${it.week_end}`}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                  {formatMoney(it.amount)}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {((it.source === "obligation" && it.file_url) || it.source === "invoice") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => fetchAndView(it)}
                      title="Görüntüle"
                      data-testid={`monthly-invoice-view-${it.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {it.source === "invoice" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => downloadOldInvoice(it.id)}
                      title="İndir"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {isSuperAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(it)}
                      title="Sil"
                      data-testid={`monthly-invoice-delete-${it.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.items.length > 0 && (
        <div className="p-3 border-t border-border bg-slate-50/60 flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Toplam:</span>
          <span className="font-bold">{formatMoney(data.total_amount)}</span>
        </div>
      )}

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
            ? deleteTarget.source === "obligation"
              ? `${deleteTarget.courier_name || ""} - ${formatMoney(deleteTarget.amount)} fatura silinecek. Kuryeye aynı hafta için yeni "Bekliyor" yükümlülük otomatik olarak oluşturulacak. Devam etmek istiyor musunuz?`
              : `${deleteTarget.courier_name || ""} - ${formatMoney(deleteTarget.amount)} (eski) fatura silinecek. Bu işlem geri alınamaz.`
            : ""
        }
        confirmText={deleting ? "Siliniyor..." : "Sil"}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
