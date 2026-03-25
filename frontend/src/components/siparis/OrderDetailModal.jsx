import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  MapPin, Phone, Clock, User, Bike, Store, Package, 
  Navigation, XCircle, Map, BellOff
} from "lucide-react";
import { 
  ORDER_STATUSES, 
  getCountdown, 
  parseOrderNotes, 
  formatTime, 
  formatCurrency 
} from "@/utils/orderUtils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function OrderDetailModal({
  open,
  onOpenChange,
  order,
  companyId,
  adminName,
  isSuperAdmin,
  isAdminActive,
  onUnassignCourier,
  onAssignCourier,
  onStatusUpdated
}) {
  const [activeTab, setActiveTab] = useState("details");
  const orderMapRef = useRef(null);
  const orderMapInstanceRef = useRef(null);

  // Modal kapandığında cleanup
  useEffect(() => {
    if (!open) {
      setActiveTab("details");
      if (orderMapInstanceRef.current) {
        orderMapInstanceRef.current.remove();
        orderMapInstanceRef.current = null;
      }
    }
  }, [open]);

  // Konum sekmesi haritası
  useEffect(() => {
    if (activeTab !== 'location' || !order) return;
    
    const initOrderMap = async () => {
      if (!orderMapRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!orderMapRef.current) return;
      }
      
      if (orderMapInstanceRef.current) {
        orderMapInstanceRef.current.remove();
        orderMapInstanceRef.current = null;
      }
      
      if (!window.L) {
        const loadLeaflet = () => {
          return new Promise((resolve) => {
            if (window.L) {
              resolve();
              return;
            }
            
            if (!document.querySelector('link[href*="leaflet"]')) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
              document.head.appendChild(link);
            }
            
            if (!document.querySelector('script[src*="leaflet"]')) {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
              script.onload = () => resolve();
              document.head.appendChild(script);
            } else {
              const checkInterval = setInterval(() => {
                if (window.L) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
            }
          });
        };
        
        await loadLeaflet();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!window.L || !orderMapRef.current) return;
      
      const L = window.L;
      const deliveryLat = order.delivery_location?.latitude || 41.0082;
      const deliveryLng = order.delivery_location?.longitude || 28.9784;
      const restaurantLat = order.restaurant_location?.latitude;
      const restaurantLng = order.restaurant_location?.longitude;
      
      const map = L.map(orderMapRef.current, {
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([deliveryLat, deliveryLng], 15);
      
      const tileUrl = document.documentElement.classList.contains('dark')
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      L.tileLayer(tileUrl, {
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);
      
      const radiusInDegrees = 0.0045;
      const bounds1km = L.latLngBounds([
        [deliveryLat - radiusInDegrees, deliveryLng - radiusInDegrees],
        [deliveryLat + radiusInDegrees, deliveryLng + radiusInDegrees]
      ]);
      
      const deliveryIcon = L.divIcon({
        className: 'order-marker',
        html: `<div style="background: #3b82f6; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [15, 15],
        iconAnchor: [7.5, 7.5]
      });
      
      L.marker([deliveryLat, deliveryLng], { icon: deliveryIcon })
        .addTo(map)
        .bindPopup(`<b>Teslimat Adresi</b><br>${order.delivery_address}`);
      
      if (restaurantLat && restaurantLng) {
        L.marker([restaurantLat, restaurantLng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:10px;height:10px;background:#9ca3af;border-radius:50% !important;-webkit-border-radius:50% !important;border:1px solid #6b7280;box-sizing:border-box;"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5]
          })
        })
          .addTo(map)
          .bindPopup(`<b>${order.restaurant_name}</b><br>Restoran`);
      }
      
      map.fitBounds(bounds1km);
      orderMapInstanceRef.current = map;
      
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
      setTimeout(() => map.invalidateSize(), 500);
    };
    
    const timer = setTimeout(initOrderMap, 150);
    return () => clearTimeout(timer);
  }, [activeTab, order]);

  // Super Admin durum değiştirme
  const handleSuperAdminStatusChange = async (newStatus) => {
    try {
      await axios.post(`${API}/orders/${companyId}/${order.id}/status`, {
        status: newStatus,
        actor_type: 'admin',
        actor_name: adminName,
        is_super_admin: true
      });
      onStatusUpdated?.();
      onOpenChange(false);
    } catch (err) {
      console.error("Status update error:", err);
      alert(err.response?.data?.detail || "Durum güncellenirken hata oluştu");
    }
  };

  if (!order) return null;

  const statusInfo = ORDER_STATUSES[order.status] || ORDER_STATUSES.preparing;
  const countdown = order.status === 'preparing' && order.preparation_end_at 
    ? getCountdown(order.preparation_end_at) 
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sipariş Bilgileri
            <Badge className={`${countdown?.expired ? 'bg-red-500' : statusInfo.color} text-white`}>
              {countdown ? countdown.text : statusInfo.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Detaylar
            </TabsTrigger>
            <TabsTrigger value="location" className="flex items-center gap-2">
              <Map className="w-4 h-4" />
              Konum
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Geçmiş
            </TabsTrigger>
          </TabsList>
          
          {/* Detaylar Sekmesi */}
          <TabsContent value="details" className="flex-1 overflow-y-auto mt-4 space-y-4">
            {/* Sipariş No ve Doğrulama Kodu */}
            <div className="flex items-center justify-between text-sm">
              {order.order_number && (
                <div className="text-muted-foreground">
                  Sipariş No: <span className="font-medium text-slate-700">{order.order_number}</span>
                </div>
              )}
              {order.verification_code && (
                <div className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                  Doğrulama: {order.verification_code}
                </div>
              )}
            </div>

            {/* Restaurant */}
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <Store className="w-5 h-5 text-slate-500 mt-0.5" />
              <div>
                <p className="font-medium">{order.restaurant_name}</p>
                <p className="text-sm text-muted-foreground">Restoran</p>
              </div>
            </div>

            {/* Customer */}
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <User className="w-5 h-5 text-slate-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{order.customer_name}</p>
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-mono truncate">
                      {order.customer_phone?.includes(',,') 
                        ? order.customer_phone.split(',,')[0]
                        : order.customer_phone
                      }
                    </span>
                  </div>
                  {order.customer_phone?.includes(',,') && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-blue-600">
                      <span className="ml-5">Dahili: {order.customer_phone.split(',,')[1]}</span>
                    </div>
                  )}
                </div>
              </div>
              <a 
                href={`tel:${order.customer_phone}`}
                className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 flex-shrink-0"
                title="Ara (otomatik dahili tuşlama)"
              >
                <Phone className="w-4 h-4 text-slate-600" />
              </a>
            </div>

            {/* Özel Teslimat Uyarıları */}
            {(order.contactless_delivery || order.save_green || order.ring_doorbell === false) && (
              <div className="space-y-2">
                {order.ring_doorbell === false && (
                  <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm">
                    <BellOff className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">Zili çalmayın!</span>
                  </div>
                )}
                {order.contactless_delivery && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <span className="text-lg">⚠️</span>
                    <span className="font-medium">Temassız teslimat! Adrese ulaştığınızda müşteriyi arayın.</span>
                  </div>
                )}
                {order.save_green && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    <span className="text-lg">♻️</span>
                    <span>Plastik çatal, bıçak ve peçete göndermeyin.</span>
                  </div>
                )}
              </div>
            )}

            {/* Sipariş Notu */}
            {order.note && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">📝 Sipariş Notu</p>
                <p className="text-sm text-yellow-700 mt-1">{order.note}</p>
              </div>
            )}

            {/* Delivery Address */}
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <MapPin className="w-3 h-3 text-slate-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{order.delivery_address}</p>
                {/* Adres Tarifi */}
                {order.address_direction && (
                  <p className="text-sm text-blue-600 mt-1">
                    <span className="font-medium">📍 Tarif:</span> {order.address_direction}
                  </p>
                )}
                {order.notes && (() => {
                  const parsedNotes = parseOrderNotes(order.notes);
                  return (
                    <div className="mt-2 space-y-1">
                      {parsedNotes.customer && (
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Müşteri Notu:</span> {parsedNotes.customer}
                        </p>
                      )}
                      {parsedNotes.kitchen && (
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Mutfak Notu:</span> {parsedNotes.kitchen}
                        </p>
                      )}
                      {parsedNotes.other && (
                        <p className="text-sm text-slate-600">
                          <span className="font-medium">Not:</span> {parsedNotes.other}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"
                onClick={() => setActiveTab("location")}
              >
                <Navigation className="w-4 h-4 text-slate-600" />
              </Button>
            </div>

            {/* Items */}
            <div className="border rounded-lg p-3">
              <p className="font-medium mb-2">Ürünler</p>
              <div className="space-y-2">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="border-b pb-2 last:border-b-0 last:pb-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{item.quantity}x {item.name}</span>
                      <span>{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                    {/* Ürün Opsiyonları */}
                    {item.options && item.options.length > 0 && (
                      <div className="mt-1 ml-4 text-xs text-muted-foreground space-y-0.5">
                        {item.options.map((opt, optIdx) => (
                          <div key={optIdx} className={opt.excluded ? 'text-red-600' : ''}>
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
                      <div className="mt-1 ml-4 text-xs bg-yellow-50 text-yellow-800 px-2 py-1 rounded">
                        📝 {item.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t">
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
                      <span className="text-green-600">{formatCurrency(order.total_amount)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between font-semibold">
                    <span>Toplam</span>
                    <span>{formatCurrency(order.total_amount)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">Ödeme Yöntemi</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  (order.payment_type || order.payment_method) === 'cash' ? 'bg-green-100 text-green-700' : 
                  (order.payment_type || order.payment_method) === 'card' ? 'bg-blue-100 text-blue-700' : 
                  ((order.payment_type || order.payment_method) === 'meal_card' || (order.payment_type || order.payment_method) === 'online_meal_card') ? 'bg-orange-100 text-orange-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {order.source === 'migros' && order.payment_method_detail ? order.payment_method_detail :
                    (order.payment_type || order.payment_method) === 'cash' ? 'Nakit' : 
                    (order.payment_type || order.payment_method) === 'card' ? 'Kart' : 
                    ((order.payment_type || order.payment_method) === 'meal_card' || (order.payment_type || order.payment_method) === 'online_meal_card') ? 'Yemek Kartı' : 
                    'Online'}
                </span>
              </div>
            </div>

            {/* Courier */}
            {order.courier_name ? (
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Bike className="w-5 h-5 text-slate-500" />
                  <div>
                    <p className="font-medium">{order.courier_name}</p>
                    <p className="text-sm text-muted-foreground">Kurye</p>
                  </div>
                </div>
                {order.status !== 'on_the_way' && order.status !== 'delivered' && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => {
                      onUnassignCourier(order.id);
                      onOpenChange(false);
                    }}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Kaldır
                  </Button>
                )}
              </div>
            ) : (
              <Button 
                className="w-full"
                disabled={!isAdminActive}
                onClick={() => {
                  onOpenChange(false);
                  onAssignCourier();
                }}
              >
                <Bike className="w-4 h-4 mr-2" />
                {isAdminActive ? 'Kurye Ata' : 'Atama için aktif olun'}
              </Button>
            )}
          </TabsContent>
          
          {/* Konum Sekmesi */}
          <TabsContent value="location" className="flex-1 mt-4">
            <div className="space-y-3">
              <div 
                ref={orderMapRef}
                className="w-full h-[350px] rounded-lg border"
                style={{ zIndex: 1 }}
              />
              
              <a 
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.delivery_location?.latitude},${order.delivery_location?.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Navigation className="w-4 h-4" />
                Google Maps'te Yol Tarifi Al
              </a>
            </div>
          </TabsContent>
          
          {/* Geçmiş Sekmesi */}
          <TabsContent value="history" className="flex-1 overflow-y-auto mt-4">
            <div className="space-y-1">
              {order.status_history && order.status_history.length > 0 ? (
                [...order.status_history].reverse().map((entry, idx) => {
                  const entryStatusInfo = ORDER_STATUSES[entry.status] || { color: 'bg-slate-500' };
                  const entryTime = new Date(entry.timestamp);
                  
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 border-l-2 border-slate-200 ml-2">
                      <div className={`w-3 h-3 rounded-full ${entryStatusInfo.color} mt-1 flex-shrink-0 -ml-[19px]`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">{entry.label}</p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {entryTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {entryTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {entry.actor_type === 'auto' ? 'Otomatik' : 
                             entry.actor_type === 'admin' ? `${entry.actor_name}` :
                             entry.actor_type === 'courier' ? `${entry.actor_name}` :
                             entry.actor_name || 'Sistem'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-3 border-l-2 border-slate-200 ml-2">
                    <div className={`w-3 h-3 rounded-full ${statusInfo.color} mt-1 flex-shrink-0 -ml-[19px]`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{statusInfo.label}</p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {order.updated_at ? new Date(order.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {order.created_at && (
                    <div className="flex items-start gap-3 p-3 border-l-2 border-slate-200 ml-2">
                      <div className="w-3 h-3 rounded-full bg-slate-400 mt-1 flex-shrink-0 -ml-[19px]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm">Sipariş Oluşturuldu</p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(order.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
          
          {/* Super Admin için Durum Değiştirme */}
          {isSuperAdmin && (order.status === 'delivered' || order.status === 'cancelled') && (
            <div className="mt-4 pt-4 border-t">
              <Label className="text-xs text-muted-foreground mb-2 block">Sipariş Durumunu Değiştir (Süper Admin)</Label>
              <Select
                value={order.status}
                onValueChange={handleSuperAdminStatusChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Beklemede</SelectItem>
                  <SelectItem value="preparing">Hazırlanıyor</SelectItem>
                  <SelectItem value="ready">Hazır</SelectItem>
                  <SelectItem value="assigned">Atandı</SelectItem>
                  <SelectItem value="picked_up">Yolda</SelectItem>
                  <SelectItem value="delivered">Teslim Edildi</SelectItem>
                  <SelectItem value="cancelled">İptal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
