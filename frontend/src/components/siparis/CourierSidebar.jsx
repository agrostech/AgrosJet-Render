import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ChevronDown, Bike, Users, MapPin, Clock, CalendarOff, UserCog, BatteryLow } from "lucide-react";
import { getRemainingBreakTime } from "@/utils/orderUtils";

// Kurye listesi bileşeni - Desktop versiyonu
export function CourierSidebarDesktop({
  couriersNotOnDelivery,
  couriersOnDelivery,
  courierPackageCounts,
  onCourierClick,
  onCourierHover,
  shifts = [],
  shiftAssignments = [],
  leaves = [],
  openingTime = "06:00"
}) {
  return (
    <Card className="w-64 flex-shrink-0 hidden lg:block">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Kuryeler ve Yöneticiler
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-3 max-h-[500px] overflow-y-auto">
        {/* Aktif Kuryeler */}
        <CourierGroup
          title="Aktif"
          couriers={couriersNotOnDelivery.active}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-green-50"
          textColor="text-green-700"
          dotColor="bg-green-500"
          hoverColor="hover:bg-green-50 dark:hover:bg-green-900/40 dark:hover:text-green-50"
          iconColor="text-green-600"
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Dağıtımda Kuryeler */}
        <CourierGroup
          title="Dağıtımda"
          couriers={couriersOnDelivery}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-cyan-50"
          textColor="text-cyan-700"
          dotColor="bg-cyan-500"
          hoverColor="hover:bg-cyan-50 dark:hover:bg-cyan-900/40 dark:hover:text-cyan-50"
          iconColor="text-cyan-600"
          showOnTheWay
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Moladaki Kuryeler */}
        <CourierGroup
          title="Molada"
          couriers={couriersNotOnDelivery.on_break}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          dotColor="bg-yellow-500"
          hoverColor="hover:bg-yellow-50 dark:hover:bg-yellow-900/40 dark:hover:text-yellow-50"
          iconColor="text-yellow-600"
          showBreakTime
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Çevrimdışı Kuryeler */}
        <CourierGroup
          title="Çevrimdışı"
          couriers={couriersNotOnDelivery.offline}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-slate-100"
          textColor="text-slate-600"
          dotColor="bg-slate-400"
          hoverColor="hover:bg-slate-50 dark:hover:bg-slate-700 dark:hover:text-white"
          iconColor="text-slate-500"
          isOffline
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
      </CardContent>
    </Card>
  );
}

// Kurye listesi bileşeni - Mobil versiyonu
export function CourierSidebarMobile({
  couriersNotOnDelivery,
  couriersOnDelivery,
  courierPackageCounts,
  onCourierClick,
  onCourierHover,
  shifts = [],
  shiftAssignments = [],
  leaves = [],
  openingTime = "06:00"
}) {
  return (
    <Card className="lg:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Kuryeler ve Yöneticiler
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 space-y-2">
        {/* Aktif Kuryeler */}
        <CourierCollapsible
          title="Aktif"
          couriers={couriersNotOnDelivery.active}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-green-50"
          textColor="text-green-700"
          dotColor="bg-green-500"
          hoverColor="hover:bg-green-100 dark:hover:bg-green-900/40 dark:hover:text-green-50"
          iconColor="text-green-600"
          defaultOpen
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Dağıtımda Kuryeler */}
        <CourierCollapsible
          title="Dağıtımda"
          couriers={couriersOnDelivery}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-cyan-50"
          textColor="text-cyan-700"
          dotColor="bg-cyan-500"
          hoverColor="hover:bg-cyan-100 dark:hover:bg-cyan-900/40 dark:hover:text-cyan-50"
          iconColor="text-cyan-600"
          showOnTheWay
          defaultOpen
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Moladaki Kuryeler */}
        <CourierCollapsible
          title="Molada"
          couriers={couriersNotOnDelivery.on_break}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          dotColor="bg-yellow-500"
          hoverColor="hover:bg-yellow-100 dark:hover:bg-yellow-900/40 dark:hover:text-yellow-50"
          iconColor="text-yellow-600"
          showBreakTime
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
        
        {/* Çevrimdışı Kuryeler */}
        <CourierCollapsible
          title="Çevrimdışı"
          couriers={couriersNotOnDelivery.offline}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-slate-100"
          textColor="text-slate-600"
          dotColor="bg-slate-400"
          hoverColor="hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
          iconColor="text-slate-500"
          isOffline
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
          shifts={shifts}
          shiftAssignments={shiftAssignments}
          leaves={leaves}
          openingTime={openingTime}
        />
      </CardContent>
    </Card>
  );
}

// Kuryeleri alfabetik sırala
const sortCouriersAlphabetically = (courierList) => {
  if (!courierList || courierList.length === 0) return [];
  return [...courierList].sort((a, b) => {
    const nameA = (a.name || '').toLocaleLowerCase('tr');
    const nameB = (b.name || '').toLocaleLowerCase('tr');
    return nameA.localeCompare(nameB, 'tr');
  });
};

// Kuryenin konumu eski mi kontrol et (2 dakikadan fazla)
const isLocationStale = (courier) => {
  if (!courier.current_location?.updated_at) return true;
  const updatedAt = new Date(courier.current_location.updated_at);
  const now = new Date();
  const diffMinutes = (now - updatedAt) / (1000 * 60);
  return diffMinutes > 2;
};

// Kuryenin bataryası düşük mü kontrol et (%20 ve altı)
const isBatteryLow = (courier) => {
  if (!courier.battery || courier.battery.level === null || courier.battery.level === undefined) {
    return false;
  }
  return courier.battery.level <= 0.20;
};

// Şirket iş gününe göre weekday anahtarı (06:00-06:00 vb.)
// openingTime = "HH:MM" formatında (default 06:00)
const getBusinessDayKey = (openingTime = "06:00") => {
  const days = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
  const now = new Date();
  let [openH, openM] = (openingTime || "06:00").split(":").map((n) => parseInt(n, 10) || 0);
  const cutoffMinutes = openH * 60 + openM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const businessDate = new Date(now);
  if (nowMinutes < cutoffMinutes) {
    businessDate.setDate(businessDate.getDate() - 1);
  }
  return days[businessDate.getDay()];
};

// Kuryenin şu an aktif vardiyası var mı kontrol et
const hasActiveShiftNow = (courier, shifts, shiftAssignments, leaves, openingTime = "06:00") => {
  if (!shifts || !shiftAssignments) return false;
  
  // Şirket iş günü mantığına göre günün anahtarı (06:00 cutoff vb.)
  const today = getBusinessDayKey(openingTime);
  
  // Bugün izinli mi kontrol et
  if (leaves && leaves.length > 0) {
    const hasLeaveToday = leaves.some(l => l.courier_id === courier.id && l.day === today);
    if (hasLeaveToday) return false;
  }
  
  // Bu kuryenin bugünkü vardiya atamalarını bul
  const courierAssignments = shiftAssignments.filter(
    a => a.courier_id === courier.id && a.day === today
  );
  
  if (courierAssignments.length === 0) return false;
  
  // Şu anki saat
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // Herhangi bir vardiya şu an aktif mi kontrol et
  for (const assignment of courierAssignments) {
    const shift = shifts.find(s => s.id === assignment.shift_id);
    if (shift) {
      const startTime = shift.start_time;
      const endTime = shift.end_time;
      
      // Gece yarısını geçen vardiya kontrolü (örn: 22:00 - 00:00 veya 22:00 - 06:00)
      if (endTime <= startTime) {
        // Gece yarısını geçen vardiya: currentTime >= startTime VEYA currentTime < endTime
        if (currentTime >= startTime || currentTime < endTime) {
          return true;
        }
      } else {
        // Normal vardiya: currentTime >= startTime VE currentTime < endTime
        if (currentTime >= startTime && currentTime < endTime) {
          return true;
        }
      }
    }
  }
  
  return false;
};

// Kuryenin bugün izinli olup olmadığını kontrol et
const hasLeaveToday = (courier, leaves, openingTime = "06:00") => {
  if (!leaves || leaves.length === 0) return false;
  const today = getBusinessDayKey(openingTime);
  return leaves.some(l => l.courier_id === courier.id && l.day === today);
};

// Kurye grubu (desktop - collapsible olmayan)
function CourierGroup({
  title,
  couriers,
  courierPackageCounts,
  bgColor,
  textColor,
  dotColor,
  hoverColor,
  iconColor,
  showOnTheWay,
  showBreakTime,
  isOffline,
  onCourierClick,
  onCourierHover,
  shifts = [],
  shiftAssignments = [],
  leaves = [],
  openingTime = "06:00"
}) {
  const sortedCouriers = sortCouriersAlphabetically(couriers);
  
  return (
    <div>
      <div className={`flex items-center gap-2 px-2 py-1 ${bgColor} rounded text-xs font-semibold ${textColor} mb-1`}>
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        {title} ({couriers.length})
      </div>
      {sortedCouriers.length === 0 ? (
        <p className="text-xs text-muted-foreground px-2">-</p>
      ) : (
        sortedCouriers.map(c => (
          <CourierItem
            key={c.id}
            courier={c}
            counts={courierPackageCounts[c.id]}
            hoverColor={hoverColor}
            iconColor={iconColor}
            showOnTheWay={showOnTheWay}
            showBreakTime={showBreakTime}
            isOffline={isOffline}
            onClick={() => onCourierClick(c)}
            onHover={() => onCourierHover(c)}
            shifts={shifts}
            shiftAssignments={shiftAssignments}
            leaves={leaves}
            openingTime={openingTime}
          />
        ))
      )}
    </div>
  );
}

// Kurye grubu (mobil - collapsible)
function CourierCollapsible({
  title,
  couriers,
  courierPackageCounts,
  bgColor,
  textColor,
  dotColor,
  hoverColor,
  iconColor,
  showOnTheWay,
  showBreakTime,
  isOffline,
  defaultOpen,
  onCourierClick,
  onCourierHover,
  shifts = [],
  shiftAssignments = [],
  leaves = [],
  openingTime = "06:00"
}) {
  const sortedCouriers = sortCouriersAlphabetically(couriers);
  
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className={`flex items-center justify-between w-full px-2 py-1.5 ${bgColor} rounded text-xs font-semibold ${textColor} ${hoverColor} transition-colors`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dotColor}`} />
          {title} ({couriers.length})
        </div>
        <ChevronDown className="w-4 h-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        {sortedCouriers.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-1">-</p>
        ) : (
          sortedCouriers.map(c => (
            <CourierItem
              key={c.id}
              courier={c}
              counts={courierPackageCounts[c.id]}
              hoverColor={hoverColor}
              iconColor={iconColor}
              showOnTheWay={showOnTheWay}
              showBreakTime={showBreakTime}
              isOffline={isOffline}
              onClick={() => onCourierClick(c)}
              onHover={() => onCourierHover(c)}
              shifts={shifts}
              shiftAssignments={shiftAssignments}
              leaves={leaves}
              openingTime={openingTime}
            />
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Tek kurye satırı
function CourierItem({
  courier,
  counts,
  hoverColor,
  iconColor,
  showOnTheWay,
  showBreakTime,
  isOffline,
  onClick,
  onHover,
  shifts = [],
  shiftAssignments = [],
  leaves = [],
  openingTime = "06:00"
}) {
  const packageCounts = counts || { assigned: 0, confirmed: 0, onTheWay: 0 };
  const breakInfo = showBreakTime ? getRemainingBreakTime(courier) : null;
  const locationStale = !isOffline && isLocationStale(courier);
  const batteryLow = !isOffline && isBatteryLow(courier);
  
  // Admin-kurye mi kontrol et
  const isAdminLinked = courier.is_admin_linked;
  
  // Kurye çevrimdışı ama yönetici paneli aktif mi?
  const isAdminActiveWhileCourierOffline = isOffline && isAdminLinked && courier.admin_status === 'active';
  
  // Çevrimdışı ama aktif vardiyası var mı?
  // Admin-kurye için de bu kontrolü yap (artık backend her iki panel durumunu kontrol ediyor)
  const missedShift = isOffline && hasActiveShiftNow(courier, shifts, shiftAssignments, leaves, openingTime);
  
  // Bugün izinli mi? (sadece çevrimdışı için)
  const onLeaveToday = isOffline && hasLeaveToday(courier, leaves, openingTime);
  
  return (
    <div 
      className={`flex items-center justify-between gap-2 px-2 py-1.5 text-xs ${hoverColor} rounded cursor-pointer ${isOffline ? 'text-muted-foreground' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <div className="flex items-center gap-2">
        {/* Kurye çevrimdışı ama yönetici aktifse yeşil nokta göster */}
        {isAdminActiveWhileCourierOffline && (
          <div className="w-2 h-2 rounded-full bg-green-500" title="Yönetici paneli aktif" />
        )}
        {locationStale && (
          <MapPin className="w-3 h-3 text-red-500" title="Konum güncel değil" />
        )}
        {batteryLow && (
          <BatteryLow className="w-3 h-3 text-red-500" title="Batarya düşük" />
        )}
        {missedShift && (
          <Clock className="w-3 h-3 text-red-500" title="Kuryenin vardiyası başladı ama aktif değil." />
        )}
        {onLeaveToday && (
          <CalendarOff className="w-3 h-3 text-slate-700" title="Kurye bugün izinli." />
        )}
        {isAdminLinked ? (
          <UserCog className={`w-3 h-3 ${iconColor}`} title="Yönetici" />
        ) : (
          <Bike className={`w-3 h-3 ${iconColor}`} />
        )}
        <span className="truncate">{courier.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {showBreakTime && breakInfo && (
          <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
            {breakInfo.activeBreakRemaining > 0 ? breakInfo.activeBreakRemaining : breakInfo.remaining}dk
          </span>
        )}
        {packageCounts.assigned > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{packageCounts.assigned}</span>
        )}
        {packageCounts.confirmed > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{packageCounts.confirmed}</span>
        )}
        {showOnTheWay && packageCounts.onTheWay > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">{packageCounts.onTheWay}</span>
        )}
        <ChevronRight className="w-3 h-3 text-muted-foreground" />
      </div>
    </div>
  );
}
