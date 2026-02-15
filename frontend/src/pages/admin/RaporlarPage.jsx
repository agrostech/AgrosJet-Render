import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Store, Calculator } from "lucide-react";
import KuryeRaporlari from "@/components/admin/reports/KuryeRaporlari";
import RestoranRaporlari from "@/components/admin/reports/RestoranRaporlari";
import MuhasebeRaporlari from "@/components/admin/reports/MuhasebeRaporlari";

export default function RaporlarPage({ companyId, isSuperAdmin = false }) {
  const [activeTab, setActiveTab] = useState("kurye");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Raporlar</h1>
      </div>

      <Card>
        <CardContent className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="kurye" className="flex items-center gap-2" data-testid="tab-kurye-raporlari">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Kurye Raporları</span>
                <span className="sm:hidden">Kurye</span>
              </TabsTrigger>
              <TabsTrigger value="restoran" className="flex items-center gap-2" data-testid="tab-restoran-raporlari">
                <Store className="w-4 h-4" />
                <span className="hidden sm:inline">Restoran Raporları</span>
                <span className="sm:hidden">Restoran</span>
              </TabsTrigger>
              <TabsTrigger value="muhasebe" className="flex items-center gap-2" data-testid="tab-muhasebe-raporlari">
                <Calculator className="w-4 h-4" />
                <span className="hidden sm:inline">Muhasebe</span>
                <span className="sm:hidden">Muhasebe</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kurye">
              <KuryeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
            </TabsContent>

            <TabsContent value="restoran">
              <RestoranRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
            </TabsContent>

            <TabsContent value="muhasebe">
              <MuhasebeRaporlari companyId={companyId} isSuperAdmin={isSuperAdmin} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
