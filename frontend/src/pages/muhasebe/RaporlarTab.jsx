import { useState } from "react";
import { Users, Store, TrendingUp, BarChart3, Receipt } from "lucide-react";
import KuryeRaporlari from "@/components/admin/reports/KuryeRaporlari";
import RestoranRaporlari from "@/components/admin/reports/RestoranRaporlari";
import KarZararRaporu from "@/components/admin/reports/KarZararRaporu";
import PerformansRaporu from "@/components/admin/reports/PerformansRaporu";
import CiroRaporu from "@/components/admin/reports/CiroRaporu";

const SUB_TABS = [
  { key: "kurye", label: "Kurye", icon: Users },
  { key: "restoran", label: "Restoran", icon: Store },
  { key: "ciro", label: "Ciro", icon: Receipt },
  { key: "kar-zarar", label: "Kar/Zarar", icon: TrendingUp },
  { key: "performans", label: "Performans", icon: BarChart3 },
];

export default function RaporlarTab({ companyId, isSuperAdmin, companyLogo, companyName }) {
  const [activeSubTab, setActiveSubTab] = useState("kurye");

  return (
    <div>
      {/* Mobilde yatay kaydırılabilir, masaüstünde normal */}
      <div className="overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
        <div className="flex gap-0.5 sm:gap-1 border-b-2 border-slate-200 min-w-max">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeSubTab === tab.key
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid={`sub-tab-${tab.key}`}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === "kurye" && <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "restoran" && <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "ciro" && <CiroRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "kar-zarar" && <KarZararRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "performans" && <PerformansRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
    </div>
  );
}
