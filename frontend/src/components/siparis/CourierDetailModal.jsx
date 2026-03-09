import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bike, Clock, Calendar, Battery, BatteryLow, BatteryMedium, BatteryFull, BatteryCharging, Zap } from "lucide-react";
import { 
  ORDER_STATUSES, 
  getLocationTimeAgo, 
  getCourierInitials,
  formatTime,
  formatCurrency,
  getOrderAge,
  getRemainingBreakTime
} from "@/utils/orderUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Batarya gösterimi için yardımcı component
const BatteryDisplay = ({ battery }) => {
  if (!battery || battery.level === null || battery.level === undefined) {
    return null;
  }
  
  const percent = Math.round(battery.level * 100);
  const isCharging = battery.state === 'charging';
  
  let colorClass = 'text-green-600 bg-green-50';
  let BatteryIcon = BatteryFull;
  
  if (percent <= 20) {
    colorClass = 'text-red-500 bg-red-50';
    BatteryIcon = BatteryLow;
  } else if (percent <= 50) {
    colorClass = 'text-yellow-500 bg-yellow-50';
    BatteryIcon = BatteryMedium;
  }
  
  if (isCharging) {
    BatteryIcon = BatteryCharging;
    colorClass = 'text-blue-500 bg-blue-50';
  }
  
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
      <BatteryIcon className="w-3.5 h-3.5" />
      <span>{percent}%</span>
      {isCharging && <Zap className="w-3 h-3" />}
    </div>
  );
};

// Ardışık vardiyaları birleştir
const mergeConsecutiveShifts = (shifts) => {
  if (!shifts || shifts.length === 0) return [];
  
  // Saate göre sırala
  const sorted = [...shifts].sort((a, b) => {
    return a.start_time.localeCompare(b.start_time);
  });
  
  const merged = [];
  let current = { start: sorted[0].start_time, end: sorted[0].end_time };
  
  for (let i = 1; i < sorted.length; i++) {
    const shift = sorted[i];
    // Eğer önceki vardiya bitiş saati = bu vardiya başlangıç saati ise birleştir
    if (current.end === shift.start_time) {
      current.end = shift.end_time;
    } else {
      merged.push(current);
      current = { start: shift.start_time, end: shift.end_time };
    }
  }
  merged.push(current);
  
  return merged;
};

export function CourierDetailModal({
  open,
  onOpenChange,
  courier: initialCourier,
  courierOrders,
  company,
  onUpdateStatus,
  onOrderClick
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const ordersRef = useRef(courierOrders);
  const [todayShifts, setTodayShifts] = useState([]);
  const [workLogs, setWorkLogs] = useState({ logs: [], total_active_hours: 0 });
  const [courier, setCourier] = useState(initialCourier);
  
  // Initial courier değiştiğinde state'i güncelle
  useEffect(() => {
    setCourier(initialCourier);
  }, [initialCourier]);
  
  // Kurye bilgisi polling - 10 saniyede bir güncelle
  useEffect(() => {
    if (!open || !initialCourier?.id) return;
    
    const fetchCourierData = async () => {
      try {
        const res = await axios.get(`${API}/couriers/${initialCourier.id}`);
        if (res.data) {
          setCourier(prev => ({
            ...prev,
            ...res.data,
            // Önemli alanları güncelle
            current_location: res.data.current_location || prev?.current_location,
            battery: res.data.battery || prev?.battery,
            availability_status: res.data.availability_status || prev?.availability_status
          }));
        }
      } catch (err) {
        console.error("Kurye bilgisi alınamadı:", err);
      }
    };
    
    // İlk yükleme
    fetchCourierData();
    
    // Polling interval - 10 saniye
    const intervalId = setInterval(fetchCourierData, 10000);
    
    return () => clearInterval(intervalId);
  }, [open, initialCourier?.id]);
  
  useEffect(() => {
    ordersRef.current = courierOrders;
  }, [courierOrders]);

  // Bugünkü çalışma loglarını al
  useEffect(() => {
    if (!open || !courier?.id) return;
    
    const fetchWorkLogs = async () => {
      try {
        const res = await axios.get(`${API}/courier-status-logs/courier/${courier.id}/today`);
        setWorkLogs(res.data || { logs: [], total_active_hours: 0 });
      } catch (err) {
        setWorkLogs({ logs: [], total_active_hours: 0 });
      }
    };
    
    fetchWorkLogs();
  }, [open, courier?.id]);

  // Bugünkü vardiyaları al
  useEffect(() => {
    if (!open || !courier || !company?.id) return;
    
    const fetchTodayShifts = async () => {
      try {
        // Bugünün gün adı (Türkçe)
        const days = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
        const today = days[new Date().getDay()];
        
        // Vardiya atamalarını al
        const res = await axios.get(`${API}/companies/${company.id}/shift-assignments`);
        const assignments = res.data || [];
        
        // Bugün bu kuryeye atanmış vardiyaları filtrele
        const courierAssignments = assignments.filter(
          a => a.courier_id === courier.id && a.day === today
        );
        
        if (courierAssignments.length > 0) {
          // Vardiya detaylarını al
          const shiftsRes = await axios.get(`${API}/companies/${company.id}/shifts`);
          const allShifts = shiftsRes.data || [];
          
          const courierShifts = courierAssignments
            .map(a => {
              const shift = allShifts.find(s => s.id === a.shift_id);
              return shift ? { start_time: shift.start_time, end_time: shift.end_time } : null;
            })
            .filter(Boolean);
          
          setTodayShifts(courierShifts);
        } else {
          setTodayShifts([]);
        }
      } catch (err) {
        console.error("Vardiya bilgisi alınamadı:", err);
        setTodayShifts([]);
      }
    };
    
    fetchTodayShifts();
  }, [open, courier?.id, company?.id]);

  // Kurye haritası
  useEffect(() => {
    if (!open || !courier) return;
    if (!window.L) return;
    
    const initCourierMap = () => {
      if (!mapRef.current) {
        setTimeout(initCourierMap, 100);
        return;
      }
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      
      const L = window.L;
      const centerLat = company?.city_lat || 39.0;
      const centerLng = company?.city_lng || 35.0;
      
      const map = L.map(mapRef.current, {
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([centerLat, centerLng], 12);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
      
      const allPoints = [];
      const currentOrders = ordersRef.current;
      
      // Kurye siparişlerini haritada göster
      currentOrders.forEach((order, idx) => {
        if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
          const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
          const colorMap = {
            'bg-yellow-500': '#eab308',
            'bg-orange-500': '#f97316',
            'bg-purple-500': '#a855f7',
            'bg-blue-500': '#3b82f6',
            'bg-cyan-500': '#06b6d4',
            'bg-green-500': '#22c55e',
            'bg-red-500': '#ef4444'
          };
          const hexColor = colorMap[statusInfo.color] || '#3b82f6';
          
          L.marker([order.delivery_location.latitude, order.delivery_location.longitude], {
            icon: L.divIcon({
              className: 'order-marker',
              html: `<div style="background: ${hexColor}; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 7px; font-weight: bold;">${idx + 1}</div>`,
              iconSize: [15, 15],
              iconAnchor: [7.5, 7.5]
            })
          }).addTo(map)
            .bindPopup(`<strong>${order.order_number}</strong><br/>${order.restaurant_name}<br/>${order.delivery_address}`);
          
          allPoints.push([order.delivery_location.latitude, order.delivery_location.longitude]);
        }
      });
      
      // Kuryenin konumu
      if (courier.current_location?.latitude && courier.current_location?.longitude) {
        const isOnBreak = courier.availability_status === 'on_break';
        const bgColor = isOnBreak ? '#eab308' : '#22c55e';
        const initials = getCourierInitials(courier.name);
        
        L.marker([courier.current_location.latitude, courier.current_location.longitude], {
          icon: L.divIcon({
            className: 'courier-marker',
            html: `
              <div style="position: relative; width: 16px; height: 16px; border-radius: 50% !important; background: transparent !important;">
                <div class="courier-pulse-ring" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                <div class="courier-pulse-ring-delayed" style="background: ${bgColor}; border-radius: 50% !important;"></div>
                <div style="
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%);
                  background: ${bgColor};
                  width: 15px;
                  height: 15px;
                  border-radius: 50% !important;
                  -webkit-border-radius: 50% !important;
                  border: 2px solid white;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 6px;
                  font-weight: 700;
                ">${initials}</div>
              </div>
            `,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(map)
          .bindPopup(`<strong>${courier.name}</strong><br/>${isOnBreak ? 'Molada' : 'Aktif'}`);
        
        allPoints.push([courier.current_location.latitude, courier.current_location.longitude]);
      }
      
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
      
      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    };
    
    const timer = setTimeout(initCourierMap, 150);
    
    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [open, courier?.id, company?.city_lat, company?.city_lng]);

  if (!courier) return null;

  // Mola bilgisi - her durumda göster
  const breakInfo = getRemainingBreakTime(courier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[420px] sm:max-w-[550px] lg:max-w-[650px] p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="pb-1 sm:pb-2 pr-8">
          <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
            <Bike className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="truncate flex-1">{courier.name}</span>
          </DialogTitle>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Select
              value={courier.availability_status || 'offline'}
              onValueChange={(value) => onUpdateStatus(courier.id, value)}
            >
              <SelectTrigger className={`h-7 w-fit text-xs px-3 gap-1 ${
                courier.availability_status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                courier.availability_status === 'on_break' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                <SelectValue>
                  {courier.availability_status === 'active' ? 'Aktif' : 
                   courier.availability_status === 'on_break' ? 'Molada' : 'Çevrimdışı'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active" className="text-xs">Aktif</SelectItem>
                <SelectItem value="on_break" className="text-xs">Molada</SelectItem>
                <SelectItem value="offline" className="text-xs">Çevrimdışı</SelectItem>
              </SelectContent>
            </Select>
            {/* Kalan Mola Süresi - Her zaman göster */}
            <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600">
              <Clock className="w-3 h-3" />
              <span>Mola: {breakInfo.remaining}/{breakInfo.dailyLimit} dk</span>
            </div>
            {/* Bugünkü Vardiya */}
            {todayShifts.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600">
                <Calendar className="w-3 h-3" />
                <span>
                  {mergeConsecutiveShifts(todayShifts).map((s, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {s.start}-{s.end}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>
        
        <div className="space-y-2 sm:space-y-3 w-full overflow-hidden">
          {/* Harita */}
          <div className="rounded-lg overflow-hidden border w-full">
            <div ref={mapRef} className="h-[220px] sm:h-[280px] w-full bg-slate-100" />
          </div>
          
          {/* Son Konum ve Pil */}
          <div className="flex items-center justify-between px-2 py-1.5 sm:py-2 bg-slate-50 rounded text-xs sm:text-sm">
            <span className="text-muted-foreground">Son Konum ve Pil</span>
            <div className="flex items-center gap-2">
              {courier.battery && <BatteryDisplay battery={courier.battery} />}
              <span className="font-medium px-1.5 sm:px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                {courier.current_location?.updated_at 
                  ? getLocationTimeAgo(courier.current_location.updated_at)
                  : "Yok"}
              </span>
            </div>
          </div>
          
          {/* Bugünkü Çalışma Özeti */}
          <div className="px-2 py-2 bg-slate-50 rounded border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700">Bugünkü Çalışma</span>
              <span className="text-xs font-semibold text-slate-800">
                {workLogs.total_active_hours?.toFixed(2) || '0.00'} saat aktif
              </span>
            </div>
            {workLogs.logs && workLogs.logs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {workLogs.logs.slice(-8).map((log, i) => {
                  const time = new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                  const statusLabels = { active: 'Aktif', on_break: 'Mola', offline: 'Çevrimdışı' };
                  const logStatus = log.status || log.new_status;
                  const isAdminLog = log.source === 'admin';
                  return (
                    <div 
                      key={i} 
                      className={`px-1.5 py-0.5 rounded text-[10px] border bg-white ${
                        isAdminLog ? 'border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600'
                      }`}
                      title={isAdminLog ? 'Yönetici panelinden' : 'Kurye panelinden'}
                    >
                      {time} → {statusLabels[logStatus] || logStatus}
                      {isAdminLog && <span className="ml-0.5 text-[8px]">(Y)</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[10px] text-slate-500">Henüz durum değişikliği yok</div>
            )}
          </div>
          
          {/* Sipariş Listesi */}
          <div className="w-full overflow-hidden">
            <div className="text-xs text-muted-foreground mb-1 px-1">
              Siparişler ({courierOrders.length})
            </div>
            <div className="space-y-1 max-h-[310px] overflow-y-auto overflow-x-hidden w-full">
              {courierOrders.length === 0 ? (
                <div className="text-center py-3 text-muted-foreground text-xs">
                  Aktif sipariş yok
                </div>
              ) : (
                courierOrders.map((order, idx) => {
                  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
                  const orderAge = getOrderAge(order);
                  return (
                    <div 
                      key={order.id} 
                      className="px-2 py-1.5 rounded border border-slate-200 bg-white cursor-pointer hover:shadow-sm transition-shadow w-full overflow-hidden"
                      onClick={() => onOrderClick(order)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full ${statusInfo.color} text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{order.restaurant_name}</span>
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-shrink-0">
                              <span>{formatTime(order.created_at)}</span>
                              {orderAge && (
                                <span className={orderAge.mins > 35 ? 'text-red-600 font-medium' : ''}>
                                  {orderAge.text}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500 truncate flex-1">{order.delivery_address}</span>
                            <div className="flex items-center gap-1.5 text-[10px] flex-shrink-0">
                              <span className="font-medium">{formatCurrency(order.total_amount)}</span>
                              <span className="text-slate-500">
                                {order.payment_method === 'cash' ? 'Nakit' : 'Kart'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
