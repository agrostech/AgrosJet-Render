import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + " ₺";

const STATUS_LABELS = {
  pending: { label: "Bekliyor (Yüklenmemiş)", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  uploaded: { label: "Onay Bekliyor", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Onaylandı", cls: "bg-green-50 text-green-700 border-green-200" },
};

function ApproveModal({ item, open, onClose, onApproved }) {
  const [declared, setDeclared] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && item) {
      setDeclared(String(item.expected_amount || ""));
      setInvoiceNumber(item.invoice_number || "");
      setInvoiceDate(item.invoice_date || "");
    }
  }, [open, item]);

  if (!item) return null;

  const declaredNum = parseFloat(declared);
  const remainder = !isNaN(declaredNum) ? Math.max(0, item.expected_amount - declaredNum) : 0;

  const handleApprove = async () => {
    if (!declaredNum || declaredNum <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    setBusy(true);
    try {
      const body = { declared_amount: declaredNum };
      if (invoiceNumber) body.invoice_number = invoiceNumber;
      if (invoiceDate) body.invoice_date = invoiceDate;
      await axios.post(`${API}/missing-invoices/${item.id}/approve`, body);
      toast.success(remainder > 0 ? `Onaylandı. Kalan ${formatMoney(remainder)} için yeni kayıt oluşturuldu.` : "Onaylandı.");
      onApproved?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Onay başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eksik Fatura Onayı</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Kurye:</span><span className="font-medium">{item.courier_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">İş Günü:</span><span>{item.business_date}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Beklenen:</span><span className="font-bold">{formatMoney(item.expected_amount)}</span></div>
          </div>
          <div>
            <Label className="text-xs">Onaylanan Tutar (TL) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              step="0.01"
              value={declared}
              onChange={(e) => setDeclared(e.target.value)}
              placeholder="Faturanın gerçek tutarını girin"
              data-testid="approve-declared-amount"
            />
            {remainder > 0 && (
              <p className="text-[11px] text-amber-700 mt-1">
                Kalan <strong>{formatMoney(remainder)}</strong> için kuryeye yeni eksik fatura kaydı oluşturulacak.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fatura No</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fatura Tarihi</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>İptal</Button>
          <Button onClick={handleApprove} disabled={busy} data-testid="approve-submit-btn">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Onayla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KuryeEksikFaturalariTab({ companyId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await axios.get(`${API}/missing-invoices?${params.toString()}`);
      setItems(res.data.items || []);
    } catch (err) {
      console.error(err);
      toast.error("Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const counts = {
    pending: items.filter((i) => i.status === "pending").length,
    uploaded: items.filter((i) => i.status === "uploaded").length,
    approved: items.filter((i) => i.status === "approved").length,
  };

  return (
    <div className="space-y-4" data-testid="kurye-eksik-faturalari-tab">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Kurye Eksik Faturaları
            </span>
            <Button size="sm" variant="ghost" onClick={fetchItems}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              Bekliyor: <strong>{counts.pending}</strong> • Onay bekliyor: <strong className="text-blue-600">{counts.uploaded}</strong> • Onaylı: <strong className="text-green-600">{counts.approved}</strong>
            </div>
            <div className="ml-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="pending">Bekliyor</SelectItem>
                  <SelectItem value="uploaded">Onay Bekliyor</SelectItem>
                  <SelectItem value="approved">Onaylanmış</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm">Bu filtre için kayıt yok.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-2 font-medium">Tarih</th>
                    <th className="p-2 font-medium">Kurye</th>
                    <th className="p-2 font-medium text-right">Beklenen</th>
                    <th className="p-2 font-medium text-right">Onaylanan</th>
                    <th className="p-2 font-medium">Durum</th>
                    <th className="p-2 font-medium">Fatura</th>
                    <th className="p-2 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const status = STATUS_LABELS[it.status] || STATUS_LABELS.pending;
                    return (
                      <tr key={it.id} className="border-b hover:bg-slate-50">
                        <td className="p-2 whitespace-nowrap">
                          {it.business_date}
                          {it.is_remainder && <span className="ml-1 text-[10px] text-amber-700">(Kalan)</span>}
                          {it.is_backfill && <span className="ml-1 text-[10px] text-slate-500">(Geçmiş)</span>}
                        </td>
                        <td className="p-2 truncate max-w-[160px]" title={it.courier_name}>{it.courier_name}</td>
                        <td className="p-2 text-right font-medium">{formatMoney(it.expected_amount)}</td>
                        <td className="p-2 text-right">{it.declared_amount != null ? formatMoney(it.declared_amount) : "-"}</td>
                        <td className="p-2">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${status.cls}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-2">
                          {it.invoice_file_url ? (
                            <button
                              onClick={() => setViewingFile({ url: it.invoice_file_url, name: it.invoice_number || "Fatura" })}
                              className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
                              data-testid={`view-invoice-${it.id}`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {it.invoice_number || "Görüntüle"}
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {it.status === "uploaded" && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => setSelected(it)} data-testid={`approve-btn-${it.id}`}>
                              Onayla
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ApproveModal
        item={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onApproved={fetchItems}
      />

      <PdfViewerModal
        open={!!viewingFile}
        onClose={() => setViewingFile(null)}
        fileUrl={viewingFile?.url}
        fileName={viewingFile?.name}
      />
    </div>
  );
}
