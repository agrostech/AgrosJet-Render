import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, AlertTriangle, XCircle, Power, PowerOff, Ghost, Merge, Bike, Phone, Clock, Edit2, Archive, ArchiveRestore } from "lucide-react";

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
  onPricing
}) {
  const emptyMessage = filterQuery 
    ? "Arama sonucu bulunamadı" 
    : activeTab === "active" 
      ? "Aktif kurye bulunmuyor" 
      : "Pasif kurye bulunmuyor";

  if (couriers.length === 0) {
    return (
      <Card className="md:hidden">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Bike className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:hidden">
      <CardContent className="p-0 divide-y">
        {couriers.map((c) => (
          <div 
            key={c.id}
            className={`p-3 hover:bg-slate-50 transition-colors ${c.termination_start_date ? 'bg-orange-50' : ''} ${c.is_ghost ? 'bg-purple-50/50' : ''}`}
            onClick={() => onDetail(c)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  c.is_ghost ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {c.is_ghost ? (
                    <Ghost className="w-5 h-5 text-purple-600" />
                  ) : (
                    <Bike className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.is_ghost ? (
                    <p className="text-xs text-purple-600 italic">Hayalet Kurye</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{c.address || '-'}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {!c.is_ghost && c.phone && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {c.phone}
                      </span>
                    )}
                    {!c.is_ghost && c.plate && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {c.plate}
                      </span>
                    )}
                    {c.termination_start_date && (
                      <span className="text-xs text-orange-600 font-medium">
                        Fesih: {c.termination_remaining_days} gün
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {onPricing && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0"
                    onClick={() => onPricing(c)}
                  >
                    <span className="text-green-600 font-bold">₺</span>
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 w-8 p-0"
                  onClick={() => onEdit(c)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                {activeTab === "active" ? (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0"
                    onClick={() => onDeactivate(c.id)}
                  >
                    <Archive className="w-4 h-4 text-slate-500" />
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0"
                    onClick={() => onActivate(c.id)}
                  >
                    <ArchiveRestore className="w-4 h-4 text-green-600" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
