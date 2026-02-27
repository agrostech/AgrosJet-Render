import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
      {/* Header with Sub-tabs - Sipariş Yönetimi ile aynı tasarım */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Raporlar</h1>
            <p className="text-sm text-muted-foreground">Sipariş ve performans raporları</p>
          </div>
        </div>
        
        {/* Alt Sekmeler - Sipariş Yönetimi ile aynı stil */}
        <div className="flex gap-1 border-b">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isActive 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
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
