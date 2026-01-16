import { useState, useRef, useEffect } from "react";
import { Users, Building2, Wallet, History } from "lucide-react";
import KuryelerTab from "./muhasebe/KuryelerTab";
import IsletmelerTab from "./muhasebe/IsletmelerTab";
import CarilerTab from "./muhasebe/CarilerTab";
import HareketlerTab from "./muhasebe/HareketlerTab";

const TABS = [
  { key: "kuryeler", label: "Kuryeler", icon: Users },
  { key: "isletmeler", label: "İşletmeler", icon: Building2 },
  { key: "cariler", label: "Cariler", icon: Wallet },
  { key: "hareketler", label: "Hareketler", icon: History },
];

export default function MuhasebePage({ companyId, adminId, adminName, companyLogo, companyName }) {
  const [activeTab, setActiveTab] = useState("kuryeler");
  const transactionRef = useRef(null);

  // Mobilde seçim yapıldığında işlem geçmişine scroll
  const scrollToTransactions = () => {
    if (window.innerWidth < 768 && transactionRef.current) {
      setTimeout(() => {
        transactionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  return (
    <div data-testid="muhasebe-page">
      <h2 className="font-heading text-xl font-bold tracking-tight mb-4">Muhasebe</h2>
      
      {/* Alt Sekmeler - Mobilde yatay scroll */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-1 border-b-2 border-slate-200 mb-4 min-w-max md:min-w-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === tab.key
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`muhasebe-tab-${tab.key}`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab İçeriği */}
      <div>
        {activeTab === "kuryeler" && <KuryelerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "isletmeler" && <IsletmelerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "cariler" && <CarilerTab companyId={companyId} adminId={adminId} adminName={adminName} companyLogo={companyLogo} companyName={companyName} transactionRef={transactionRef} onSelect={scrollToTransactions} />}
        {activeTab === "hareketler" && <HareketlerTab companyId={companyId} />}
      </div>
    </div>
  );
}
