import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  MapPin,
  Phone,
  CreditCard,
  Banknote,
  User,
  FileText,
  Navigation,
  Store,
  Bike,
  Calendar,
  Map,
  Printer,
} from "lucide-react";
import GetirReceiptModal from "./GetirReceiptModal";

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
  meal_card: { label: "Yemek Kartı", icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
  online_meal_card: { label: "Online YK", icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
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

export default function OrderDetailModal({ 
  order, 
  open, 
  onClose, 
  canViewCourierPhone = true,
  canViewCourierLocation = true 
}) {
  const [activeTab, setActiveTab] = useState("details");
  const [showGetirReceipt, setShowGetirReceipt] = useState(false);

  // Modal kapandığında tab'ı sıfırla
  useEffect(() => {
    if (!open) {
      setActiveTab("details");
      setShowGetirReceipt(false);
    }
  }, [open]);

  if (!order) return null;

  const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.pending;
  const paymentInfo = PAYMENT_METHODS[order.payment_type] || PAYMENT_METHODS[order.payment_method] || PAYMENT_METHODS.cash;
  const paymentLabel = order.payment_method_detail || (PAYMENT_METHODS[order.payment_method] ? null : order.payment_method) || paymentInfo.label;
  const PaymentIcon = paymentInfo.icon;
  const sourceInfo = ORDER_SOURCES[order.source] || ORDER_SOURCES.manual;
  const SourceIcon = sourceInfo.icon;
  const distance = getOrderDistance(order);
  const isGetirOrder = order.source === "getir";

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

  // Harita sekmesi gösterilsin mi?
  const showMapTab = canViewCourierLocation && order.courier_id;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="order-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5" />
            Sipariş Detayı
          </DialogTitle>
        </DialogHeader>

        {showMapTab ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Detaylar
              </TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <Map className="w-4 h-4" />
                Harita
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-0">
              <OrderDetails 
                order={order}
                statusConfig={statusConfig}
                paymentInfo={paymentInfo}
                PaymentIcon={PaymentIcon}
                sourceInfo={sourceInfo}
                SourceIcon={SourceIcon}
                distance={distance}
                canViewCourierPhone={canViewCourierPhone}
                hasNotes={hasNotes}
                parsedNotes={parsedNotes}
                openInMaps={openInMaps}
                callPhone={callPhone}
                onClose={onClose}
              />
            </TabsContent>

            <TabsContent value="map" className="mt-0">
              <OrderMap order={order} />
            </TabsContent>
          </Tabs>
        ) : (
          <OrderDetails 
            order={order}
            statusConfig={statusConfig}
            paymentInfo={paymentInfo}
            PaymentIcon={PaymentIcon}
            sourceInfo={sourceInfo}
            SourceIcon={SourceIcon}
            distance={distance}
            canViewCourierPhone={canViewCourierPhone}
            hasNotes={hasNotes}
            parsedNotes={parsedNotes}
            openInMaps={openInMaps}
            callPhone={callPhone}
            onClose={onClose}
          />
        )}

        {/* Getir Fiş Yazdır Butonu */}
        {isGetirOrder && (
          <div className="pt-2 mt-4">
            <Button 
              onClick={() => setShowGetirReceipt(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Printer className="w-4 h-4 mr-2" />
              Getir Fişi Yazdır
            </Button>
          </div>
        )}

        {/* Getir Fiş Modal */}
        <GetirReceiptModal 
          open={showGetirReceipt} 
          onClose={() => setShowGetirReceipt(false)} 
          order={order} 
        />
      </DialogContent>
    </Dialog>
  );
}

// Detaylar bileşeni
function OrderDetails({ 
  order, 
  statusConfig, 
  paymentInfo, 
  PaymentIcon, 
  sourceInfo, 
  SourceIcon, 
  distance,
  canViewCourierPhone,
  hasNotes,
  parsedNotes,
  openInMaps,
  callPhone,
  onClose
}) {
  return (
    <div className="space-y-4">
      {/* Üst Bilgi - Durum & Ödeme & Kaynak */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`${statusConfig.color} text-xs px-2 py-1`}>
          {statusConfig.label}
        </Badge>
        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${paymentInfo.bg} ${paymentInfo.color} font-medium`}>
          <PaymentIcon className="w-3 h-3" />
          <span>{paymentLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
          <SourceIcon className="w-3 h-3" />
          <span>{sourceInfo.label}</span>
        </div>
        {order.verification_code && (
          <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">
            <span>Kod: {order.verification_code}</span>
          </div>
        )}
      </div>

      {/* Sipariş Numarası */}
      {order.order_number && (
        <div className="text-xs text-muted-foreground">
          Sipariş No: <span className="font-medium text-slate-700">{order.order_number}</span>
        </div>
      )}

      {/* Özel Teslimat Uyarıları */}
      {(order.contactless_delivery || order.save_green) && (
        <div className="space-y-2">
          {order.contactless_delivery && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">
              <span className="text-lg">⚠️</span>
              <span className="font-semibold">Temassız teslimat! Adrese ulaştığında müşteriyi arayın.</span>
            </div>
          )}
          {order.save_green && (
            <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-300 rounded-lg text-green-700 text-sm">
              <span className="text-lg">♻️</span>
              <span>Plastik çatal, bıçak ve peçete göndermeyin.</span>
            </div>
          )}
        </div>
      )}

      {/* Sipariş Notu (note alanı) */}
      {order.note && (
        <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
          <p className="text-sm font-semibold text-yellow-800">📝 Sipariş Notu</p>
          <p className="text-sm text-yellow-700 mt-1">{order.note}</p>
        </div>
      )}

      {/* Zaman Bilgileri */}
      <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-600">Sipariş Zamanı:</span>
          <span className="font-medium">{formatDateTime(order.created_at)}</span>
        </div>
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
              {/* Adres Tarifi */}
              {order.address_direction && (
                <p className="text-blue-600 mt-1">
                  <span className="font-medium">📍 Tarif:</span> {order.address_direction}
                </p>
              )}
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
            {canViewCourierPhone && order.courier_phone && (
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
                <div key={idx} className="border-b pb-2 mb-2 last:border-b-0 last:pb-0 last:mb-0">
                  <div className="flex justify-between text-sm">
                    <span>
                      <span className="font-medium">{item.quantity}x</span>{" "}
                      {item.name}
                    </span>
                    <span className="text-slate-600">{formatCurrency(item.price * item.quantity)}</span>
                  </div>
                  {/* Ürün Opsiyonları */}
                  {item.options && item.options.length > 0 && (
                    <div className="mt-1 ml-4 text-xs text-muted-foreground space-y-0.5">
                      {item.options.map((opt, optIdx) => (
                        <div key={optIdx} className={opt.excluded ? 'text-red-600 font-medium' : 'text-slate-600'}>
                          {opt.excluded ? '- Çıkarılan: ' : '+ '}{opt.quantity > 1 ? `${opt.quantity}x ` : ''}{opt.value || opt.name}
                          {opt.quantity > 1 && opt.unit_price > 0
                            ? ` (+${formatCurrency(opt.unit_price)} x${opt.quantity} = ${formatCurrency(opt.price)})`
                            : opt.price > 0 ? ` (+${formatCurrency(opt.price)})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Ürün Notu */}
                  {item.note && (
                    <div className="mt-1 ml-4 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded inline-block">
                      📝 {item.note}
                    </div>
                  )}
                </div>
              ))}
              <div className="border-t mt-2 pt-2">
                {order.total_price && order.total_discounted_price && order.total_price > order.total_discounted_price ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Ara Toplam</span>
                      <span className="line-through">{formatCurrency(order.total_price)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>İndirim</span>
                      <span>-{formatCurrency(order.total_price - order.total_discounted_price)}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-1 border-t">
                      <span>Toplam</span>
                      <span className="text-lg text-green-600">{formatCurrency(order.total_amount)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between font-semibold">
                    <span>Toplam</span>
                    <span className="text-lg">{formatCurrency(order.total_amount)}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              {order.total_price && order.total_discounted_price && order.total_price > order.total_discounted_price ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Ara Toplam</span>
                    <span className="line-through">{formatCurrency(order.total_price)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>İndirim</span>
                    <span>-{formatCurrency(order.total_price - order.total_discounted_price)}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-1 border-t">
                    <span>Toplam Tutar</span>
                    <span className="text-lg text-green-600">{formatCurrency(order.total_amount)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between font-semibold">
                  <span>Toplam Tutar</span>
                  <span className="text-lg">{formatCurrency(order.total_amount)}</span>
                </div>
              )}
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
  );
}

// Harita bileşeni
function OrderMap({ order }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    // Leaflet'i dinamik olarak yükle
    const loadLeaflet = async () => {
      if (!window.L) {
        // CSS yükle
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        
        // JS yükle
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }
      
      initMap();
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Kurye konumu değiştiğinde marker'ı güncelle
  useEffect(() => {
    if (mapInstanceRef.current && order.courier_location) {
      updateMarkers();
    }
  }, [order.courier_location]);

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const L = window.L;
    
    // Merkez noktası hesapla
    let centerLat = 41.0082;
    let centerLng = 28.9784;
    
    if (order.delivery_location?.latitude) {
      centerLat = order.delivery_location.latitude;
      centerLng = order.delivery_location.longitude;
    }

    // Haritayı oluştur
    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: true,
      attributionControl: false,
    });

    const tileUrl = document.documentElement.classList.contains('dark')
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl).addTo(map);

    mapInstanceRef.current = map;
    
    updateMarkers();
    
    // Bounds'u ayarla
    setTimeout(() => fitBounds(), 100);
  };

  const updateMarkers = () => {
    if (!mapInstanceRef.current) return;
    
    const L = window.L;
    const map = mapInstanceRef.current;

    // Eski marker'ları temizle
    markersRef.current.forEach(marker => {
      try { map.removeLayer(marker); } catch (e) {}
    });
    markersRef.current = [];

    // Teslimat noktası marker'ı (Kırmızı pin)
    if (order.delivery_location?.latitude) {
      const deliveryMarker = L.marker(
        [order.delivery_location.latitude, order.delivery_location.longitude],
        {
          icon: L.divIcon({
            className: '',
            html: `
              <div style="position: relative; width: 24px; height: 24px;">
                <div style="
                  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                  background: #ef4444; width: 20px; height: 20px; border-radius: 50%;
                  border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  display: flex; align-items: center; justify-content: center;
                ">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3" fill="#ef4444"/>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }
      ).addTo(map);
      
      deliveryMarker.bindPopup(`<strong>Teslimat Adresi</strong><br/>${order.delivery_address || ''}`);
      markersRef.current.push(deliveryMarker);
    }

    // Kurye marker'ı (Yeşil, animasyonlu)
    if (order.courier_location?.latitude) {
      const courierInitials = order.courier_name 
        ? order.courier_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : 'K';
      
      const courierMarker = L.marker(
        [order.courier_location.latitude, order.courier_location.longitude],
        {
          icon: L.divIcon({
            className: 'courier-marker',
            html: `
              <div style="position: relative; width: 28px; height: 28px; border-radius: 50% !important; background: transparent !important;">
                <div style="
                  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                  width: 28px; height: 28px; border-radius: 50%;
                  background: rgba(34, 197, 94, 0.3);
                  animation: pulse 2s infinite;
                "></div>
                <div style="
                  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                  background: #22c55e; width: 22px; height: 22px; border-radius: 50%;
                  border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                  display: flex; align-items: center; justify-content: center;
                  color: white; font-size: 9px; font-weight: 700;
                ">${courierInitials}</div>
              </div>
              <style>
                @keyframes pulse {
                  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
                }
              </style>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          })
        }
      ).addTo(map);
      
      courierMarker.bindPopup(`<strong>Kurye</strong><br/>${order.courier_name || ''}`);
      markersRef.current.push(courierMarker);
    }
  };

  const fitBounds = () => {
    if (!mapInstanceRef.current) return;
    
    const L = window.L;
    const bounds = [];
    
    if (order.delivery_location?.latitude) {
      bounds.push([order.delivery_location.latitude, order.delivery_location.longitude]);
    }
    if (order.courier_location?.latitude) {
      bounds.push([order.courier_location.latitude, order.courier_location.longitude]);
    }
    
    if (bounds.length >= 2) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
    } else if (bounds.length === 1) {
      mapInstanceRef.current.setView(bounds[0], 15);
    }
  };

  const hasDeliveryLocation = order.delivery_location?.latitude;
  const hasCourierLocation = order.courier_location?.latitude;

  return (
    <div className="space-y-3">
      {/* Harita */}
      <div 
        ref={mapRef} 
        className="w-full h-[300px] rounded-lg border bg-slate-100"
        data-testid="order-map"
      />

      {/* Lejand */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow" />
          <span className="text-slate-600">Teslimat Noktası</span>
        </div>
        {hasCourierLocation && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow" />
            <span className="text-slate-600">Kurye Konumu</span>
          </div>
        )}
      </div>

      {/* Bilgi mesajları */}
      {!hasDeliveryLocation && !hasCourierLocation && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          Konum bilgisi bulunamadı
        </div>
      )}
      
      {hasDeliveryLocation && !hasCourierLocation && (
        <div className="text-center py-2 text-xs text-amber-600 bg-amber-50 rounded-lg">
          Kurye konum bilgisi henüz mevcut değil
        </div>
      )}
    </div>
  );
}
