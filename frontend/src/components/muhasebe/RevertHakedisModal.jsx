import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, Undo2 } from "lucide-react";

export default function RevertHakedisModal({
  open,
  onOpenChange,
  weekLabel,
  processedCount,
  totalAmount,
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
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Undo2 className="w-5 h-5" />
            Seçili Hakedişleri Geri Al
          </DialogTitle>
          <DialogDescription>
            Bu işlem geri alınamaz. Dikkatli olun.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Uyarı */}
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Seçili kuryelerin hakedişleri silinecek!</p>
                <ul className="list-disc list-inside text-xs space-y-1">
                  <li>Kurye bakiyelerinden düşülecek</li>
                  <li>Kazanılan JetPuan'lar geri alınacak</li>
                  <li>Bu işlem geri alınamaz</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Özet */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Hafta:</span>
              <span className="font-medium">{weekLabel}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Seçili Kurye:</span>
              <span className="font-medium">{processedCount}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-2 mt-2">
              <span className="text-slate-600">Geri Alınacak Tutar:</span>
              <span className="font-bold text-lg text-red-600">{formatMoney(totalAmount)}</span>
            </div>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Vazgeç
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm} 
            disabled={loading}
            data-testid="confirm-revert-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                İşleniyor...
              </>
            ) : (
              <>
                <Undo2 className="w-4 h-4 mr-2" />
                Geri Al ({processedCount})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
