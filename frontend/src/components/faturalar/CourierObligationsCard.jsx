/**
 * Haftalık Fatura Yükümlülükleri Kartı (Admin)
 *
 * Yeni decoupled `courier_invoice_obligations` sisteminin admin görünümü:
 *  - Pending / Uploaded / Approved sekmeleri
 *  - Uploaded kayıtlarda fatura preview + onay modal (declared_amount + invoice_no/date)
 *  - declared_amount < expected_amount ise backend otomatik kalan (remainder) oluşturur
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TABS = [
  { key: "pending", label: "Bekleyen", icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "uploaded", label: "Yüklenen", icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { key: "approved", label: "Onaylı", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
];

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

const formatWeek = (s, e) => {
  if (!s || !e) return "-";
  const toShort = (v) => v.split("-").reverse().join(".");
  return `${toShort(s)} – ${toShort(e)}`;
};

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
      <DialogContent className="max-w-md" data-testid="obligation-approve-modal">
        <DialogHeader>
          <DialogTitle>Fatura Onayla</DialogTitle>
          <DialogDescription>
            {obligation.courier_name} • {formatWeek(obligation.week_start, obligation.week_end)}
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
              data-testid="approve-declared-amount"
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={busy} data-testid="approve-submit">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Onayla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CourierObligationsCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("pending");
  const [courierFilter, setCourierFilter] = useState("");
  const [approveTarget, setApproveTarget] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/courier-invoice-obligations`, {
        params: { status: tab },
      });
      setItems(res.data.items || []);
    } catch {
      toast.error("Yükümlülükler alınamadı");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const counts = useMemo(() => {
    const c = { pending: 0, uploaded: 0, approved: 0 };
    items.forEach((i) => {
      if (c[i.status] !== undefined) c[i.status] += 1;
    });
    return c;
  }, [items]);

  const couriers = useMemo(() => {
    const m = new Map();
    items.forEach((i) => {
      if (!m.has(i.courier_id)) m.set(i.courier_id, i.courier_name || i.courier_id);
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    if (!courierFilter) return items;
    return items.filter((i) => i.courier_id === courierFilter);
  }, [items, courierFilter]);

  const totalExpected = filtered.reduce((s, i) => s + Number(i.expected_amount || 0), 0);

  return (
    <div className="border-2 border-border bg-white" data-testid="courier-obligations-card">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-700" />
            <h3 className="font-semibold text-sm">Haftalık Fatura Yükümlülükleri</h3>
            <span className="text-xs text-muted-foreground">({filtered.length})</span>
          </div>
          <div className="text-xs">
            Toplam: <span className="font-bold">{formatMoney(totalExpected)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setCourierFilter("");
                }}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-white text-foreground border-border hover:border-foreground/40"
                }`}
                data-testid={`obligations-tab-${t.key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  ({counts[t.key] ?? 0})
                </span>
              </button>
            );
          })}
        </div>

        {/* Courier filter */}
        {couriers.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <select
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="flex-1 h-9 text-sm border border-border rounded px-2 bg-white"
              data-testid="obligations-courier-filter"
            >
              <option value="">Tüm Kuryeler</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Bu sekmede kayıt yok.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="p-3 flex items-center gap-3"
                data-testid={`obligation-admin-row-${r.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">
                      {r.courier_name || r.courier_id}
                    </p>
                    {r.is_remainder && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Kalan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatWeek(r.week_start, r.week_end)}
                  </p>
                  {r.status === "uploaded" && r.invoice_number && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      No: <strong>{r.invoice_number}</strong> • Tarih: <strong>{r.invoice_date}</strong>
                    </p>
                  )}
                  {r.status === "approved" && (
                    <p className="text-[11px] text-green-700 mt-0.5">
                      Onaylanan: <strong>{formatMoney(r.declared_amount)}</strong>
                      {r.decided_by_name ? ` • ${r.decided_by_name}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-semibold font-mono">
                    {formatMoney(r.expected_amount)}
                  </span>
                  <div className="flex items-center gap-1">
                    {r.invoice_file_url && (
                      <a
                        href={r.invoice_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-xs text-primary hover:underline gap-1"
                      >
                        Fatura <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {r.status === "uploaded" && (
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setApproveTarget(r)}
                        data-testid={`obligation-approve-btn-${r.id}`}
                      >
                        Onayla
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ApproveModal
        open={!!approveTarget}
        onOpenChange={(v) => !v && setApproveTarget(null)}
        obligation={approveTarget}
        onApproved={fetchItems}
      />
    </div>
  );
}
