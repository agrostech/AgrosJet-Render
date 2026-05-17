/**
 * Manuel Fatura Yükümlülüğü Oluşturma Modalı (Admin)
 *
 * Admin bir kurye seçer, tutar girer ve seçili hafta için manuel obligation oluşturur.
 * Oluşan kayıt kuryenin Faturalarım modalına düşer; admin de WeekDetailPanel'de görür.
 */
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Search } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ManualObligationModal({ open, onOpenChange, companyId, weekStart, weekLabel, onCreated }) {
  const [couriers, setCouriers] = useState([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch("");
    setAmount("");
    setDescription("");
    const fetchCouriers = async () => {
      setLoadingCouriers(true);
      try {
        const res = await axios.get(`${API}/companies/${companyId}/couriers`);
        setCouriers(Array.isArray(res.data) ? res.data : res.data?.couriers || []);
      } catch {
        toast.error("Kurye listesi alınamadı");
        setCouriers([]);
      } finally {
        setLoadingCouriers(false);
      }
    };
    fetchCouriers();
  }, [open, companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return couriers.slice(0, 30);
    return couriers
      .filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [couriers, search]);

  const submit = async () => {
    if (!selected) {
      toast.error("Kurye seçin");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    setBusy(true);
    try {
      await axios.post(`${API}/courier-invoice-obligations/manual/${companyId}`, {
        courier_id: selected.id,
        amount: amt,
        week_start: weekStart,
        description: description.trim() || undefined,
      });
      toast.success(`${selected.name} için ${amt.toFixed(2)} TL fatura yükümlülüğü oluşturuldu`);
      onCreated?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="manual-obligation-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" /> Manuel Fatura Oluştur
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{weekLabel}</span> haftası için kuryeye fatura yükümlülüğü oluşturur.
            Kurye, Faturalarım ekranında bu kaydı görüp dosya yükleyebilir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Kurye seçici */}
          <div>
            <Label className="text-xs">Kurye</Label>
            {selected ? (
              <div className="flex items-center justify-between p-2 border rounded-md bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selected.name}</p>
                  <p className="text-[11px] text-muted-foreground">{selected.phone}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(null)}
                  className="h-7"
                >
                  Değiştir
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Ada veya telefona göre ara..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-7"
                    data-testid="manual-obligation-courier-search"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md mt-1">
                  {loadingCouriers ? (
                    <div className="p-4 text-center">
                      <Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">Kurye bulunamadı</p>
                  ) : (
                    filtered.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 border-b last:border-0"
                        data-testid={`manual-obligation-courier-${c.id}`}
                      >
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.phone}</p>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <Label className="text-xs">Tutar (TL)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Örn: 1500.00"
              className="h-9"
              data-testid="manual-obligation-amount"
            />
          </div>

          <div>
            <Label className="text-xs">Açıklama (opsiyonel)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Örn: 5 Mayıs ek mesai için fatura"
              rows={2}
              className="text-sm"
              data-testid="manual-obligation-description"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Vazgeç
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !selected || !amount}
            data-testid="manual-obligation-submit"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
