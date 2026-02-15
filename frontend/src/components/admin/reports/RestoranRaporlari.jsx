import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Filter, Search } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestoranRaporlari({ companyId, isSuperAdmin }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [company, setCompany] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  
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
    setSearchTerm("");
    try {
      const params = new URLSearchParams({
        company_id: companyId,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
      });
      
      const res = await axios.get(`${API}/reports/restaurant?${params.toString()}`);
      setReportData(res.data);
    } catch (err) {
      console.error("Rapor oluşturulamadı:", err);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  // Filtrelenmiş restoranlar
  const filteredRestaurants = useMemo(() => {
    if (!reportData?.restaurants) return [];
    if (!searchTerm.trim()) return reportData.restaurants;
    
    return reportData.restaurants.filter(restaurant => 
      restaurant.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [reportData?.restaurants, searchTerm]);

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            {/* Summary Stats - Text Format */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-6 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Toplam Sipariş:</span>
                <span className="font-bold">{reportData.summary?.totalOrders || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Taşıma Ücreti:</span>
                <span className="font-bold">{(reportData.summary?.totalTransportFee || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Taşıma KDV:</span>
                <span className="font-bold">{(reportData.summary?.totalTransportKdv || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground font-medium">Toplam Taşıma:</span>
                <span className="font-bold text-green-600">{(reportData.summary?.totalTransport || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">POS Komisyonu:</span>
                <span className="font-bold text-green-600">{(reportData.summary?.totalPosCommission || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Nakit:</span>
                <span className="font-bold text-red-600">{(reportData.summary?.totalCash || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Kredi Kartı:</span>
                <span className="font-bold text-red-600">{(reportData.summary?.totalCard || 0).toFixed(2)}₺</span>
              </div>
              <div className="flex items-center gap-1 border-l pl-4 ml-2">
                <span className="text-muted-foreground font-medium">Sonuç:</span>
                <span className={`font-bold ${(reportData.summary?.result || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(reportData.summary?.result || 0) >= 0 ? '+' : ''}{(reportData.summary?.result || 0).toFixed(2)}₺
                </span>
              </div>
            </div>

            {/* Search */}
            {reportData.restaurants && reportData.restaurants.length > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Restoran ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-restaurant"
                  />
                </div>
              </div>
            )}

            {/* Empty State */}
            {(!reportData.restaurants || reportData.restaurants.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <p>Seçilen tarih aralığında veri bulunamadı.</p>
              </div>
            )}

            {/* Restaurant List */}
            {filteredRestaurants.length > 0 && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Restoran</th>
                      <th className="text-right p-3 font-medium">Sipariş</th>
                      <th className="text-right p-3 font-medium">Taşıma Ücreti</th>
                      <th className="text-right p-3 font-medium">Taşıma KDV</th>
                      <th className="text-right p-3 font-medium">Toplam Taşıma</th>
                      <th className="text-right p-3 font-medium">POS Kom.</th>
                      <th className="text-right p-3 font-medium">Nakit</th>
                      <th className="text-right p-3 font-medium">Kredi Kartı</th>
                      <th className="text-right p-3 font-medium">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRestaurants.map((restaurant, idx) => {
                      const toplamTasima = restaurant.transportFee + restaurant.transportKdv;
                      const sonuc = (toplamTasima + restaurant.posCommission) - (restaurant.cash + restaurant.card);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-3">{restaurant.name}</td>
                          <td className="p-3 text-right">{restaurant.orderCount}</td>
                          <td className="p-3 text-right">{restaurant.transportFee.toFixed(2)}₺</td>
                          <td className="p-3 text-right">{restaurant.transportKdv.toFixed(2)}₺</td>
                          <td className="p-3 text-right text-green-600 font-medium">{toplamTasima.toFixed(2)}₺</td>
                          <td className="p-3 text-right text-green-600">{restaurant.posCommission.toFixed(2)}₺</td>
                          <td className="p-3 text-right text-red-600">{restaurant.cash.toFixed(2)}₺</td>
                          <td className="p-3 text-right text-red-600">{restaurant.card.toFixed(2)}₺</td>
                          <td className={`p-3 text-right font-bold ${sonuc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {sonuc >= 0 ? '+' : ''}{sonuc.toFixed(2)}₺
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* No search results */}
            {searchTerm && filteredRestaurants.length === 0 && reportData.restaurants?.length > 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>"{searchTerm}" için sonuç bulunamadı.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
