/**
 * Kurye Faturalarım Modal — yeni decoupled courier_invoice_obligations sistemi
 *
 * Sade akış: Kurye sadece "Fatura Yükle" butonuna basar, dosya seçer, dosya yüklenir.
 * Fatura no ve tarih sorulmaz (opsiyonel; admin onay aşamasında girilir).
 */
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Upload,
  Loader2,
  Eye,
  Send,
  Trash2,
} from "lucide-react";
import InvoiceMessageModal from "./InvoiceMessageModal";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0)) + " TL";

const fetchObligationFile = async (item) => {
  if (!item?.id) return null;
  try {
    const res = await axios.get(
      `${API}/courier-invoice-obligations/${item.id}/file`,
      { responseType: "blob" }
    );
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const contentType = blob.type || "application/pdf";
    const ext = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1] || "bin";
    const fileName = `Fatura - ${item.week_start || "yuklenen"}.${ext}`;
    return { url, fileName, contentType, _revoke: () => URL.revokeObjectURL(url) };
  } catch (e) {
    toast.error(e?.response?.data?.detail || "Fatura yüklenemedi");
    return null;
  }
};

const formatWeekLabel = (start, end) => {
  if (!start || !end) return "";
  const toShort = (s) => {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  };
  return `${toShort(start)} – ${toShort(end)}`;
};

function ObligationRow({ item, onUploaded, onRequestInvoice, onView, onCancelled }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const isPending = item.status === "pending";
  const isUploaded = item.status === "uploaded";

  // 60 dk sil yetkisi: uploaded_at'tan elapsed < 3600s ise
  const canCancel = (() => {
    if (!isUploaded || !item.uploaded_at) return false;
    try {
      const up = new Date(item.uploaded_at).getTime();
      const elapsed = (Date.now() - up) / 1000;
      return elapsed < 60 * 60;
    } catch {
      return false;
    }
  })();

  const onPick = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // aynı dosyayı yeniden seçebilmek için
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Dosya 10MB'tan büyük olamaz");
      return;
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)) {
      toast.error("Sadece PDF/JPG/PNG/WEBP yükleyebilirsiniz");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/courier-invoice-obligations/${item.id}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Fatura yüklendi, onay bekleniyor");
      onUploaded?.(res.data.item);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4"
      data-testid={`obligation-row-${item.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-tight">
            {formatWeekLabel(item.week_start, item.week_end)}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isUploaded ? "bg-blue-500" : "bg-amber-500"
              }`}
            />
            <span className="text-xs text-slate-600">
              {isUploaded ? "Yüklendi · onay bekliyor" : "Bekliyor"}
            </span>
            {item.is_remainder && (
              <span className="ml-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                Kalan
              </span>
            )}
          </div>
        </div>
        <p className="text-lg font-bold font-mono tabular-nums text-slate-900 leading-none flex-shrink-0">
          {formatMoney(item.expected_amount)}
        </p>
      </div>

      {isPending && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
            className="hidden"
            onChange={onFile}
          />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => onRequestInvoice(item)}
              className="inline-flex items-center justify-center gap-1.5 h-9 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition"
              data-testid={`obligation-request-${item.id}`}
              title="Muhasebecine WhatsApp ile fatura talep et"
            >
              <Send className="w-3.5 h-3.5" />
              Talep Et
            </button>
            <button
              type="button"
              onClick={onPick}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 h-9 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition"
              data-testid={`obligation-upload-${item.id}`}
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Fatura Yükle
            </button>
          </div>
        </>
      )}

      {isUploaded && item.invoice_file_url && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onView(item)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 text-sm font-medium text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition"
            data-testid={`obligation-view-${item.id}`}
          >
            <Eye className="w-3.5 h-3.5" />
            Faturayı Görüntüle
          </button>
          {canCancel && (
            <button
              type="button"
              disabled={canceling}
              onClick={async () => {
                if (canceling) return;
                if (!window.confirm("Yüklediğiniz faturayı geri çekmek istiyor musunuz?")) return;
                setCanceling(true);
                try {
                  await axios.post(`${API}/courier-invoice-obligations/${item.id}/courier-cancel-upload`);
                  toast.success("Fatura silindi");
                  onCancelled?.();
                } catch (e) {
                  toast.error(e.response?.data?.detail || "İşlem başarısız");
                } finally {
                  setCanceling(false);
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition disabled:opacity-60"
              data-testid={`obligation-cancel-${item.id}`}
              title="60 dakika içinde silinebilir"
            >
              {canceling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyObligationsModal({ open, onOpenChange, onUpdated, companyInfo }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [requestAmount, setRequestAmount] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations/courier/me`);
      setItems(res.data.items || []);
    } catch {
      toast.error("Fatura yükümlülükleri alınamadı");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  const handleUploaded = (updated) => {
    setItems((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    );
    onUpdated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto p-4"
        data-testid="my-obligations-modal"
        onPointerDownOutside={(e) => { if (viewingFile) e.preventDefault(); }}
        onInteractOutside={(e) => { if (viewingFile) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (viewingFile) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Faturalarım
          </DialogTitle>
        </DialogHeader>

        {!loading && items.some((o) => o.status === "pending") && (
          <p
            className="text-xs text-red-600 leading-snug mt-1"
            data-testid="my-obligations-pending-warning"
          >
            Yüklenmemiş faturalarınız var. Bu süreçte hakediş ödemesi yapılmaz ve nakit/kart tahsilatlı sipariş atamaları durdurulur. Lütfen eksik faturalarınızı yükleyin.
          </p>
        )}

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Tüm faturalarınız güncel. Bekleyen yükümlülük yok.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <ObligationRow
                key={it.id}
                item={it}
                onUploaded={handleUploaded}
                onRequestInvoice={(o) => setRequestAmount(Number(o.expected_amount || 0))}
                onView={async (o) => {
                  const file = await fetchObligationFile(o);
                  if (file) setViewingFile(file);
                }}
                onCancelled={() => {
                  fetchItems();
                  onUpdated?.();
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>

      <InvoiceMessageModal
        open={requestAmount !== null}
        onOpenChange={(v) => !v && setRequestAmount(null)}
        selectedAmount={requestAmount || 0}
        companyInfo={companyInfo}
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
    </Dialog>
  );
}
