import { useState } from "react";
import { Users, Building2, Wallet } from "lucide-react";
import KuryelerTab from "./muhasebe/KuryelerTab";
import IsletmelerTab from "./muhasebe/IsletmelerTab";
import CarilerTab from "./muhasebe/CarilerTab";

const TABS = [
  { key: "kuryeler", label: "Kuryeler", icon: Users },
  { key: "isletmeler", label: "İşletmeler", icon: Building2 },
  { key: "cariler", label: "Cariler", icon: Wallet },
];

export default function MuhasebePage({ companyId }) {
  const [activeTab, setActiveTab] = useState("kuryeler");

  return (
    <div data-testid="muhasebe-page">
      <h2 className="font-heading text-xl font-bold tracking-tight mb-4">Muhasebe</h2>
      
      {/* Alt Sekmeler */}
      <div className="flex gap-1 border-b-2 border-slate-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-[2px] ${
              activeTab === tab.key
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`muhasebe-tab-${tab.key}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab İçeriği */}
      <div>
        {activeTab === "kuryeler" && <KuryelerTab companyId={companyId} />}
        {activeTab === "isletmeler" && <IsletmelerTab companyId={companyId} />}
        {activeTab === "cariler" && <CarilerTab companyId={companyId} />}
      </div>
    </div>
  );
}
