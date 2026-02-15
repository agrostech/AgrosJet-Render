import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Filter } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryeRaporlari({ companyId, isSuperAdmin }) {
  const [couriers, setCouriers] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState("all");
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

  useEffect(() => {
    const fetchCouriers = async () => {
      if (!companyId) return;
      try {
        const res = await axios.get(`${API}/companies/${companyId}/couriers`);
        setCouriers(res.data || []);
      } catch (err) {
        console.error("Kuryeler yüklenemedi:", err);
      }
    };
    fetchCouriers();
  }, [companyId]);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        company_id: companyId,
        start_date: startDate,
        end_date: endDate,
      });
      if (selectedCourier !== "all") {
        params.append("courier_id", selectedCourier);
      }
      
      const res = await axios.get(`${API}/reports/courier?${params.toString()}`);
      setReportData(res.data);
    } catch (err) {
      console.error("Rapor oluşturulamadı:", err);
      // Mock data for now
      setReportData({
        summary: {
          totalOrders: 0,
          totalEarnings: 0,
          totalCash: 0,
          totalCard: 0,
        },
        couriers: []
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtreler
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Kurye</Label>
              <Select value={selectedCourier} onValueChange={setSelectedCourier}>
                <SelectTrigger data-testid="select-courier">
                  <SelectValue placeholder="Kurye seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kuryeler</SelectItem>
                  {couriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
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
              <CardTitle className="text-base">Rapor Sonuçları</CardTitle>
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
                <p className="text-xs text-muted-foreground">Toplam Hakediş</p>
                <p className="text-xl font-bold text-red-600">{(reportData.summary?.totalEarnings || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Nakit Tahsilat</p>
                <p className="text-xl font-bold text-green-600">{(reportData.summary?.totalCash || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Kredi Kartı</p>
                <p className="text-xl font-bold text-green-600">{(reportData.summary?.totalCard || 0).toFixed(2)}₺</p>
              </div>
            </div>

            {/* Empty State */}
            {(!reportData.couriers || reportData.couriers.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Seçilen tarih aralığında veri bulunamadı.</p>
              </div>
            )}

            {/* Courier List */}
            {reportData.couriers && reportData.couriers.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Kurye</th>
                      <th className="text-right p-3 font-medium">Sipariş</th>
                      <th className="text-right p-3 font-medium">Hakediş</th>
                      <th className="text-right p-3 font-medium">Nakit</th>
                      <th className="text-right p-3 font-medium">Kredi Kartı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.couriers.map((courier, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3">{courier.name}</td>
                        <td className="p-3 text-right">{courier.orderCount}</td>
                        <td className="p-3 text-right text-red-600">{courier.earnings.toFixed(2)}₺</td>
                        <td className="p-3 text-right text-green-600">{courier.cash.toFixed(2)}₺</td>
                        <td className="p-3 text-right text-green-600">{courier.card.toFixed(2)}₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
