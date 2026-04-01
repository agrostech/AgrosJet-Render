import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Package } from "lucide-react";

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
  isCurrentWeek = false,
  isAdminTable = false
}) {
  // Sadece hakediş tutarı > 0 olan kuryeleri göster
  const visibleCouriers = couriers.filter(c => c.amount > 0);
  
  // İşlenmemiş kuryeler (hakediş ekleme için)
  const selectableCouriers = visibleCouriers.filter(c => !c.is_processed);
  const allUnprocessedSelected = selectableCouriers.length > 0 && selectableCouriers.every(c => selectedIds.includes(c.courier_id));
  
  // İşlenmiş kuryeler (geri alma için)
  const processedCouriers = visibleCouriers.filter(c => c.is_processed);
  const allProcessedSelected = processedCouriers.length > 0 && processedCouriers.every(c => selectedIds.includes(c.courier_id));
  
  // Toplamlar
  const totalActiveHours = visibleCouriers.reduce((sum, c) => sum + (c.active_hours || 0), 0);
  const totalDistance = visibleCouriers.reduce((sum, c) => sum + (c.distance_km || 0), 0);
  const totalPackageAmount = visibleCouriers.reduce((sum, c) => sum + (c.package_amount || 0), 0);
  
  return (
    <>
    {/* Desktop Table */}
    <div className="overflow-x-auto hidden md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-3 w-10">
              <Checkbox
                checked={allUnprocessedSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={selectableCouriers.length === 0}
                className="data-[state=checked]:bg-primary"
                data-testid="select-all-checkbox"
                title="Bekleyenleri seç"
              />
            </th>
            <th className="text-left p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Kurye</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Paket Sayısı</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Çalışma Saati</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Mesafe</th>
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Paket Ücreti</th>
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Saatlik Ücret</th>
            <th className="text-right p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider">Toplam</th>
            <th className="text-center p-3 font-semibold text-xs text-slate-600 uppercase tracking-wider w-24">
              <div className="flex flex-col items-center gap-0.5">
                <span>Durum</span>
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
          {visibleCouriers.map((courier) => {
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
                } ${isSelected && isProcessed ? 'bg-amber-50/70' : ''}`}
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
                <td className="p-3 text-center">
                  <span className="font-semibold text-slate-700">{courier.order_count}</span>
                </td>
                <td className="p-3 text-center">
                  <span className="text-slate-600">{(courier.active_hours || 0).toFixed(2)}s</span>
                </td>
                <td className="p-3 text-center text-xs">
                  <span className="text-slate-600">{(courier.distance_km || 0).toFixed(2)} km</span>
                </td>
                <td className="p-3 text-right">
                  <span className="font-mono text-slate-700">{formatMoney(courier.package_amount || 0)}</span>
                </td>
                <td className="p-3 text-right">
                  {courier.hourly_rate > 0 ? (
                    <span className="font-mono text-slate-700">{formatMoney(courier.hourly_earnings || 0)}</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <span className="font-semibold font-mono text-slate-800">{formatMoney(courier.amount)}</span>
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
                  ) : (
                    <span className="text-xs text-slate-400">Bekliyor</span>
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
            <td className="p-3 text-center text-slate-700">{summary.total_orders}</td>
            <td className="p-3 text-center text-slate-700">{totalActiveHours.toFixed(2)}s</td>
            <td className="p-3 text-center text-slate-600">{totalDistance.toFixed(2)} km</td>
            <td className="p-3 text-right font-mono text-slate-700">{formatMoney(totalPackageAmount)}</td>
            <td className="p-3 text-right font-mono text-slate-700">{formatMoney(summary.total_hourly_earnings || 0)}</td>
            <td className="p-3 text-right font-mono text-slate-800">{formatMoney(summary.total_amount)}</td>
            <td className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    {/* Mobile Card View */}
    <div className="md:hidden divide-y divide-slate-100">
      {visibleCouriers.map((courier) => {
        const isProcessed = courier.is_processed;
        const canSelectForApply = !isProcessed && courier.amount > 0;
        const canSelectForRevert = isProcessed && isCurrentWeek;
        const isSelectable = canSelectForApply || canSelectForRevert;
        const isSelected = selectedIds.includes(courier.courier_id);

        return (
          <div key={courier.courier_id} className={`p-3 ${isProcessed ? 'bg-green-50/50' : ''} ${isSelected && isProcessed ? 'bg-amber-50/70' : ''}`} data-testid={`mobile-courier-${courier.courier_id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelect(courier.courier_id)}
                  disabled={!isSelectable}
                  className={`flex-shrink-0 ${isProcessed && isSelected ? 'data-[state=checked]:bg-amber-500' : 'data-[state=checked]:bg-primary'}`}
                />
                <span className="font-semibold text-sm truncate">{courier.courier_name}</span>
              </div>
              {isProcessed ? (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${isSelected ? 'text-amber-700 bg-amber-100' : 'text-green-700 bg-green-100'}`}>
                  <CheckCircle2 className="w-3 h-3 inline mr-0.5" />{isSelected ? 'Seçildi' : 'İşlendi'}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 flex-shrink-0">Bekliyor</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-1.5">
              <div className="bg-slate-50 rounded p-1.5 text-center">
                <p className="text-muted-foreground">Paket</p>
                <p className="font-semibold">{courier.order_count}</p>
              </div>
              <div className="bg-slate-50 rounded p-1.5 text-center">
                <p className="text-muted-foreground">Saat</p>
                <p className="font-semibold">{(courier.active_hours || 0).toFixed(1)}s</p>
              </div>
              <div className="bg-slate-50 rounded p-1.5 text-center">
                <p className="text-muted-foreground">Mesafe</p>
                <p className="font-semibold">{(courier.distance_km || 0).toFixed(1)} km</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <div className="bg-blue-50 rounded p-1.5 text-center">
                <p className="text-blue-600">Paket Üc.</p>
                <p className="font-semibold text-blue-700">{formatMoney(courier.package_amount || 0)}</p>
              </div>
              <div className="bg-slate-50 rounded p-1.5 text-center">
                <p className="text-muted-foreground">Saatlik</p>
                <p className="font-semibold">{courier.hourly_rate > 0 ? formatMoney(courier.hourly_earnings || 0) : '-'}</p>
              </div>
              <div className="bg-green-50 rounded p-1.5 text-center">
                <p className="text-green-600">Toplam</p>
                <p className="font-bold text-green-700">{formatMoney(courier.amount)}</p>
              </div>
            </div>
          </div>
        );
      })}
      {/* Mobile Footer Totals */}
      <div className="p-3 bg-slate-100">
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <div className="text-center">
            <p className="text-muted-foreground">Top. Paket</p>
            <p className="font-bold">{summary.total_orders}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">Top. Saat</p>
            <p className="font-bold">{totalActiveHours.toFixed(1)}s</p>
          </div>
          <div className="text-center">
            <p className="text-green-600">Genel Toplam</p>
            <p className="font-bold text-green-700">{formatMoney(summary.total_amount)}</p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
