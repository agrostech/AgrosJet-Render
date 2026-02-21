import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, ChevronDown, Bike, Users, MapPin } from "lucide-react";
import { getRemainingBreakTime } from "@/utils/orderUtils";

// Kurye listesi bileşeni - Desktop versiyonu
export function CourierSidebarDesktop({
  couriersNotOnDelivery,
  couriersOnDelivery,
  courierPackageCounts,
  onCourierClick,
  onCourierHover
}) {
  return (
    <Card className="w-72 flex-shrink-0 hidden lg:block">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Kuryeler
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
          hoverColor="hover:bg-green-50"
          iconColor="text-green-600"
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Dağıtımda Kuryeler */}
        <CourierGroup
          title="Dağıtımda"
          couriers={couriersOnDelivery}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-cyan-50"
          textColor="text-cyan-700"
          dotColor="bg-cyan-500"
          hoverColor="hover:bg-cyan-50"
          iconColor="text-cyan-600"
          showOnTheWay
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Moladaki Kuryeler */}
        <CourierGroup
          title="Molada"
          couriers={couriersNotOnDelivery.on_break}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          dotColor="bg-yellow-500"
          hoverColor="hover:bg-yellow-50"
          iconColor="text-yellow-600"
          showBreakTime
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Çevrimdışı Kuryeler */}
        <CourierGroup
          title="Çevrimdışı"
          couriers={couriersNotOnDelivery.offline}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-slate-100"
          textColor="text-slate-600"
          dotColor="bg-slate-400"
          hoverColor="hover:bg-slate-50"
          iconColor="text-slate-500"
          isOffline
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
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
  onCourierHover
}) {
  return (
    <Card className="lg:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4" />
          Kuryeler
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
          hoverColor="hover:bg-green-100"
          iconColor="text-green-600"
          defaultOpen
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Dağıtımda Kuryeler */}
        <CourierCollapsible
          title="Dağıtımda"
          couriers={couriersOnDelivery}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-cyan-50"
          textColor="text-cyan-700"
          dotColor="bg-cyan-500"
          hoverColor="hover:bg-cyan-100"
          iconColor="text-cyan-600"
          showOnTheWay
          defaultOpen
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Moladaki Kuryeler */}
        <CourierCollapsible
          title="Molada"
          couriers={couriersNotOnDelivery.on_break}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          dotColor="bg-yellow-500"
          hoverColor="hover:bg-yellow-100"
          iconColor="text-yellow-600"
          showBreakTime
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
        />
        
        {/* Çevrimdışı Kuryeler */}
        <CourierCollapsible
          title="Çevrimdışı"
          couriers={couriersNotOnDelivery.offline}
          courierPackageCounts={courierPackageCounts}
          bgColor="bg-slate-100"
          textColor="text-slate-600"
          dotColor="bg-slate-400"
          hoverColor="hover:bg-slate-200"
          iconColor="text-slate-500"
          isOffline
          onCourierClick={onCourierClick}
          onCourierHover={onCourierHover}
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
  onCourierHover
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
  onCourierHover
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
  onHover
}) {
  const packageCounts = counts || { assigned: 0, confirmed: 0, onTheWay: 0 };
  const breakInfo = showBreakTime ? getRemainingBreakTime(courier) : null;
  const locationStale = !isOffline && isLocationStale(courier);
  
  return (
    <div 
      className={`flex items-center justify-between gap-2 px-2 py-1.5 text-sm ${hoverColor} rounded cursor-pointer ${isOffline ? 'text-muted-foreground' : ''}`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <div className="flex items-center gap-2">
        {locationStale && (
          <MapPin className="w-3 h-3 text-red-500" title="Konum güncel değil" />
        )}
        <Bike className={`w-3.5 h-3.5 ${iconColor}`} />
        <span className="truncate">{courier.name}</span>
      </div>
      <div className="flex items-center gap-1">
        {showBreakTime && breakInfo && (
          <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">{breakInfo.remaining}dk</span>
        )}
        {packageCounts.assigned > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{packageCounts.assigned}</span>
        )}
        {packageCounts.confirmed > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">{packageCounts.confirmed}</span>
        )}
        {showOnTheWay && packageCounts.onTheWay > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded">{packageCounts.onTheWay}</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}
