import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  MapPin,
  Phone,
  Clock,
  CreditCard,
  Banknote,
  User,
  FileText,
  Navigation,
  Store,
  Bike,
  Calendar,
  Hash,
} from "lucide-react";

// Sipariş durumları
const ORDER_STATUS_CONFIG = {
  pending: { label: "Bekliyor", color: "bg-gray-100 text-gray-700" },
  preparing: { label: "Hazırlanıyor", color: "bg-yellow-100 text-yellow-700" },
  ready: { label: "Hazır", color: "bg-blue-100 text-blue-700" },
  assigned: { label: "Kurye Atandı", color: "bg-purple-100 text-purple-700" },
  confirmed: { label: "Kurye Onayladı", color: "bg-indigo-100 text-indigo-700" },
  on_the_way: { label: "Yolda", color: "bg-cyan-100 text-cyan-700" },
  delivered: { label: "Teslim Edildi", color: "bg-green-100 text-green-700" },
  cancelled: { label: "İptal Edildi", color: "bg-red-100 text-red-700" },
  scheduled: { label: "Planlandı", color: "bg-orange-100 text-orange-700" },
};

// Ödeme yöntemleri
const PAYMENT_METHODS = {
  cash: { label: "Nakit", icon: Banknote, color: "text-green-600", bg: "bg-green-50" },
  card: { label: "Kart", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
  online: { label: "Online", icon: CreditCard, color: "text-purple-600", bg: "bg-purple-50" },
};

// Sipariş kaynakları
const ORDER_SOURCES = {
  manual: { label: "Telefon Siparişi", icon: Phone },
  web: { label: "Web Sitesi", icon: Store },
  adisyo: { label: "Adisyo", icon: Store },
  yemeksepeti: { label: "Yemeksepeti", icon: Store },
  getir: { label: "Getir", icon: Store },
  trendyol: { label: "Trendyol", icon: Store },
};

// Zaman formatı
const formatTime = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
};

const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return "-";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
};

// Mesafe hesaplama
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getOrderDistance = (order) => {
  const restLat = order.restaurant_location?.latitude;
  const restLng = order.restaurant_location?.longitude;
  const delLat = order.delivery_location?.latitude;
  const delLng = order.delivery_location?.longitude;
  const distance = calculateDistance(restLat, restLng, delLat, delLng);
  if (distance === null) return null;
  if (distance < 1) return `${Math.round(distance * 1000)} m`;
  return `${distance.toFixed(1)} km`;
};

export default function OrderDetailModal({ order, open, onClose }) {
  if (!order) return null;

  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.pending;
  const paymentInfo = PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const PaymentIcon = paymentInfo.icon;
  const sourceInfo = ORDER_SOURCES[order.source] || ORDER_SOURCES.manual;
  const SourceIcon = sourceInfo.icon;
  const distance = getOrderDistance(order);

  // Haritada aç
  const openInMaps = (lat, lng) => {
    if (!lat || !lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  // Telefonu ara
  const callPhone = (phone) => {
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  };

  // Notları parse et
  const parseNotes = (notes) => {
    if (!notes) return { customer: [], kitchen: [], other: null };
    
    const result = { customer: [], kitchen: [], other: null };
    
    if (notes.includes("CUSTOMER:") || notes.includes("KITCHEN:")) {
      const customerMatch = notes.match(/CUSTOMER:([^|]*)/);
      const kitchenMatch = notes.match(/KITCHEN:([^|]*)/);
      
      if (customerMatch) {
        result.customer = customerMatch[1].split(";").filter(n => n.trim());
      }
      if (kitchenMatch) {
        result.kitchen = kitchenMatch[1].split(";").filter(n => n.trim());
      }
    } else {
      result.other = notes;
    }
    
    return result;
  };

  const parsedNotes = parseNotes(order.notes);
  const hasNotes = parsedNotes.customer.length > 0 || parsedNotes.kitchen.length > 0 || parsedNotes.other;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="order-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5" />
            Sipariş Detayı
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Üst Bilgi - Durum & Ödeme & Kaynak */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${statusConfig.color} text-xs px-2 py-1`}>
              {statusConfig.label}
            </Badge>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${paymentInfo.bg} ${paymentInfo.color} font-medium`}>
              <PaymentIcon className="w-3 h-3" />
              <span>{paymentInfo.label}</span>
            </div>
            <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
              <SourceIcon className="w-3 h-3" />
              <span>{sourceInfo.label}</span>
            </div>
          </div>

          {/* Zaman Bilgileri */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-600">Sipariş Zamanı:</span>
              <span className="font-medium">{formatDateTime(order.created_at)}</span>
            </div>
            {order.preparation_time && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-600">Hazırlık Süresi:</span>
                <span className="font-medium">{order.preparation_time} dakika</span>
              </div>
            )}
            {distance && (
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-600">Teslimat Mesafesi:</span>
                <span className="font-medium">{distance}</span>
              </div>
            )}
          </div>

          {/* Müşteri Bilgileri */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <User className="w-4 h-4 text-blue-500" />
              Müşteri Bilgileri
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{order.customer_name || "-"}</span>
                {order.customer_phone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => callPhone(order.customer_phone)}
                  >
                    <Phone className="w-3.5 h-3.5 mr-1" />
                    {order.customer_phone}
                  </Button>
                )}
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-red-500" />
                <div className="flex-1">
                  <p className="leading-relaxed">{order.delivery_address || "-"}</p>
                  {order.delivery_location?.latitude && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-blue-600 text-xs mt-1"
                      onClick={() => openInMaps(order.delivery_location.latitude, order.delivery_location.longitude)}
                    >
                      <Navigation className="w-3 h-3 mr-1" />
                      Haritada Aç
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Kurye Bilgileri - Sadece atanmışsa göster */}
          {order.courier_name && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
                <Bike className="w-4 h-4 text-green-500" />
                Kurye Bilgileri
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{order.courier_name}</span>
                {order.courier_phone && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => callPhone(order.courier_phone)}
                  >
                    <Phone className="w-3.5 h-3.5 mr-1" />
                    {order.courier_phone}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Sipariş İçeriği */}
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <FileText className="w-4 h-4 text-orange-500" />
              Sipariş İçeriği
            </div>
            <div className="space-y-1.5">
              {order.items?.length > 0 ? (
                <>
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        {item.name}
                      </span>
                      <span className="text-slate-600">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="border-t mt-2 pt-2 flex justify-between font-semibold">
                    <span>Toplam</span>
                    <span className="text-lg">{formatCurrency(order.total_amount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between font-semibold">
                  <span>Toplam Tutar</span>
                  <span className="text-lg">{formatCurrency(order.total_amount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notlar */}
          {hasNotes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-yellow-700">
                <FileText className="w-4 h-4" />
                Sipariş Notları
              </div>
              
              {/* Müşteri Notları */}
              {parsedNotes.customer.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-2">
                  <p className="text-xs font-semibold text-red-700 mb-1">Müşteri Notu:</p>
                  {parsedNotes.customer.map((note, idx) => (
                    <p key={idx} className="text-sm text-red-800">{note}</p>
                  ))}
                </div>
              )}
              
              {/* Mutfak Notları */}
              {parsedNotes.kitchen.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded p-2">
                  <p className="text-xs font-semibold text-orange-700 mb-1">Mutfak Notu:</p>
                  {parsedNotes.kitchen.map((note, idx) => (
                    <p key={idx} className="text-sm text-orange-800">{note}</p>
                  ))}
                </div>
              )}
              
              {/* Diğer Notlar */}
              {parsedNotes.other && (
                <p className="text-sm text-yellow-800">{parsedNotes.other}</p>
              )}
            </div>
          )}

          {/* Kapat Butonu */}
          <div className="pt-2">
            <Button variant="outline" className="w-full" onClick={() => onClose(false)}>
              Kapat
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
