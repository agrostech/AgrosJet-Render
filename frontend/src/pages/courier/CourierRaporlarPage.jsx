import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OdemeRaporu, KazancRaporu } from "@/components/courier/reports";

export default function CourierRaporlarPage({ courierId, companyId }) {
  const [activeTab, setActiveTab] = useState("odeme");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Raporlar</h2>
      
      {/* Tab Buttons */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "odeme" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("odeme")}
          data-testid="tab-odeme-raporu"
        >
          Ödeme Raporu
        </Button>
        <Button
          variant={activeTab === "kazanc" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("kazanc")}
          data-testid="tab-kazanc-raporu"
        >
          Kazanç Raporu
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === "odeme" && <OdemeRaporu courierId={courierId} companyId={companyId} />}
      {activeTab === "kazanc" && <KazancRaporu courierId={courierId} companyId={companyId} />}
    </div>
  );
}
