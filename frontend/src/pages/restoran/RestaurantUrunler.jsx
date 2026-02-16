import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function RestaurantUrunler({ restaurantId }) {
  return (
    <div className="space-y-6" data-testid="restaurant-urunler">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ürünler</h1>
        <p className="text-sm text-muted-foreground">Menü ve ürün yönetimi</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Geliştirme Aşamasında</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Ürünler modülü yakında aktif olacaktır. Bu bölümde menünüzü düzenleyebilecek, 
            ürün fiyatlarını güncelleyebilecek ve stok takibi yapabileceksiniz.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
