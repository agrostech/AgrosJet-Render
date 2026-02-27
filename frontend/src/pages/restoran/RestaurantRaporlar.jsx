import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, BarChart3 } from "lucide-react";
import RestaurantMutabakatRaporu from "./components/RestaurantMutabakatRaporu";

const TABS = [
  { key: "mutabakat", label: "Mütabakat", icon: FileText },
  { key: "ciro", label: "Ciro", icon: TrendingUp },
  { key: "performans", label: "Performans", icon: BarChart3 },
];

export default function RestaurantRaporlar({ restaurantId, companyId }) {
  const [activeTab, setActiveTab] = useState("mutabakat");

  return (
    <div className="space-y-4" data-testid="restaurant-raporlar">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Raporlar</h1>
        <p className="text-sm text-muted-foreground">Sipariş ve performans raporları</p>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 border-b border-border pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="gap-2"
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "mutabakat" && (
        <RestaurantMutabakatRaporu restaurantId={restaurantId} companyId={companyId} />
      )}

      {activeTab === "ciro" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <TrendingUp className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Ciro Raporu</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Yakında aktif olacak.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === "performans" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Performans Raporu</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Yakında aktif olacak.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
