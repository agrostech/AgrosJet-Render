import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Pencil, AlertTriangle, XCircle, Power, PowerOff } from "lucide-react";

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
  onActivate 
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
                className={`border-b border-border hover:bg-slate-50 ${c.termination_start_date ? 'bg-orange-50' : ''}`}
              >
                <TableCell className="font-medium">
                  {c.name}
                  {c.termination_start_date && (
                    <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded font-semibold">
                      Fesih: {c.termination_remaining_days} gün
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                <TableCell className="font-mono text-sm">{c.plate}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => onDetail(c)} className="h-8 px-3 border-2">
                      Detaylar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEdit(c)} className="h-8 px-3 border-2 hover:bg-blue-50 hover:text-blue-600">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {activeTab === "active" ? (
                      <>
                        {c.termination_start_date ? (
                          <Button size="sm" variant="outline" onClick={() => onCancelTermination(c.id)} className="h-8 px-3 border-2 hover:bg-green-50 hover:text-green-600" title="Fesih İptal">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => onStartTermination(c.id)} className="h-8 px-3 border-2 hover:bg-orange-50 hover:text-orange-600" title="Fesih Başlat">
                            <AlertTriangle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => onDeactivate(c.id)} className="h-8 px-3 border-2 hover:bg-slate-100 hover:text-slate-700" title="Pasife Al">
                          <PowerOff className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => onActivate(c.id)} className="h-8 px-3 border-2 hover:bg-green-50 hover:text-green-600" title="Aktife Al">
                        <Power className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onRemove(c.id)} className="h-8 px-3 border-2 hover:bg-red-50 hover:text-red-600">
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
