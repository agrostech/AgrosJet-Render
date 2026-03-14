import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Store, TrendingUp, BarChart3, Receipt } from "lucide-react";
import KuryeRaporlari from "@/components/admin/reports/KuryeRaporlari";
import RestoranRaporlari from "@/components/admin/reports/RestoranRaporlari";
import KarZararRaporu from "@/components/admin/reports/KarZararRaporu";
import PerformansRaporu from "@/components/admin/reports/PerformansRaporu";
import CiroRaporu from "@/components/admin/reports/CiroRaporu";

export default function RaporlarTab({ companyId, isSuperAdmin }) {
  const [activeSubTab, setActiveSubTab] = useState("kurye");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-3xl grid-cols-5 mb-4">
          <TabsTrigger value="kurye" className="flex items-center gap-2" data-testid="sub-tab-kurye">
            <Users className="w-4 h-4" />
            Kurye
          </TabsTrigger>
          <TabsTrigger value="restoran" className="flex items-center gap-2" data-testid="sub-tab-restoran">
            <Store className="w-4 h-4" />
            Restoran
          </TabsTrigger>
          <TabsTrigger value="ciro" className="flex items-center gap-2" data-testid="sub-tab-ciro">
            <Receipt className="w-4 h-4" />
            Ciro
          </TabsTrigger>
          <TabsTrigger value="kar-zarar" className="flex items-center gap-2" data-testid="sub-tab-kar-zarar">
            <TrendingUp className="w-4 h-4" />
            Kar / Zarar
          </TabsTrigger>
          <TabsTrigger value="performans" className="flex items-center gap-2" data-testid="sub-tab-performans">
            <BarChart3 className="w-4 h-4" />
            Performans
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kurye">
          <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
        </TabsContent>

        <TabsContent value="restoran">
          <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
        </TabsContent>

        <TabsContent value="ciro">
          <CiroRaporu companyId={companyId} />
        </TabsContent>

        <TabsContent value="kar-zarar">
          <KarZararRaporu companyId={companyId} />
        </TabsContent>

        <TabsContent value="performans">
          <PerformansRaporu companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
