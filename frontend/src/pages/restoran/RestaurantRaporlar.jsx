import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function RestaurantRaporlar({ restaurantId }) {
  return (
    <div className="space-y-6" data-testid="restaurant-raporlar">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Raporlar</h1>
        <p className="text-sm text-muted-foreground">Sipariş ve performans raporları</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Geliştirme Aşamasında</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Raporlar modülü yakında aktif olacaktır. Bu bölümde sipariş istatistiklerinizi, 
            performans metriklerinizi ve detaylı analizleri görüntüleyebileceksiniz.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
