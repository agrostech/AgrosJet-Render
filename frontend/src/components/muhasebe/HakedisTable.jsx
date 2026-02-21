import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, CheckCircle2, Clock } from "lucide-react";

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' TL';
};

export default function HakedisTable({ 
  couriers, 
  selectedIds, 
  onToggleSelect, 
  onToggleSelectAll,
  onToggleSelectAllProcessed,
  summary,
  isCurrentWeek = false
}) {
  // İşlenmemiş ve tutarı > 0 olan kuryeler (hakediş ekleme için)
  const selectableCouriers = couriers.filter(c => !c.is_processed && c.amount > 0);
  const allUnprocessedSelected = selectableCouriers.length > 0 && selectableCouriers.every(c => selectedIds.includes(c.courier_id));
  
  // İşlenmiş kuryeler (geri alma için)
  const processedCouriers = couriers.filter(c => c.is_processed);
  const allProcessedSelected = processedCouriers.length > 0 && processedCouriers.every(c => selectedIds.includes(c.courier_id));
  
  // Saatlik ücretli kurye var mı kontrol et
  const hasHourlyRates = couriers.some(c => c.hourly_rate > 0);
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-3 w-10">
              {/* Tümünü seç header - işlenmemişler için */}
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={allUnprocessedSelected}
                  onCheckedChange={onToggleSelectAll}
                  disabled={selectableCouriers.length === 0}
                  className="data-[state=checked]:bg-primary"
                  data-testid="select-all-checkbox"
                  title="Bekleyenleri seç"
                />
              </div>
            </th>
            <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Kurye</th>
            <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden sm:table-cell">Telefon</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Sipariş</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider hidden md:table-cell">Mesafe</th>
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Paket</th>
            {hasHourlyRates && (
              <th className="text-right p-3 font-semibold text-xs text-amber-600 uppercase tracking-wider">
                <span className="flex items-center justify-end gap-1">
                  <Clock className="w-3 h-3" />
                  Saatlik
                </span>
              </th>
            )}
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Toplam</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider w-24">
              <div className="flex flex-col items-center gap-0.5">
                <span>Durum</span>
                {/* İşlenmişleri seç butonu - sadece current week'te göster */}
                {isCurrentWeek && processedCouriers.length > 0 && (
                  <button
                    onClick={onToggleSelectAllProcessed}
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                      allProcessedSelected 
                        ? 'bg-amber-200 text-amber-800' 
                        : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                    }`}
                    title="İşlenmişleri seç/kaldır"
                  >
                    {allProcessedSelected ? 'Kaldır' : 'Hepsini Seç'}
                  </button>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((courier, idx) => {
            // İşlenmemiş ve tutarı > 0 olanlar hakediş için seçilebilir
            // İşlenmiş olanlar geri alma için seçilebilir (sadece current week)
            const isProcessed = courier.is_processed;
            const canSelectForApply = !isProcessed && courier.amount > 0;
            const canSelectForRevert = isProcessed && isCurrentWeek;
            const isSelectable = canSelectForApply || canSelectForRevert;
            const isSelected = selectedIds.includes(courier.courier_id);
            
            return (
              <tr 
                key={courier.courier_id}
                className={`border-b hover:bg-slate-50 transition-colors ${
                  isProcessed ? 'bg-green-50/50' : ''
                } ${courier.amount === 0 ? 'opacity-50' : ''} ${
                  isSelected && isProcessed ? 'bg-amber-50/70' : ''
                }`}
                data-testid={`courier-row-${courier.courier_id}`}
              >
                <td className="p-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(courier.courier_id)}
                    disabled={!isSelectable}
                    className={`${isProcessed && isSelected ? 'data-[state=checked]:bg-amber-500' : 'data-[state=checked]:bg-primary'}`}
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
                    {courier.distance_km?.toFixed(1) || 0} km
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="font-mono text-slate-700">
                    {formatMoney(courier.package_amount || courier.amount)}
                  </span>
                </td>
                {hasHourlyRates && (
                  <td className="p-3 text-right">
                    {courier.hourly_rate > 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-amber-700 font-semibold">
                          {formatMoney(courier.hourly_earnings || 0)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {courier.active_hours?.toFixed(1) || 0}s × {courier.hourly_rate}₺
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">-</span>
                    )}
                  </td>
                )}
                <td className="p-3 text-right">
                  <span className="font-semibold font-mono text-slate-800">
                    {formatMoney(courier.amount)}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {isProcessed ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded ${
                      isSelected 
                        ? 'text-amber-700 bg-amber-100 border border-amber-300' 
                        : 'text-green-700 bg-green-100'
                    }`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {isSelected ? 'Seçildi' : 'İşlendi'}
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
            <td className="p-3 text-right font-mono text-slate-700">
              {formatMoney((summary.total_amount || 0) - (summary.total_hourly_earnings || 0))}
            </td>
            {hasHourlyRates && (
              <td className="p-3 text-right font-mono text-amber-700">
                {formatMoney(summary.total_hourly_earnings || 0)}
              </td>
            )}
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
