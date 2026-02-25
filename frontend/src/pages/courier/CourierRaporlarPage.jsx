import { useState } from "react";
import { FileText, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { OdemeRaporu, KazancRaporu, IhlalRaporu, PerformansRaporu } from "@/components/courier/reports";

export default function CourierRaporlarPage({ courierId, companyId }) {
  const [activeTab, setActiveTab] = useState("odeme");

  return (
    <div className="space-y-4">
      {/* Sekmeler */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("odeme")}
          className={`flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "odeme"
              ? "bg-white text-purple-700 shadow-md border border-purple-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-odeme-raporu"
        >
          <FileText className="w-4 h-4" />
          Ödeme
        </button>
        <button
          onClick={() => setActiveTab("kazanc")}
          className={`flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "kazanc"
              ? "bg-white text-green-700 shadow-md border border-green-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-kazanc-raporu"
        >
          <TrendingUp className="w-4 h-4" />
          Kazanç
        </button>
        <button
          onClick={() => setActiveTab("ihlal")}
          className={`flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "ihlal"
              ? "bg-white text-orange-700 shadow-md border border-orange-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-ihlal-raporu"
        >
          <AlertTriangle className="w-4 h-4" />
          İhlal
        </button>
        <button
          onClick={() => setActiveTab("performans")}
          className={`flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
            activeTab === "performans"
              ? "bg-white text-blue-700 shadow-md border border-blue-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-performans-raporu"
        >
          <BarChart3 className="w-4 h-4" />
          Performans
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "odeme" && <OdemeRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "kazanc" && <KazancRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "ihlal" && <IhlalRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "performans" && <PerformansRaporu courierId={courierId} companyId={companyId} />}
    </div>
  );
}
