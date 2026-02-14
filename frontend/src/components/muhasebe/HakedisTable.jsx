import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, CheckCircle2 } from "lucide-react";

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

export default function HakedisTable({ 
  couriers, 
  selectedIds, 
  onToggleSelect, 
  onToggleSelectAll,
  summary 
}) {
  const selectableCouriers = couriers.filter(c => !c.is_processed && c.amount > 0);
  const allSelected = selectableCouriers.length > 0 && selectableCouriers.every(c => selectedIds.includes(c.courier_id));
  const someSelected = selectableCouriers.some(c => selectedIds.includes(c.courier_id));
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-3 w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={selectableCouriers.length === 0}
                className="data-[state=checked]:bg-primary"
                data-testid="select-all-checkbox"
              />
            </th>
            <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Kurye</th>
            <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden sm:table-cell">Telefon</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Sipariş</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden md:table-cell">Mesafe</th>
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Hakediş</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider w-20">Durum</th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((courier, idx) => {
            const isSelectable = !courier.is_processed && courier.amount > 0;
            const isSelected = selectedIds.includes(courier.courier_id);
            
            return (
              <tr 
                key={courier.courier_id}
                className={`border-b hover:bg-slate-50 transition-colors ${
                  courier.is_processed ? 'bg-green-50/50' : ''
                } ${courier.amount === 0 ? 'opacity-50' : ''}`}
                data-testid={`courier-row-${courier.courier_id}`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(courier.courier_id)}
                    disabled={!isSelectable}
                    className="data-[state=checked]:bg-primary"
                    data-testid={`courier-checkbox-${courier.courier_id}`}
                  />
                </td>
                <td className="p-3">
                  <span className="font-medium text-slate-800">{courier.courier_name}</span>
                </td>
                <td className="p-3 text-xs text-slate-500 font-mono hidden sm:table-cell">
                  {courier.courier_phone || "-"}
                </td>
                <td className="p-3 text-center">
                  <span className="font-semibold text-slate-700">
                    {courier.order_count}
                  </span>
                </td>
                <td className="p-3 text-center text-xs hidden md:table-cell">
                  <span className="flex items-center justify-center gap-1 text-slate-600">
                    <MapPin className="w-3 h-3" />
                    {courier.distance_km.toFixed(1)} km
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="font-semibold font-mono text-slate-800">
                    {formatMoney(courier.amount)}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {courier.is_processed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded">
                      <CheckCircle2 className="w-3 h-3" />
                      İşlendi
                    </span>
                  ) : courier.amount > 0 ? (
                    <span className="text-xs text-slate-400">Bekliyor</span>
                  ) : (
                    <span className="text-xs text-slate-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-semibold border-t-2">
            <td className="p-3"></td>
            <td className="p-3 text-slate-700">Toplam</td>
            <td className="p-3 hidden sm:table-cell"></td>
            <td className="p-3 text-center text-slate-700">
              {summary.total_orders}
            </td>
            <td className="p-3 hidden md:table-cell"></td>
            <td className="p-3 text-right font-mono text-slate-800">
              {formatMoney(summary.total_amount)}
            </td>
            <td className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
