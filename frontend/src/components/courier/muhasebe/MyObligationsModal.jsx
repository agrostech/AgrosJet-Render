/**
 * Kurye Faturalarım Modal — yeni decoupled courier_invoice_obligations sistemi
 *
 * Pending + Uploaded fatura yükümlülüklerini listeler. Kurye pending olanlar için
 * fatura no, fatura tarihi ve dosya yükleyebilir. Uploaded olanlar için dosya
 * önizlemesi sunar (R2 presigned URL).
 */
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ExternalLink,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0)) + " TL";

const formatWeekLabel = (start, end) => {
  if (!start || !end) return "";
  // "YYYY-MM-DD" → "DD.MM" – "DD.MM.YYYY"
  const toShort = (s) => {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  };
  return `${toShort(start)} – ${toShort(end)}`;
};

function ObligationRow({ item, onUploaded }) {
  const fileInputRef = useRef(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isPending = item.status === "pending";
  const isUploaded = item.status === "uploaded";

  const onPick = () => fileInputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be re-picked
    if (!file) return;
    if (!invoiceNumber.trim()) {
      toast.error("Fatura numarası zorunlu");
      return;
    }
    if (!invoiceDate.trim()) {
      toast.error("Fatura tarihi zorunlu");
      return;
    }
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
      fd.append("invoice_number", invoiceNumber.trim());
      fd.append("invoice_date", invoiceDate.trim());
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
      className="border rounded-lg bg-white"
      data-testid={`obligation-row-${item.id}`}
    >
      <div className="p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              {formatWeekLabel(item.week_start, item.week_end)}
            </span>
            {item.is_remainder && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 border-amber-300 text-amber-700">
                Kalan
              </Badge>
            )}
            {isPending && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 border-amber-300 text-amber-700">
                <AlertTriangle className="w-3 h-3 mr-1" /> Bekliyor
              </Badge>
            )}
            {isUploaded && (
              <Badge variant="outline" className="text-[10px] py-0 h-4 border-blue-300 text-blue-700">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Yüklendi
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Beklenen tutar:{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(item.expected_amount)}
            </span>
          </div>
          {isUploaded && (
            <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
              <span>No: <strong>{item.invoice_number}</strong></span>
              <span>•</span>
              <span>Tarih: <strong>{item.invoice_date}</strong></span>
              {item.invoice_file_url && (
                <>
                  <span>•</span>
                  <a
                    href={item.invoice_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    data-testid={`obligation-file-${item.id}`}
                  >
                    Dosyayı Aç <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        {isPending && (
          <Button
            size="sm"
            variant={expanded ? "secondary" : "default"}
            onClick={() => setExpanded((p) => !p)}
            data-testid={`obligation-expand-${item.id}`}
          >
            {expanded ? "Kapat" : "Fatura Yükle"}
          </Button>
        )}
      </div>

      {isPending && expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-slate-50/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Fatura Numarası</Label>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Örn: ABC2026000001"
              className="h-8 text-sm"
              data-testid={`obligation-invoice-no-${item.id}`}
            />
          </div>
          <div>
            <Label className="text-[11px] flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fatura Tarihi
            </Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-8 text-sm"
              data-testid={`obligation-invoice-date-${item.id}`}
            />
          </div>
          <div className="sm:col-span-2 flex items-center justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              className="hidden"
              onChange={onFile}
            />
            <Button
              size="sm"
              onClick={onPick}
              disabled={busy}
              data-testid={`obligation-upload-${item.id}`}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Upload className="w-4 h-4 mr-1" />
              )}
              Dosya Seç & Yükle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MyObligationsModal({ open, onOpenChange, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

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

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const uploadedCount = items.filter((i) => i.status === "uploaded").length;
  const totalExpected = items.reduce(
    (sum, i) => sum + Number(i.expected_amount || 0),
    0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="my-obligations-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Faturalarım
          </DialogTitle>
          <DialogDescription>
            Haftalık fatura yükümlülükleriniz ve onay durumu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="border rounded p-2 bg-amber-50/40">
            <div className="text-amber-700 font-bold text-base">{pendingCount}</div>
            <div className="text-muted-foreground">Bekleyen</div>
          </div>
          <div className="border rounded p-2 bg-blue-50/40">
            <div className="text-blue-700 font-bold text-base">{uploadedCount}</div>
            <div className="text-muted-foreground">Yüklendi</div>
          </div>
          <div className="border rounded p-2">
            <div className="font-bold text-base">{formatMoney(totalExpected)}</div>
            <div className="text-muted-foreground">Toplam Beklenen</div>
          </div>
        </div>

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
              <ObligationRow key={it.id} item={it} onUploaded={handleUploaded} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
