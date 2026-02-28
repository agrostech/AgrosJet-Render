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
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900">Raporlar</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Sipariş ve performans raporları</p>
          </div>
        </div>
        
        {/* Alt Sekmeler - Mobilde yatay scroll */}
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 border-b min-w-max sm:min-w-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive 
                      ? "border-primary text-primary" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.key === "mutabakat" ? "Mütabakat" : tab.key === "ciro" ? "Ciro" : "Performans"}</span>
                </button>
              );
            })}
          </div>
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
