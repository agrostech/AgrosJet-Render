import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Wallet, Upload, Loader2, FileText, AlertTriangle, CheckCircle2, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n || 0)) + " TL";

export default function PayoutRequestModal({ open, onOpenChange, courierId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open && courierId) {
      fetchCanRequest();
      setAmount("");
      setFile(null);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="payout-request-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Ödeme Talebi Oluştur
          </DialogTitle>
        </DialogHeader>

        {loading || !info ? (
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
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="payout-modal-close-btn">
                Kapat
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bakiye gösterimi */}
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
              <p className="text-xs text-green-700">Çekilebilir Bakiye</p>
              <p className="font-bold text-2xl text-green-800 font-mono">{formatMoney(info.balance)}</p>
            </div>

            {/* Aktif yüzdeli taksit */}
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

            {/* Tutar input */}
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
              <p className="text-xs text-muted-foreground mt-1">
                Minimum: {info.min_amount} TL — Maksimum: {formatMoney(info.max_amount)}
              </p>
            </div>

            {/* Hesap önizleme */}
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

            {/* Fatura yükleme */}
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
                    data-testid="payout-file-remove-btn"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                data-testid="payout-modal-cancel-btn"
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
