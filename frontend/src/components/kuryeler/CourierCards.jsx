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
    <div className="md:hidden space-y-1.5">
      {couriers.map((c) => (
        <div 
          key={c.id} 
          className={`border rounded-lg px-2.5 py-2 bg-white dark:bg-card ${c.termination_start_date ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30' : ''} ${c.is_ghost ? 'border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/30' : ''}`}
        >
          {/* Tek satır: bilgi + tüm butonlar */}
          <div className="flex items-center gap-2">
            {c.is_ghost && <Ghost className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate leading-tight">{c.name}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {c.is_ghost ? <span className="text-purple-600 italic">Hayalet</span> : <>{c.phone}{c.plate ? ` · ${c.plate}` : ''}</>}
                {c.termination_start_date && <span className="ml-1 text-orange-600 font-semibold">{c.termination_remaining_days}g</span>}
              </p>
            </div>
            {/* Ayar + aksiyon ikonları tek sırada */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onPaymentMethods && <button onClick={() => onPaymentMethods(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Ödeme"><CreditCard className="w-3.5 h-3.5 text-slate-400" /></button>}
              {onMaxPackages && <button onClick={() => onMaxPackages(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Paket"><Package className="w-3.5 h-3.5 text-slate-400" /></button>}
              {onBreakLimit && <button onClick={() => onBreakLimit(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Mola"><Coffee className="w-3.5 h-3.5 text-slate-400" /></button>}
              {onPermissions && <button onClick={() => onPermissions(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Yetki"><Shield className="w-3.5 h-3.5 text-slate-400" /></button>}
              <div className="w-px h-4 bg-slate-200 mx-0.5" />
              <button onClick={() => onDetail(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Detay"><Eye className="w-3.5 h-3.5 text-slate-500" /></button>
              <button onClick={() => onEdit(c)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-100" title="Düzenle"><Edit2 className="w-3.5 h-3.5 text-slate-500" /></button>
            </div>
          </div>
          {/* Alt aksiyon satırı - sadece gerekli butonlar */}
          <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
            {c.is_ghost && onMerge && (
              <Button size="sm" variant="ghost" onClick={() => onMerge(c)} className="flex-1 h-6 text-[10px] px-1.5 text-purple-600 hover:bg-purple-50">
                <Merge className="w-3 h-3 mr-0.5" /> Birleştir
              </Button>
            )}
            {activeTab === "active" ? (
              <>
                {c.termination_start_date ? (
                  <Button size="sm" variant="ghost" onClick={() => onCancelTermination(c.id)} className="flex-1 h-6 text-[10px] px-1.5 text-orange-600 hover:bg-orange-50">
                    <XCircle className="w-3 h-3 mr-0.5" /> Fesih İptal
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onStartTermination(c.id)} className="flex-1 h-6 text-[10px] px-1.5 text-orange-600 hover:bg-orange-50">
                    <AlertTriangle className="w-3 h-3 mr-0.5" /> Fesih
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onDeactivate(c.id)} className="flex-1 h-6 text-[10px] px-1.5 text-slate-600 hover:bg-slate-100">
                  <PowerOff className="w-3 h-3 mr-0.5" /> Pasif
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onActivate(c.id)} className="flex-1 h-6 text-[10px] px-1.5 text-green-600 hover:bg-green-50">
                <Power className="w-3 h-3 mr-0.5" /> Aktif
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onRemove(c.id)} className="flex-1 h-6 text-[10px] px-1.5 text-red-500 hover:bg-red-50">
              <Trash2 className="w-3 h-3 mr-0.5" /> Çıkar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
