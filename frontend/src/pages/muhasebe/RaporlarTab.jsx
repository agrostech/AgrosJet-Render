import { useState, useMemo } from "react";
import { Users, Store, TrendingUp, BarChart3, Receipt } from "lucide-react";
import KuryeRaporlari from "@/components/admin/reports/KuryeRaporlari";
import RestoranRaporlari from "@/components/admin/reports/RestoranRaporlari";
import KarZararRaporu from "@/components/admin/reports/KarZararRaporu";
import PerformansRaporu from "@/components/admin/reports/PerformansRaporu";
import CiroRaporu from "@/components/admin/reports/CiroRaporu";

const SUB_TABS = [
  { key: "kurye", label: "Kurye", icon: Users, permKey: "raporlar_kurye" },
  { key: "restoran", label: "Restoran", icon: Store, permKey: "raporlar_restoran" },
  { key: "ciro", label: "Ciro", icon: Receipt, permKey: "raporlar_ciro" },
  { key: "kar-zarar", label: "Kar/Zarar", icon: TrendingUp, permKey: "raporlar_kar_zarar" },
  { key: "performans", label: "Performans", icon: BarChart3, permKey: "raporlar_performans" },
];

export default function RaporlarTab({ companyId, isSuperAdmin, companyLogo, companyName, permissions = {} }) {
  const visibleTabs = useMemo(() => {
    if (isSuperAdmin) return SUB_TABS;
    // Alt izin key'leri DB'de var mı kontrol et
    const hasAnySubPerm = Object.keys(permissions).some(k => k.startsWith("raporlar_"));
    if (!hasAnySubPerm) return SUB_TABS; // Eski admin, alt izin tanımlanmamış → tümünü göster
    return SUB_TABS.filter(tab => permissions[tab.permKey] === true); // Alt izin varsa sadece true olanları göster
  }, [isSuperAdmin, permissions]);

  const [activeSubTab, setActiveSubTab] = useState(() => visibleTabs[0]?.key || "kurye");

  if (visibleTabs.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Bu sayfaya erişim izniniz yok</div>;
  }

  return (
    <div>
      <div className="overflow-x-auto scrollbar-hide scroll-smooth mb-4">
        <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
          {visibleTabs.map((tab) => (
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

      {activeSubTab === "kurye" && <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "restoran" && <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "ciro" && <CiroRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "kar-zarar" && <KarZararRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
      {activeSubTab === "performans" && <PerformansRaporu companyId={companyId} companyLogo={companyLogo} companyName={companyName} />}
    </div>
  );
}
