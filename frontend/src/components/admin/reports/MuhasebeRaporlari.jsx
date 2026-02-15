import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Filter, AlertCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MuhasebeRaporlari({ companyId, isSuperAdmin }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  
  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setDate(1); // Ayın ilk günü
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      // Mock data for now - API endpoint will be implemented later
      setReportData({
        summary: {
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          totalOrders: 0,
          totalTransportIncome: 0,
          totalCourierPayments: 0,
          totalPosCommission: 0,
        }
      });
    } catch (err) {
      console.error("Rapor oluşturulamadı:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Muhasebe raporları yakında aktif olacaktır. Şu an geliştirme aşamasındadır.</span>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Başlangıç Tarihi</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Bitiş Tarihi</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={handleGenerateReport} 
                disabled={loading}
                className="w-full"
                data-testid="btn-generate-report"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Yükleniyor...
                  </>
                ) : (
                  "Rapor Oluştur"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Results */}
      {reportData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Özet Rapor</CardTitle>
              <Button variant="outline" size="sm" disabled>
                <Download className="w-4 h-4 mr-2" />
                Excel İndir
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Toplam Sipariş</p>
                <p className="text-xl font-bold">{reportData.summary?.totalOrders || 0}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Taşıma Geliri</p>
                <p className="text-xl font-bold text-green-600">{(reportData.summary?.totalTransportIncome || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Kurye Ödemeleri</p>
                <p className="text-xl font-bold text-red-600">{(reportData.summary?.totalCourierPayments || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">POS Komisyonu</p>
                <p className="text-xl font-bold text-green-600">{(reportData.summary?.totalPosCommission || 0).toFixed(2)}₺</p>
              </div>
            </div>

            {/* Net Profit Card */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Net Kar/Zarar</p>
                  <p className={`text-2xl font-bold ${(reportData.summary?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(reportData.summary?.netProfit || 0) >= 0 ? '+' : ''}{(reportData.summary?.netProfit || 0).toFixed(2)}₺
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
