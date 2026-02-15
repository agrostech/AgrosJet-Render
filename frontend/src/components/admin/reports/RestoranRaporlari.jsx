import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Filter } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestoranRaporlari({ companyId, isSuperAdmin }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [company, setCompany] = useState(null);
  
  // Date-time filters
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  // Varsayılan tarih/saat hesaplama
  const getDefaultDateTimes = useCallback((companyData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = companyData?.opening_time || "09:00";
    const closingTime = companyData?.closing_time || "23:00";
    
    // Format: YYYY-MM-DDTHH:MM
    const formatDate = (d) => d.toISOString().split('T')[0];
    
    return {
      start: `${formatDate(today)}T${openingTime}`,
      end: `${formatDate(tomorrow)}T${closingTime}`
    };
  }, []);

  // Şirket bilgilerini yükle
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;
      try {
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        setCompany(companyRes.data);
        
        // Varsayılan tarihleri ayarla
        const defaults = getDefaultDateTimes(companyRes.data);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      } catch (err) {
        console.error("Veri yüklenemedi:", err);
        // Fallback varsayılan değerler
        const defaults = getDefaultDateTimes(null);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      }
    };
    fetchData();
  }, [companyId, getDefaultDateTimes]);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        company_id: companyId,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
      });
      if (selectedRestaurant !== "all") {
        params.append("restaurant_id", selectedRestaurant);
      }
      
      const res = await axios.get(`${API}/reports/restaurant?${params.toString()}`);
      setReportData(res.data);
    } catch (err) {
      console.error("Rapor oluşturulamadı:", err);
      setReportData(null);
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
              <Label>Restoran</Label>
              <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                <SelectTrigger data-testid="select-restaurant">
                  <SelectValue placeholder="Restoran seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Restoranlar</SelectItem>
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Başlangıç</Label>
              <Input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                data-testid="input-start-datetime"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Bitiş</Label>
              <Input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                data-testid="input-end-datetime"
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Toplam Sipariş</p>
                <p className="text-xl font-bold">{reportData.summary?.totalOrders || 0}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Taşıma Ücreti</p>
                <p className="text-xl font-bold">{(reportData.summary?.totalTransportFee || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Taşıma KDV</p>
                <p className="text-xl font-bold">{(reportData.summary?.totalTransportKdv || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">POS Komisyonu</p>
                <p className="text-xl font-bold text-green-600">{(reportData.summary?.totalPosCommission || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Nakit Sipariş</p>
                <p className="text-xl font-bold text-red-600">{(reportData.summary?.totalCash || 0).toFixed(2)}₺</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Kredi Kartı</p>
                <p className="text-xl font-bold text-red-600">{(reportData.summary?.totalCard || 0).toFixed(2)}₺</p>
              </div>
            </div>

            {/* Empty State */}
            {(!reportData.restaurants || reportData.restaurants.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Seçilen tarih aralığında veri bulunamadı.</p>
              </div>
            )}

            {/* Restaurant List */}
            {reportData.restaurants && reportData.restaurants.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Restoran</th>
                      <th className="text-right p-3 font-medium">Sipariş</th>
                      <th className="text-right p-3 font-medium">Taşıma Ücreti</th>
                      <th className="text-right p-3 font-medium">Taşıma KDV</th>
                      <th className="text-right p-3 font-medium">POS Kom.</th>
                      <th className="text-right p-3 font-medium">Nakit</th>
                      <th className="text-right p-3 font-medium">Kredi Kartı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.restaurants.map((restaurant, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3">{restaurant.name}</td>
                        <td className="p-3 text-right">{restaurant.orderCount}</td>
                        <td className="p-3 text-right">{restaurant.transportFee.toFixed(2)}₺</td>
                        <td className="p-3 text-right">{restaurant.transportKdv.toFixed(2)}₺</td>
                        <td className="p-3 text-right text-green-600">{restaurant.posCommission.toFixed(2)}₺</td>
                        <td className="p-3 text-right text-red-600">{restaurant.cash.toFixed(2)}₺</td>
                        <td className="p-3 text-right text-red-600">{restaurant.card.toFixed(2)}₺</td>
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
