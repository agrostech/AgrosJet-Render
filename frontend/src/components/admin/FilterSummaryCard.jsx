import { Card, CardContent } from "@/components/ui/card";
import { Store, Bike } from "lucide-react";

/**
 * Filtreleme sonucu özet kartı
 * Restoran veya Kurye filtrelemesi yapıldığında toplam değerleri gösterir
 */
export default function FilterSummaryCard({ 
  orders, 
  restaurantFilter, 
  courierFilter, 
  restaurants, 
  couriers 
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

  // Restoran filtrelemesi yapıldıysa
  if (restaurantFilter !== "all") {
    return (
      <Card className="mb-4 border-2 border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Store className="w-5 h-5 text-green-600" />
            <h3 className="font-bold text-green-800">
              {selectedRestaurant?.name || "Restoran"} - Özet
            </h3>
            <span className="text-sm text-green-600">({orders.length} sipariş)</span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-muted-foreground mb-1">Taşıma Ücreti</p>
              <p className="text-lg font-bold text-green-700">{totals.tasimaUcreti.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-muted-foreground mb-1">Taşıma Ücreti KDV</p>
              <p className="text-lg font-bold text-green-700">{totals.tasimaKdv.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-muted-foreground mb-1">POS Komisyonu</p>
              <p className="text-lg font-bold text-green-700">{totals.posKomisyonu.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-muted-foreground mb-1">Nakit Sipariş Toplamı</p>
              <p className="text-lg font-bold text-emerald-600">{totals.nakitToplam.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-muted-foreground mb-1">Kredi Kartı Sipariş Toplamı</p>
              <p className="text-lg font-bold text-blue-600">{totals.kartToplam.toFixed(2)}₺</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Kurye filtrelemesi yapıldıysa
  if (courierFilter !== "all") {
    return (
      <Card className="mb-4 border-2 border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bike className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-red-800">
              {selectedCourier?.name || "Kurye"} - Özet
            </h3>
            <span className="text-sm text-red-600">({orders.length} sipariş)</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <p className="text-xs text-muted-foreground mb-1">Toplam Hakediş</p>
              <p className="text-lg font-bold text-red-700">{totals.kuryeHakedis.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <p className="text-xs text-muted-foreground mb-1">Toplam Nakit</p>
              <p className="text-lg font-bold text-emerald-600">{totals.nakitToplam.toFixed(2)}₺</p>
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <p className="text-xs text-muted-foreground mb-1">Toplam Kredi Kartı</p>
              <p className="text-lg font-bold text-blue-600">{totals.kartToplam.toFixed(2)}₺</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
