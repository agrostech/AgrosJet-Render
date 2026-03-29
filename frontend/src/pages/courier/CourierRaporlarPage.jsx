import { useState } from "react";
import { BarChart3, FileText, TrendingUp, AlertTriangle } from "lucide-react";
import { OdemeRaporu, KazancRaporu, IhlalRaporu, PerformansRaporu } from "@/components/courier/reports";

export default function CourierRaporlarPage({ courierId, companyId }) {
  const [activeTab, setActiveTab] = useState("performans");

  return (
    <div className="space-y-4">
      {/* Sekmeler - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-100 rounded-lg p-1.5">
        <button
          onClick={() => setActiveTab("performans")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "performans"
              ? "bg-white text-blue-700 shadow-md border border-blue-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-performans-raporu"
        >
          <BarChart3 className="w-4 h-4" />
          Performansım
        </button>
        <button
          onClick={() => setActiveTab("odeme")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "odeme"
              ? "bg-white text-purple-700 shadow-md border border-purple-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-odeme-raporu"
        >
          <FileText className="w-4 h-4" />
          Ödeme Raporu
        </button>
        <button
          onClick={() => setActiveTab("kazanc")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "kazanc"
              ? "bg-white text-green-700 shadow-md border border-green-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-kazanc-raporu"
        >
          <TrendingUp className="w-4 h-4" />
          Kazanç Raporu
        </button>
        <button
          onClick={() => setActiveTab("ihlal")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "ihlal"
              ? "bg-white text-orange-700 shadow-md border border-orange-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-ihlal-raporu"
        >
          <AlertTriangle className="w-4 h-4" />
          İhlallerim
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "performans" && <PerformansRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "odeme" && <OdemeRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "kazanc" && <KazancRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "ihlal" && <IhlalRaporu courierId={courierId} companyId={companyId} />}
    </div>
  );
}
