// Sipariş ve kurye ile ilgili yardımcı fonksiyonlar

// Sipariş durumları
export const ORDER_STATUSES = {
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-300/50", textColor: "text-yellow-700", bgLight: "bg-yellow-50" },
  ready: { label: "Hazır", color: "bg-orange-300/50", textColor: "text-orange-700", bgLight: "bg-orange-50" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-300/50", textColor: "text-purple-700", bgLight: "bg-purple-50" },
  confirmed: { label: "Onaylandı", color: "bg-blue-300/50", textColor: "text-blue-700", bgLight: "bg-blue-50" },
  on_the_way: { label: "Yolda", color: "bg-cyan-300/50", textColor: "text-cyan-700", bgLight: "bg-cyan-50" },
  delivered: { label: "Teslim Edildi", color: "bg-green-300/50", textColor: "text-green-700", bgLight: "bg-green-50" },
  cancelled: { label: "İptal Edildi", color: "bg-red-300/50", textColor: "text-red-700", bgLight: "bg-red-50" }
};

// Admin tarafından seçilemeyen durumlar (otomatik atanır veya kurye seçer)
export const COURIER_ONLY_STATUSES = ["assigned", "confirmed"];

// Ödeme yöntemleri
export const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: "💵" },
  card: { label: "Kart", icon: "💳" },
  online: { label: "Online", icon: "📱" }
};

// Hazırlık süreleri
export const PREPARATION_TIMES = [
  { value: 5, label: "5 Dakika" },
  { value: 15, label: "15 Dakika" },
  { value: 30, label: "30 Dakika" },
  { value: 45, label: "45 Dakika" },
  { value: 60, label: "60 Dakika" }
];

// Geri sayım hesaplama (dakika bazlı)
export const getCountdown = (preparationEndAt) => {
  if (!preparationEndAt) return null;
  const now = new Date();
  const endTime = new Date(preparationEndAt);
  const diffMs = endTime - now;
  
  if (diffMs <= 0) return { expired: true, text: "Süre Doldu" };
  
  const minutes = Math.ceil(diffMs / 60000);
  
  return { 
    expired: false, 
    text: `${minutes} Dakika`,
    minutes
  };
};

// Hedeflenen teslimat zamanı hesaplama (sipariş + 35 dk)
export const getTargetDelivery = (createdAt) => {
  if (!createdAt) return null;
  
  const orderTime = new Date(createdAt);
  const targetTime = new Date(orderTime.getTime() + 35 * 60000);
  const now = new Date();
  
  const targetTimeStr = targetTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  
  if (now > targetTime) {
    const delayMs = now - targetTime;
    const delayMinutes = Math.floor(delayMs / 60000);
    return {
      time: targetTimeStr,
      delayed: true,
      delayMinutes
    };
  }
  
  return {
    time: targetTimeStr,
    delayed: false,
    delayMinutes: 0
  };
};

// Uzaklık hesaplama (Haversine formülü) - km cinsinden
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

// Kuryenin kalan mola süresini hesapla
export const getRemainingBreakTime = (courier) => {
  const dailyLimit = courier.daily_break_limit || 30;
  let usedTime = courier.used_break_time || 0;
  let currentBreakMinutes = 0;
  let activeBreakRemaining = 0; // Aktif molanın kalan süresi
  
  if (courier.availability_status === 'on_break' && courier.break_start_time) {
    const startTime = new Date(courier.break_start_time);
    const now = new Date();
    currentBreakMinutes = Math.floor((now - startTime) / 60000);
    usedTime += currentBreakMinutes;
    
    // Aktif molanın kalan süresi
    const requestedDuration = courier.requested_break_duration || 30;
    activeBreakRemaining = Math.max(0, requestedDuration - currentBreakMinutes);
  }
  
  const remaining = Math.max(0, dailyLimit - usedTime);
  return { 
    remaining,              // Kalan günlük mola süresi
    dailyLimit,             // Günlük toplam mola hakkı
    usedTime,               // Bugün kullanılan toplam mola
    currentBreak: currentBreakMinutes,  // Şu anki molanın geçen süresi
    activeBreakRemaining    // Aktif molanın kalan süresi (talep edilen süre - geçen süre)
  };
};

// Sipariş uzaklığını formatla
export const getOrderDistance = (order) => {
  const restLat = order.restaurant_location?.latitude;
  const restLng = order.restaurant_location?.longitude;
  const delLat = order.delivery_location?.latitude;
  const delLng = order.delivery_location?.longitude;
  
  const distance = calculateDistance(restLat, restLng, delLat, delLng);
  
  if (distance === null) return null;
  
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} km`;
};

// Kuryeleri restorana yakınlığa ve paket sayısına göre sırala
export const sortCouriersByDistanceAndLoad = (couriers, restaurantLocation, orders) => {
  const courierOrderCounts = {};
  orders.forEach(order => {
    if (order.courier_id) {
      if (!courierOrderCounts[order.courier_id]) {
        courierOrderCounts[order.courier_id] = { assigned: 0, onTheWay: 0 };
      }
      if (order.status === 'assigned' || order.status === 'confirmed') {
        courierOrderCounts[order.courier_id].assigned++;
      } else if (order.status === 'on_the_way') {
        courierOrderCounts[order.courier_id].onTheWay++;
      }
    }
  });
  
  return [...couriers].map(courier => {
    const distance = calculateDistance(
      restaurantLocation?.latitude,
      restaurantLocation?.longitude,
      courier.current_location?.latitude,
      courier.current_location?.longitude
    );
    const orderCounts = courierOrderCounts[courier.id] || { assigned: 0, onTheWay: 0 };
    const totalPackages = orderCounts.assigned + orderCounts.onTheWay;
    
    return { 
      ...courier, 
      distanceToRestaurant: distance,
      assignedCount: orderCounts.assigned,
      onTheWayCount: orderCounts.onTheWay,
      totalPackages
    };
  }).sort((a, b) => {
    if (a.totalPackages === 0 && b.totalPackages > 0) return -1;
    if (a.totalPackages > 0 && b.totalPackages === 0) return 1;
    
    if (a.distanceToRestaurant === null) return 1;
    if (b.distanceToRestaurant === null) return -1;
    return a.distanceToRestaurant - b.distanceToRestaurant;
  });
};

// Mesafeyi formatla
export const formatCourierDistance = (distance) => {
  if (distance === null || distance === undefined) return null;
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(1)} km`;
};

// Kuryenin tahmini restoran varış süresini hesapla (dakika)
export const getEstimatedArrival = (courierLocation, restaurantLocation) => {
  if (!courierLocation || !restaurantLocation) return null;
  
  const courierLat = courierLocation.latitude || courierLocation.lat;
  const courierLng = courierLocation.longitude || courierLocation.lng;
  const restLat = restaurantLocation.latitude || restaurantLocation.lat;
  const restLng = restaurantLocation.longitude || restaurantLocation.lng;
  
  if (!courierLat || !courierLng || !restLat || !restLng) return null;
  
  const distance = calculateDistance(courierLat, courierLng, restLat, restLng);
  if (distance === null) return null;
  
  // Ortalama hız: 25 km/saat (şehir içi motorsiklet)
  const avgSpeedKmH = 25;
  const estimatedMinutes = Math.ceil((distance / avgSpeedKmH) * 60);
  
  return {
    distance: distance,
    minutes: estimatedMinutes,
    text: estimatedMinutes <= 1 ? "~1 dk" : `~${estimatedMinutes} dk`
  };
};

// Sipariş süresi hesapla (dakika cinsinden)
export const getOrderAge = (order) => {
  if (!order.created_at) return null;
  
  try {
    const createdAt = new Date(order.created_at);
    const now = new Date();
    const diffMs = now - createdAt;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return { text: "Yeni", mins: 0 };
    return { text: `${diffMins} dk`, mins: diffMins };
  } catch {
    return null;
  }
};

// Son konum bilgisi zamanını hesapla
export const getLocationTimeAgo = (updatedAt) => {
  if (!updatedAt) return null;
  
  const now = new Date();
  const updateTime = new Date(updatedAt);
  const diffMs = now - updateTime;
  
  if (diffMs < 0) return "Şimdi";
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffSeconds < 30) return "Şimdi";
  if (diffSeconds < 60) return `${diffSeconds} sn önce`;
  if (diffMinutes < 60) return `${diffMinutes} dk önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  
  return updateTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// Sipariş notlarını parse et (CUSTOMER:, KITCHEN: gibi prefixleri temizle)
export const parseOrderNotes = (notes) => {
  if (!notes) return null;
  
  const result = { customer: null, kitchen: null, other: null };
  
  const parts = notes.split('|');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    // ADDRESS: prefix'li notları atla - bunlar görüntülenmeyecek
    if (trimmed.startsWith('ADDRESS:')) {
      return;
    }
    if (trimmed.startsWith('CUSTOMER:')) {
      result.customer = trimmed.replace('CUSTOMER:', '').trim();
    } else if (trimmed.startsWith('KITCHEN:')) {
      result.kitchen = trimmed.replace('KITCHEN:', '').trim();
    } else if (trimmed) {
      result.other = result.other ? `${result.other}, ${trimmed}` : trimmed;
    }
  });
  
  return result;
};

// Zamanı formatla
export const formatTime = (isoString) => {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// Para birimini formatla
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
};

// Kurye baş harflerini al
export const getCourierInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  const firstInitial = parts[0][0].toUpperCase();
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return firstInitial + lastInitial;
};
