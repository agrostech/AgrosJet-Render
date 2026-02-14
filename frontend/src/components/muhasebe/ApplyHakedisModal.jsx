import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function ApplyHakedisModal({
  open,
  onOpenChange,
  selectedCount,
  totalAmount,
  weekLabel,
  addHakedis,
  setAddHakedis,
  addJetpuan,
  setAddJetpuan,
  onConfirm,
  loading
}) {
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Hakedişleri Uygula
          </DialogTitle>
          <DialogDescription>
            Seçili kuryelerin hakedişleri bakiyelerine eklenecek
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Özet */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Hafta:</span>
              <span className="font-medium">{weekLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Kurye Sayısı:</span>
              <span className="font-medium">{selectedCount}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-slate-600">Toplam Tutar:</span>
              <span className="font-bold text-lg">{formatMoney(totalAmount)}</span>
            </div>
          </div>
          
          {/* Seçenekler */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Checkbox
                id="add-hakedis"
                checked={addHakedis}
                onCheckedChange={setAddHakedis}
                data-testid="add-hakedis-checkbox"
              />
              <Label htmlFor="add-hakedis" className="flex-1 cursor-pointer">
                <span className="font-medium">Hakediş olarak işaretle</span>
                <p className="text-xs text-slate-500">İşlem hakediş olarak kaydedilir</p>
              </Label>
            </div>
            
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Checkbox
                id="add-jetpuan"
                checked={addJetpuan}
                onCheckedChange={setAddJetpuan}
                data-testid="add-jetpuan-checkbox"
              />
              <Label htmlFor="add-jetpuan" className="flex-1 cursor-pointer">
                <span className="font-medium">JetPuan ekle</span>
                <p className="text-xs text-slate-500">Kuryeye JetPuan kazandırılır</p>
              </Label>
            </div>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            İptal
          </Button>
          <Button onClick={onConfirm} disabled={loading} data-testid="confirm-apply-btn">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                İşleniyor...
              </>
            ) : (
              "Onayla ve Uygula"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
