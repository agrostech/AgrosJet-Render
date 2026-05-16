import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) => {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + " ₺";
};

const STATUS_LABELS = {
  pending: { label: "Bekliyor", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  uploaded: { label: "Yüklendi (Onay bekleniyor)", cls: "bg-blue-50 text-blue-700 border-blue-200" },
};

function ItemCard({ item, onUploaded }) {
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const canSubmit = item.status === "pending" && number.trim() && date.trim() && file;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("invoice_number", number.trim());
      fd.append("invoice_date", date);
      fd.append("file", file);
      const res = await axios.post(`${API}/missing-invoices/${item.id}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Fatura yüklendi, onay bekliyor");
      onUploaded?.(res.data.item);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yükleme başarısız");
    } finally {
      setBusy(false);
    }
  };

  const status = STATUS_LABELS[item.status] || STATUS_LABELS.pending;

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-white" data-testid={`missing-invoice-card-${item.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{item.business_date}{item.is_remainder ? " (Kalan)" : ""}</div>
          <div className="text-xl font-bold leading-tight">{formatMoney(item.expected_amount)}</div>
          {!item.is_remainder && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Nakit: {formatMoney(item.cash_amount)} • Kart: {formatMoney(item.card_amount)}
            </div>
          )}
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {item.status === "pending" && (
        <div className="space-y-2 pt-1 border-t">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Fatura No</Label>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="h-8 text-sm"
                placeholder="FAT-2026-001"
                data-testid="missing-invoice-number-input"
              />
            </div>
            <div>
              <Label className="text-[11px]">Tarih</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-sm"
                data-testid="missing-invoice-date-input"
              />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            data-testid="missing-invoice-file-input"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="flex-1 h-8 text-xs"
            >
              <Upload className="w-3.5 h-3.5 mr-1" />
              {file ? file.name.length > 22 ? file.name.slice(0, 22) + "…" : file.name : "Fatura Seç"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit || busy}
              className="h-8 text-xs"
              data-testid="missing-invoice-upload-submit"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yükle"}
            </Button>
          </div>
        </div>
      )}

      {item.status === "uploaded" && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1 border-t pt-2">
          <FileText className="w-3.5 h-3.5" />
          {item.invoice_number} • {item.invoice_date}
        </div>
      )}
    </div>
  );
}

export default function MissingInvoicesModal({ open, onClose, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/missing-invoices/courier/me`);
      setItems(res.data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  const handleUploaded = (updated) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    onChanged?.();
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const uploadedCount = items.filter((i) => i.status === "uploaded").length;
  const totalExpected = items.reduce((sum, i) => sum + (i.expected_amount || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="missing-invoices-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Eksik Faturalarım
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm">Eksik faturanız yok.</p>
            <p className="text-xs mt-1">Ödeme talebi oluşturabilirsiniz.</p>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
              <div className="font-semibold mb-0.5">{items.length} kayıt • Toplam: {formatMoney(totalExpected)}</div>
              <div className="text-amber-700">
                Bekleyen: {pendingCount} • Yüklenmiş: {uploadedCount}
              </div>
              <div className="text-[11px] text-amber-700 mt-1">
                Tüm eksik faturalarınızı kesip yüklemeden ödeme talebi oluşturamazsınız.
              </div>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onUploaded={handleUploaded} />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
