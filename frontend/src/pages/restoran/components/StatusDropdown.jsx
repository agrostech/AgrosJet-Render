/**
 * StatusDropdown - Sipariş durumu değiştirme dropdown'u
 * 
 * Tüm sipariş türleri için TEK component:
 * - Normal siparişler (kurye atanmış/atanmamış)
 * - Restoran teslimatı siparişleri
 * - Platform siparişleri (Getir, Trendyol, vb.)
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

// Hazırlama süreleri
const PREPARATION_TIMES = [
  { value: 5, label: "5 dakika" },
  { value: 15, label: "15 dakika" },
  { value: 30, label: "30 dakika" },
  { value: 45, label: "45 dakika" },
  { value: 60, label: "60 dakika" },
];

// Status bilgileri - orderUtils.js ile AYNI renkler
const ORDER_STATUSES = {
  pending: { label: "Beklemede", color: "bg-yellow-300/50" },
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-300/50" },
  scheduled: { label: "Planlandı", color: "bg-purple-300/50" },
  ready: { label: "Hazır", color: "bg-orange-300/50" },
  confirmed: { label: "Onaylandı", color: "bg-blue-300/50" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-300/50" },
  picked_up: { label: "Teslim Alındı", color: "bg-teal-300/50" },
  on_the_way: { label: "Yolda", color: "bg-cyan-300/50" },
  delivered: { label: "Teslim Edildi", color: "bg-green-300/50" },
  cancelled: { label: "İptal", color: "bg-red-300/50" },
  restaurant_delivery: { label: "Restoran Teslimatı", color: "bg-orange-300/50" },
};

export default function StatusDropdown({
  order,
  onStatusChange,
  onPreparationTimeChange,
  onCancelClick,
  getCountdown,
  disabled = false,
  canChangeStatus = true, // Sipariş durumu değiştirme izni
}) {
  const status = order.status;
  const statusInfo = ORDER_STATUSES[status] || { label: status, color: "bg-gray-100" };
  const isRestaurantDelivery = order.is_restaurant_delivery;
  const hasCourier = !!order.courier_id;
  const isCompleted = status === "delivered" || status === "cancelled";

  // Tamamlanmış siparişler için statik badge
  if (isCompleted) {
    return (
      <span 
        className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-1 rounded border border-slate-300/50 inline-block text-center opacity-70 whitespace-nowrap min-w-[135px]`}
        data-testid={`order-status-badge-${order.id}`}
      >
        {statusInfo.label}
      </span>
    );
  }

  // İzin kontrolü - Restoran teslimatı olan siparişler için bu izin aranmaz
  const hasPermission = isRestaurantDelivery || canChangeStatus;
  
  // İzin yoksa statik badge göster (dakikalı gösterim için countdown kullan)
  if (!hasPermission) {
    // Hazırlanıyor durumunda countdown varsa dakikalı göster
    let displayLabel = statusInfo.label;
    if ((status === "preparing" || status === "scheduled") && order.preparation_end_at && getCountdown) {
      const countdown = getCountdown(order.preparation_end_at);
      if (countdown && countdown.text) {
        displayLabel = countdown.text;
      }
    }
    
    return (
      <span 
        className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-1 rounded border border-slate-300/50 inline-block text-center whitespace-nowrap min-w-[135px]`}
        data-testid={`order-status-badge-${order.id}`}
      >
        {displayLabel}
      </span>
    );
  }

  // Restoran teslimatı siparişleri için dropdown
  if (isRestaurantDelivery) {
    return (
      <Select
        value={status}
        onValueChange={(newValue) => {
          if (newValue === "cancelled") {
            onCancelClick?.(order);
          } else {
            onStatusChange?.(order.id, newValue);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger 
          className="bg-orange-100 text-orange-700 font-medium text-xs px-2 py-0.5 h-7 border border-orange-300/50 w-[135px] shadow-sm"
          data-testid={`order-status-dropdown-${order.id}`}
        >
          <SelectValue>{statusInfo.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <div className="px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-50">Restoran Teslimatı</div>
          <SelectItem value="preparing" className="text-xs">Hazırlanıyor</SelectItem>
          <SelectItem value="on_the_way" className="text-xs">Yolda</SelectItem>
          <SelectItem value="delivered" className="text-xs">Teslim Edildi</SelectItem>
          <SelectItem value="cancelled" className="text-xs">İptal Edildi</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Kurye atanmış siparişler - sadece hazırlama süresi ve iptal
  if (hasCourier) {
    return (
      <Select
        value={status}
        onValueChange={(newValue) => {
          if (newValue === "cancelled") {
            onCancelClick?.(order);
          } else if (newValue.startsWith("preparing_")) {
            const minutes = parseInt(newValue.split("_")[1]);
            onPreparationTimeChange?.(order.id, minutes);
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger 
          className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-0.5 h-7 border border-slate-300/50 w-[135px] shadow-sm`}
          data-testid={`order-status-dropdown-${order.id}`}
        >
          <SelectValue>
            {(status === "preparing" || status === "scheduled") && order.preparation_end_at
              ? getCountdown?.(order.preparation_end_at)?.text || statusInfo.label
              : statusInfo.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">Hazırlanıyor</div>
          {PREPARATION_TIMES.map((time) => (
            <SelectItem key={`prep_${time.value}`} value={`preparing_${time.value}`} className="text-xs">
              {time.label}
            </SelectItem>
          ))}
          <div className="border-t my-1" />
          <SelectItem value="cancelled" className="text-xs">İptal Edildi</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Kurye atanmamış normal siparişler - sadece bekletme süreleri ve iptal
  return (
    <Select
      value={status}
      onValueChange={(newValue) => {
        if (newValue === "cancelled") {
          onCancelClick?.(order, newValue);
        } else if (newValue.startsWith("preparing_")) {
          const minutes = parseInt(newValue.split("_")[1]);
          onPreparationTimeChange?.(order.id, minutes);
        } else {
          onStatusChange?.(order.id, newValue);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger 
        className={`${statusInfo.color} text-slate-700 font-medium text-xs px-2 py-0.5 h-7 border border-slate-300/50 w-[135px] shadow-sm`}
        data-testid={`order-status-dropdown-${order.id}`}
      >
        <SelectValue>
          {(status === "preparing" || status === "scheduled") && order.preparation_end_at
            ? getCountdown?.(order.preparation_end_at)?.text || statusInfo.label
            : statusInfo.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50">Hazırlanıyor</div>
        {PREPARATION_TIMES.map((time) => (
          <SelectItem key={`prep_${time.value}`} value={`preparing_${time.value}`} className="text-xs">
            {time.label}
          </SelectItem>
        ))}
        <div className="border-t my-1" />
        <SelectItem value="cancelled" className="text-xs">İptal Edildi</SelectItem>
      </SelectContent>
    </Select>
  );
}
