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
    const pm = (order.payment_method || "").toLowerCase();
    
    if (pm === "cash" || pm === "nakit") {
      acc.nakitToplam += tutar;
    } else if (pm === "card" || pm === "credit_card" || pm === "kredi_karti" || pm === "kart") {
      acc.kartToplam += tutar;
    } else if (pm === "online" || pm === "online_odeme") {
      acc.onlineToplam += tutar; // Online ayrı sayılır
    } else if (pm === "meal_card" || pm === "yemek_karti" || pm === "online_meal_card") {
      acc.yemekKartiToplam += tutar;
    }
    
    return acc;
  }, {
    tasimaUcreti: 0,
    tasimaKdv: 0,
    posKomisyonu: 0,
    kuryeHakedis: 0,
    nakitToplam: 0,
    kartToplam: 0,
    onlineToplam: 0,
    yemekKartiToplam: 0
  });

  // Restoran adını bul
  const selectedRestaurant = restaurants.find(r => r.id === restaurantFilter);
  
  // Kurye adını bul
  const selectedCourier = couriers.find(c => c.id === courierFilter);

  // Toplam Taşıma Ücreti (Taşıma Ücreti + KDV)
  const toplamTasimaUcreti = totals.tasimaUcreti + totals.tasimaKdv;
  
  // Sonuç hesaplama: (Toplam Taşıma Ücreti + POS Komisyonu) - (Nakit + Kredi Kartı + Online)
  const sonuc = (toplamTasimaUcreti + totals.posKomisyonu) - (totals.nakitToplam + totals.kartToplam + totals.onlineToplam);

  // Restoran filtrelemesi yapıldıysa
  if (restaurantFilter !== "all") {
    return (
      <Card className="mb-4 border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {selectedRestaurant?.name || "Restoran"} - Özet
            </h3>
            <span className="text-sm text-muted-foreground">({orders.length} sipariş)</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {/* Gelirler */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Gelirler</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taşıma Ücreti</span>
                  <span className="font-medium">{totals.tasimaUcreti.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">KDV</span>
                  <span className="font-medium">{totals.tasimaKdv.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">POS Komisyonu</span>
                  <span className="font-medium">{totals.posKomisyonu.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold text-green-600">{(toplamTasimaUcreti + totals.posKomisyonu).toFixed(2)}₺</span>
                </div>
              </div>
            </div>
            
            {/* Tahsilatlar */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tahsilatlar</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nakit</span>
                  <span className="font-medium">{totals.nakitToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kredi Kartı</span>
                  <span className="font-medium">{totals.kartToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold text-red-600">{(totals.nakitToplam + totals.kartToplam).toFixed(2)}₺</span>
                </div>
              </div>
            </div>
            
            {/* Diğer Ödemeler */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Diğer Ödemeler</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Online</span>
                  <span className="font-medium">{totals.onlineToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Yemek Kartı</span>
                  <span className="font-medium">{totals.yemekKartiToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold">{(totals.onlineToplam + totals.yemekKartiToplam).toFixed(2)}₺</span>
                </div>
              </div>
            </div>
            
            {/* Sonuç */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Sonuç</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Gelirler</span>
                  <span className="text-green-600">+{(toplamTasimaUcreti + totals.posKomisyonu).toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tahsilatlar</span>
                  <span className="text-red-600">-{(totals.nakitToplam + totals.kartToplam).toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Net</span>
                  <span className={`font-bold text-lg ${sonuc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {sonuc >= 0 ? '+' : ''}{sonuc.toFixed(2)}₺
                  </span>
                </div>
              </div>
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
      <Card className="mb-4 border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Bike className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">
              {selectedCourier?.name || "Kurye"} - Özet
            </h3>
            <span className="text-sm text-muted-foreground">({orders.length} sipariş)</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {/* Hakediş */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Hakediş</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paket Hakediş</span>
                  <span className="font-medium">{totals.kuryeHakedis.toFixed(2)}₺</span>
                </div>
                {hourlyData && hourlyData.hourly_rate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saatlik</span>
                    <span className="font-medium">{hourlyData.hourly_earnings.toFixed(2)}₺</span>
                  </div>
                )}
                {hourlyData && hourlyData.hourly_rate > 0 && (
                  <div className="text-xs text-muted-foreground">
                    ({hourlyData.active_hours} saat × {hourlyData.hourly_rate}₺)
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold text-red-600">{totalHakedis.toFixed(2)}₺</span>
                </div>
              </div>
            </div>
            
            {/* Tahsilatlar */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tahsilatlar</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nakit</span>
                  <span className="font-medium">{totals.nakitToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kredi Kartı</span>
                  <span className="font-medium">{totals.kartToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold text-green-600">{(totals.nakitToplam + totals.kartToplam).toFixed(2)}₺</span>
                </div>
              </div>
            </div>
            
            {/* Diğer Ödemeler */}
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border">
              <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Diğer Ödemeler</h4>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Online</span>
                  <span className="font-medium">{totals.onlineToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Yemek Kartı</span>
                  <span className="font-medium">{totals.yemekKartiToplam.toFixed(2)}₺</span>
                </div>
                <div className="flex justify-between pt-1 border-t">
                  <span className="font-semibold">Toplam</span>
                  <span className="font-bold">{(totals.onlineToplam + totals.yemekKartiToplam).toFixed(2)}₺</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
