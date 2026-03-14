import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle, XCircle, Power, PowerOff, Ghost, Merge, CreditCard, Package, Coffee, Eye, Shield, Edit2 } from "lucide-react";

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
  onMaxPackages,
  onBreakLimit,
  onPermissions
}) {
  const emptyMessage = filterQuery 
    ? "Arama sonucu bulunamadı" 
    : activeTab === "active" 
      ? "Aktif kurye bulunmuyor" 
      : "Pasif kurye bulunmuyor";

  if (couriers.length === 0) {
    return (
      <div className="md:hidden border rounded-lg p-6 bg-white dark:bg-card text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-2.5">
      {couriers.map((c) => (
        <div 
          key={c.id} 
          className={`border rounded-lg p-3 bg-white dark:bg-card ${c.termination_start_date ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30' : ''} ${c.is_ghost ? 'border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/30' : ''}`}
        >
          {/* Başlık + hızlı aksiyonlar */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              {c.is_ghost && <Ghost className="w-4 h-4 text-purple-500 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{c.name}</p>
                {c.is_ghost ? (
                  <p className="text-[11px] text-purple-600 italic">Hayalet Kurye</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{c.phone} {c.plate ? `· ${c.plate}` : ''}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {c.termination_start_date && (
                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-semibold">
                  {c.termination_remaining_days}g
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => onDetail(c)} className="h-7 w-7 p-0">
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(c)} className="h-7 w-7 p-0">
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          
          {/* Ayar butonları - 4'lü grid */}
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {onPaymentMethods && (
              <button onClick={() => onPaymentMethods(c)} className="flex flex-col items-center gap-0.5 py-1.5 px-1 border rounded text-[10px] text-muted-foreground hover:bg-slate-50">
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                Ödeme
              </button>
            )}
            {onMaxPackages && (
              <button onClick={() => onMaxPackages(c)} className="flex flex-col items-center gap-0.5 py-1.5 px-1 border rounded text-[10px] text-muted-foreground hover:bg-slate-50">
                <Package className="w-3.5 h-3.5 text-slate-500" />
                Paket
              </button>
            )}
            {onBreakLimit && (
              <button onClick={() => onBreakLimit(c)} className="flex flex-col items-center gap-0.5 py-1.5 px-1 border rounded text-[10px] text-muted-foreground hover:bg-slate-50">
                <Coffee className="w-3.5 h-3.5 text-slate-500" />
                Mola
              </button>
            )}
            {onPermissions && (
              <button onClick={() => onPermissions(c)} className="flex flex-col items-center gap-0.5 py-1.5 px-1 border rounded text-[10px] text-muted-foreground hover:bg-slate-50">
                <Shield className="w-3.5 h-3.5 text-slate-500" />
                Yetki
              </button>
            )}
          </div>
          
          {/* Aksiyon butonları - kompakt */}
          <div className="flex gap-1.5">
            {c.is_ghost && onMerge && (
              <Button size="sm" variant="outline" onClick={() => onMerge(c)} className="flex-1 h-7 text-[11px] px-2">
                <Merge className="w-3 h-3 mr-1" />
                Birleştir
              </Button>
            )}
            {activeTab === "active" ? (
              <>
                {c.termination_start_date ? (
                  <Button size="sm" variant="outline" onClick={() => onCancelTermination(c.id)} className="flex-1 h-7 text-[11px] px-2">
                    <XCircle className="w-3 h-3 mr-1" />
                    Fesih İptal
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onStartTermination(c.id)} className="flex-1 h-7 text-[11px] px-2">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Fesih
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onDeactivate(c.id)} className="flex-1 h-7 text-[11px] px-2">
                  <PowerOff className="w-3 h-3 mr-1" />
                  Pasif
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onActivate(c.id)} className="flex-1 h-7 text-[11px] px-2">
                <Power className="w-3 h-3 mr-1" />
                Aktif
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onRemove(c.id)} className="flex-1 h-7 text-[11px] px-2 text-red-600 border-red-200 hover:bg-red-50">
              <Trash2 className="w-3 h-3 mr-1" />
              Çıkar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
