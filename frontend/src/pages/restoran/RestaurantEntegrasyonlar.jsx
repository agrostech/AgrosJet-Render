import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function RestaurantEntegrasyonlar({ restaurantId }) {
  return (
    <div className="space-y-6" data-testid="restaurant-entegrasyonlar">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Entegrasyonlar</h1>
        <p className="text-sm text-muted-foreground">Dış sistem bağlantıları</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Construction className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Geliştirme Aşamasında</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Entegrasyonlar modülü yakında aktif olacaktır. Bu bölümde Adisyo, Yemeksepeti 
            ve diğer platformlarla entegrasyon ayarlarınızı yönetebileceksiniz.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
