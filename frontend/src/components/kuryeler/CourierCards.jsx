import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, XCircle, Power, PowerOff, Ghost, Merge, CreditCard, Package } from "lucide-react";

export function CourierCards({ 
  couriers, 
  activeTab, 
  filterQuery,
  onDetail, 
  onEdit, 
  onRemove, 
  onStartTermination, 
  onCancelTermination,
  onDeactivate,
  onActivate,
  onMerge,
  onPricing,
  onFinance,
  onPaymentMethods,
  onMaxPackages
}) {
  const emptyMessage = filterQuery 
    ? "Arama sonucu bulunamadı" 
    : activeTab === "active" 
      ? "Aktif kurye bulunmuyor" 
      : "Pasif kurye bulunmuyor";

  if (couriers.length === 0) {
    return (
      <div className="md:hidden border-2 border-border p-6 bg-white text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-4">
      {couriers.map((c) => (
        <div 
          key={c.id} 
          className={`border-2 border-border p-4 bg-white ${c.termination_start_date ? 'border-orange-300 bg-orange-50' : ''} ${c.is_ghost ? 'border-purple-300 bg-purple-50/50' : ''}`}
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="flex items-center gap-2">
                {c.is_ghost && (
                  <Ghost className="w-4 h-4 text-purple-500" />
                )}
                <p className="font-bold">{c.name}</p>
              </div>
              {c.is_ghost ? (
                <p className="text-sm text-purple-600 italic">Hayalet Kurye</p>
              ) : (
                <p className="font-mono text-sm text-muted-foreground">{c.phone}</p>
              )}
              {c.termination_start_date && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-semibold">
                  Fesih: {c.termination_remaining_days} gün kaldı
                </span>
              )}
            </div>
          </div>
          {!c.is_ghost && (
            <p className="text-sm mb-3">
              <span className="text-muted-foreground">Plaka:</span> <span className="font-mono">{c.plate || '-'}</span>
            </p>
          )}
          
          {/* Row 1: Details, Edit */}
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={() => onDetail(c)} className="flex-1 border-2">
              Detaylar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(c)} className="flex-1 border-2">
              Düzenle
            </Button>
          </div>
          
          {/* Row 2: Payment Methods & Max Packages */}
          <div className="flex gap-2 mb-2">
            {onPaymentMethods && (
              <Button size="sm" variant="outline" onClick={() => onPaymentMethods(c)} className="flex-1 border-2">
                <CreditCard className="w-4 h-4 mr-1" />
                <span className="text-xs">Ödeme</span>
              </Button>
            )}
            {onMaxPackages && (
              <Button size="sm" variant="outline" onClick={() => onMaxPackages(c)} className="flex-1 border-2">
                <Package className="w-4 h-4 mr-1" />
                <span className="text-xs">Maks. Paket</span>
              </Button>
            )}
          </div>
          
          {/* Row 3: Merge button for ghost couriers */}
          {c.is_ghost && onMerge && (
            <div className="mb-2">
              <Button size="sm" variant="outline" onClick={() => onMerge(c)} className="w-full border-2">
                <Merge className="w-4 h-4 mr-1" />
                <span className="text-xs">Gerçek Kurye ile Birleştir</span>
              </Button>
            </div>
          )}
          
          {/* Row 3: Action buttons */}
          <div className="flex gap-2">
            {activeTab === "active" ? (
              <>
                {c.termination_start_date ? (
                  <Button size="sm" variant="outline" onClick={() => onCancelTermination(c.id)} className="flex-1 border-2">
                    <XCircle className="w-4 h-4 mr-1" />
                    <span className="text-xs">Fesih İptal</span>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onStartTermination(c.id)} className="flex-1 border-2">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    <span className="text-xs">Fesih</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onDeactivate(c.id)} className="flex-1 border-2">
                  <PowerOff className="w-4 h-4 mr-1" />
                  <span className="text-xs">Pasif</span>
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onActivate(c.id)} className="flex-1 border-2">
                <Power className="w-4 h-4 mr-1" />
                <span className="text-xs">Aktif Yap</span>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onRemove(c.id)} className="flex-1 border-2">
              <Trash2 className="w-4 h-4 mr-1" />
              <span className="text-xs">Çıkar</span>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
