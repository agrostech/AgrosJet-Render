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
  { key: "kar-zarar", label: "Kar / Zarar", icon: TrendingUp },
  { key: "performans", label: "Performans", icon: BarChart3 },
];

export default function RaporlarTab({ companyId, isSuperAdmin }) {
  const [activeSubTab, setActiveSubTab] = useState("kurye");

  return (
    <div>
      <div className="overflow-x-auto scrollbar-hide mb-4">
        <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
              activeSubTab === tab.key
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
            }`}
            data-testid={`sub-tab-${tab.key}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
        </div>
      </div>

      {activeSubTab === "kurye" && <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />}
      {activeSubTab === "restoran" && <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />}
      {activeSubTab === "ciro" && <CiroRaporu companyId={companyId} />}
      {activeSubTab === "kar-zarar" && <KarZararRaporu companyId={companyId} />}
      {activeSubTab === "performans" && <PerformansRaporu companyId={companyId} />}
    </div>
  );
}
