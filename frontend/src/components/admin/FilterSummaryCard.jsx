import { Card, CardContent } from "@/components/ui/card";
import { Store, Bike, Clock } from "lucide-react";

/**
 * Filtreleme sonucu özet kartı
 * Restoran veya Kurye filtrelemesi yapıldığında toplam değerleri gösterir
 */
export default function FilterSummaryCard({ 
  orders, 
  restaurantFilter, 
  courierFilter, 
  restaurants, 
  couriers,
  hourlyData = null  // { active_hours, hourly_rate, hourly_earnings }
}) {
  // Filtreleme yapılmadıysa gösterme
  if (restaurantFilter === "all" && courierFilter === "all") {
    return null;
  }

  // Hesaplamalar
  const totals = orders.reduce((acc, order) => {
    // Taşıma bedeli (restaurant_fee)
    acc.tasimaUcreti += order.restaurant_fee || 0;
    
    // Taşıma bedeli KDV
    acc.tasimaKdv += order.restaurant_kdv || 0;
    
    // POS Komisyonu
    acc.posKomisyonu += order.pos_commission || 0;
    
    // Kurye Hakediş
    if (order.courier_id) {
      acc.kuryeHakedis += order.courier_fee || 0;
    }
    
    // Ödeme yöntemine göre sipariş tutarları
    const tutar = order.total_amount || 0;
    if (order.payment_method === "cash") {
      acc.nakitToplam += tutar;
    } else if (order.payment_method === "card") {
      acc.kartToplam += tutar;
    } else if (order.payment_method === "online") {
      acc.onlineToplam += tutar;
    }
    
    return acc;
  }, {
    tasimaUcreti: 0,
    tasimaKdv: 0,
    posKomisyonu: 0,
    kuryeHakedis: 0,
    nakitToplam: 0,
    kartToplam: 0,
    onlineToplam: 0
  });

  // Restoran adını bul
  const selectedRestaurant = restaurants.find(r => r.id === restaurantFilter);
  
  // Kurye adını bul
  const selectedCourier = couriers.find(c => c.id === courierFilter);

  // Toplam Taşıma Ücreti (Taşıma Ücreti + KDV)
  const toplamTasimaUcreti = totals.tasimaUcreti + totals.tasimaKdv;
  
  // Sonuç hesaplama: (Toplam Taşıma Ücreti + POS Komisyonu) - (Nakit + Kredi Kartı)
  const sonuc = (toplamTasimaUcreti + totals.posKomisyonu) - (totals.nakitToplam + totals.kartToplam);

  // Restoran filtrelemesi yapıldıysa
  if (restaurantFilter !== "all") {
    return (
      <Card className="mb-4 border bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Store className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {selectedRestaurant?.name || "Restoran"} - Özet
            </h3>
            <span className="text-sm text-muted-foreground">({orders.length} sipariş)</span>
          </div>
          
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Taşıma Ücreti:</span>
              <span className="font-medium">{totals.tasimaUcreti.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Taşıma Ücreti KDV:</span>
              <span className="font-medium">{totals.tasimaKdv.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground font-medium">Toplam Taşıma Ücreti:</span>
              <span className="font-bold text-green-600">{toplamTasimaUcreti.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">POS Komisyonu:</span>
              <span className="font-medium text-green-600">{totals.posKomisyonu.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Nakit Toplam:</span>
              <span className="font-medium text-red-600">{totals.nakitToplam.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Kredi Kartı Toplam:</span>
              <span className="font-medium text-red-600">{totals.kartToplam.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1 border-l pl-4 ml-2">
              <span className="text-muted-foreground font-medium">Sonuç:</span>
              <span className={`font-bold ${sonuc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {sonuc >= 0 ? '+' : ''}{sonuc.toFixed(2)}₺
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Kurye filtrelemesi yapıldıysa
  if (courierFilter !== "all") {
    // Toplam hakediş = paket hakediş + saatlik kazanç
    const totalHakedis = totals.kuryeHakedis + (hourlyData?.hourly_earnings || 0);
    
    return (
      <Card className="mb-4 border bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bike className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {selectedCourier?.name || "Kurye"} - Özet
            </h3>
            <span className="text-sm text-muted-foreground">({orders.length} sipariş)</span>
          </div>
          
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Paket Hakediş:</span>
              <span className="font-medium text-red-600">{totals.kuryeHakedis.toFixed(2)}₺</span>
            </div>
            {hourlyData && hourlyData.hourly_rate > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded">
                <Clock className="w-3 h-3 text-amber-600" />
                <span className="text-amber-700">Saatlik:</span>
                <span className="font-medium text-amber-700">{hourlyData.hourly_earnings.toFixed(2)}₺</span>
                <span className="text-xs text-amber-500">({hourlyData.active_hours}s × {hourlyData.hourly_rate}₺)</span>
              </div>
            )}
            {hourlyData && hourlyData.hourly_rate > 0 && (
              <div className="flex items-center gap-1 border-l pl-3">
                <span className="text-muted-foreground font-medium">Toplam Hakediş:</span>
                <span className="font-bold text-purple-600">{totalHakedis.toFixed(2)}₺</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Toplam Nakit:</span>
              <span className="font-medium text-green-600">{totals.nakitToplam.toFixed(2)}₺</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Toplam Kredi Kartı:</span>
              <span className="font-medium text-green-600">{totals.kartToplam.toFixed(2)}₺</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
