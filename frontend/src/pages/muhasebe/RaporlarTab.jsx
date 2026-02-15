import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Store } from "lucide-react";
import KuryeRaporlari from "@/components/admin/reports/KuryeRaporlari";
import RestoranRaporlari from "@/components/admin/reports/RestoranRaporlari";

export default function RaporlarTab({ companyId, isSuperAdmin }) {
  const [activeSubTab, setActiveSubTab] = useState("kurye");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
          <TabsTrigger value="kurye" className="flex items-center gap-2" data-testid="sub-tab-kurye">
            <Users className="w-4 h-4" />
            Kurye Raporları
          </TabsTrigger>
          <TabsTrigger value="restoran" className="flex items-center gap-2" data-testid="sub-tab-restoran">
            <Store className="w-4 h-4" />
            Restoran Raporları
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kurye">
          <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
        </TabsContent>

        <TabsContent value="restoran">
          <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
