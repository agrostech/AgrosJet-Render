import { useState } from "react";
import { FileText, TrendingUp } from "lucide-react";
import { OdemeRaporu, KazancRaporu } from "@/components/courier/reports";

export default function CourierRaporlarPage({ courierId, companyId }) {
  const [activeTab, setActiveTab] = useState("odeme");

  return (
    <div className="space-y-4">
      {/* Sekmeler */}
      <div className="flex bg-slate-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("odeme")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
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
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all ${
            activeTab === "kazanc"
              ? "bg-white text-green-700 shadow-md border border-green-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
          data-testid="tab-kazanc-raporu"
        >
          <TrendingUp className="w-4 h-4" />
          Kazanç Raporu
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "odeme" && <OdemeRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "kazanc" && <KazancRaporu courierId={courierId} companyId={companyId} />}
    </div>
  );
}
