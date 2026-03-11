import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Pencil, AlertTriangle, XCircle, Power, PowerOff, Ghost, Merge, CreditCard, Package, Coffee, Eye, Shield } from "lucide-react";

export function CourierTable({ 
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

  return (
    <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            <TableHead className="font-bold text-xs">İsim</TableHead>
            <TableHead className="font-bold text-xs">Telefon</TableHead>
            <TableHead className="font-bold text-xs">Plaka</TableHead>
            <TableHead className="font-bold text-xs text-right">İşlemler</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {couriers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            couriers.map((c) => (
              <TableRow 
                key={c.id} 
                className={`border-b border-border hover:bg-slate-50 ${c.termination_start_date ? 'bg-orange-50' : ''} ${c.is_ghost ? 'bg-purple-50/50' : ''}`}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {c.is_ghost && (
                      <Ghost className="w-4 h-4 text-purple-500" title="Hayalet Kurye" />
                    )}
                    {c.name}
                    {c.termination_start_date && (
                      <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-semibold">
                        Fesih: {c.termination_remaining_days} gün
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.is_ghost ? <span className="text-muted-foreground italic">-</span> : c.phone}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.plate || <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => onDetail(c)} className="h-8 px-3 border-2" title="Detaylar">
                      <Eye className="w-4 h-4" />
                      <span className="ml-1 text-xs">Detaylar</span>
                    </Button>
                    {onPricing && (
                      <Button size="sm" variant="outline" onClick={() => onPricing(c)} className="h-8 px-3 border-2" title="Ücretlendirme">
                        <span className="font-bold">₺</span>
                        <span className="ml-1 text-xs">Ücretlendirme</span>
                      </Button>
                    )}
                    {onPaymentMethods && (
                      <Button size="sm" variant="outline" onClick={() => onPaymentMethods(c)} className="h-8 px-3 border-2" title="Ödeme Yöntemleri">
                        <CreditCard className="w-4 h-4" />
                        <span className="ml-1 text-xs">Ödeme</span>
                      </Button>
                    )}
                    {onMaxPackages && (
                      <Button size="sm" variant="outline" onClick={() => onMaxPackages(c)} className="h-8 px-3 border-2" title="Maks. Paket">
                        <Package className="w-4 h-4" />
                        <span className="ml-1 text-xs">Paket</span>
                      </Button>
                    )}
                    {onBreakLimit && (
                      <Button size="sm" variant="outline" onClick={() => onBreakLimit(c)} className="h-8 px-3 border-2" title="Mola Ayarları">
                        <Coffee className="w-4 h-4" />
                        <span className="ml-1 text-xs">Mola</span>
                      </Button>
                    )}
                    {onPermissions && (
                      <Button size="sm" variant="outline" onClick={() => onPermissions(c)} className="h-8 px-3 border-2" title="Yetkiler">
                        <Shield className="w-4 h-4" />
                        <span className="ml-1 text-xs">Yetkiler</span>
                      </Button>
                    )}
                    {c.is_ghost && onMerge && (
                      <Button size="sm" variant="outline" onClick={() => onMerge(c)} className="h-8 px-3 border-2" title="Birleştir">
                        <Merge className="w-4 h-4" />
                        <span className="ml-1 text-xs">Birleştir</span>
                      </Button>
                    )}
                    {activeTab === "active" ? (
                      <>
                        {c.termination_start_date ? (
                          <Button size="sm" variant="outline" onClick={() => onCancelTermination(c.id)} className="h-8 px-3 border-2" title="Fesih İptal">
                            <XCircle className="w-4 h-4" />
                            <span className="ml-1 text-xs">Fesih İptal</span>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => onStartTermination(c.id)} className="h-8 px-3 border-2" title="Fesih Başlat">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="ml-1 text-xs">Fesih</span>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => onDeactivate(c.id)} className="h-8 px-3 border-2" title="Pasife Al">
                          <PowerOff className="w-4 h-4" />
                          <span className="ml-1 text-xs">Pasif</span>
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onActivate(c.id)} className="h-8 px-3 border-2" title="Aktife Al">
                        <Power className="w-4 h-4" />
                        <span className="ml-1 text-xs">Aktif</span>
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onEdit(c)} className="h-8 px-3 border-2" title="Düzenle">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onRemove(c.id)} className="h-8 px-3 border-2" title="Sil">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
