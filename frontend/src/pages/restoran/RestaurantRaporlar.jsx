import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, TrendingUp, BarChart3 } from "lucide-react";
import RestaurantMutabakatRaporu from "./components/RestaurantMutabakatRaporu";
import RestaurantCiroRaporu from "./components/RestaurantCiroRaporu";
import RestaurantPerformansRaporu from "./components/RestaurantPerformansRaporu";

const TABS = [
  { key: "mutabakat", label: "Mütabakat Raporu", icon: FileText },
  { key: "ciro", label: "Ciro Raporu", icon: TrendingUp },
  { key: "performans", label: "Performans Raporu", icon: BarChart3 },
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
        <RestaurantCiroRaporu restaurantId={restaurantId} companyId={companyId} />
      )}

      {activeTab === "performans" && (
        <RestaurantPerformansRaporu restaurantId={restaurantId} companyId={companyId} />
      )}
    </div>
  );
}
