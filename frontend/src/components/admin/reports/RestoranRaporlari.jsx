import { useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import ReportDateFilter from "./ReportDateFilter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestoranRaporlari({ companyId, isSuperAdmin }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setSearchTerm("");
    try {
      const params = new URLSearchParams({ company_id: companyId, start_datetime: start, end_datetime: end });
      const res = await axios.get(`${API}/reports/restaurant?${params.toString()}`);
      setReportData(res.data);
    } catch {
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const filteredRestaurants = useMemo(() => {
    if (!reportData?.restaurants) return [];
    if (!searchTerm.trim()) return reportData.restaurants;
    return reportData.restaurants.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [reportData?.restaurants, searchTerm]);

  return (
    <div className="space-y-3">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} />

      {/* Report Results */}
      {reportData && (
        <Card>
          <CardContent className="p-3">
            {/* Summary - Compact */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 text-muted-foreground">
              <span>Sipariş: <strong className="text-foreground">{reportData.summary?.totalOrders || 0}</strong></span>
              <span>Taşıma Ü.: <strong className="text-foreground">{(reportData.summary?.totalTransportFee || 0).toFixed(2)}₺</strong></span>
              <span>Taşıma KDV: <strong className="text-foreground">{(reportData.summary?.totalTransportKdv || 0).toFixed(2)}₺</strong></span>
              <span>Top. Taşıma: <strong className="text-green-600">{(reportData.summary?.totalTransport || 0).toFixed(2)}₺</strong></span>
              <span>POS Kom.: <strong className="text-green-600">{(reportData.summary?.totalPosCommission || 0).toFixed(2)}₺</strong></span>
              <span>Nakit: <strong className="text-red-600">{(reportData.summary?.totalCash || 0).toFixed(2)}₺</strong></span>
              <span>Kart: <strong className="text-red-600">{(reportData.summary?.totalCard || 0).toFixed(2)}₺</strong></span>
              <span>Y.Kartı: <strong className="text-foreground">{(reportData.summary?.totalMealCardAll || 0).toFixed(2)}₺</strong>{(reportData.summary?.totalMealCard || 0) > 0 && <strong className="text-red-600 ml-1">({(reportData.summary?.totalMealCard || 0).toFixed(2)}₺)</strong>}</span>
              <span>Online: <strong>{(reportData.summary?.totalOnline || 0).toFixed(2)}₺</strong></span>
              <span className="border-l pl-3 ml-1">Sonuç: <strong className={(reportData.summary?.result || 0) >= 0 ? 'text-green-600' : 'text-red-600'}>{(reportData.summary?.result || 0) >= 0 ? '+' : ''}{(reportData.summary?.result || 0).toFixed(2)}₺</strong></span>
            </div>

            {/* Search */}
            {reportData.restaurants?.length > 0 && (
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Restoran ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 pl-7 text-xs"
                  data-testid="input-search-restaurant"
                />
              </div>
            )}

            {/* Empty */}
            {!reportData.restaurants?.length && (
              <p className="text-center py-4 text-xs text-muted-foreground">Veri bulunamadı.</p>
            )}

            {/* Table */}
            {filteredRestaurants.length > 0 && (
              <div className="border rounded overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Restoran</th>
                      <th className="text-right p-2 font-medium">Sipariş</th>
                      <th className="text-right p-2 font-medium">Taşıma Ü.</th>
                      <th className="text-right p-2 font-medium">Taşıma KDV</th>
                      <th className="text-right p-2 font-medium">Top. Taşıma</th>
                      <th className="text-right p-2 font-medium">POS Kom.</th>
                      <th className="text-right p-2 font-medium">Nakit</th>
                      <th className="text-right p-2 font-medium">Kart</th>
                      <th className="text-right p-2 font-medium">Y.Kartı</th>
                      <th className="text-right p-2 font-medium">Online</th>
                      <th className="text-right p-2 font-medium">Sonuç</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRestaurants.map((r, i) => {
                      const toplamTasima = r.transportFee + r.transportKdv;
                      // Tahsilat ayarlarına göre hesaplama
                      const cashForCalc = r.cash_included !== false ? r.cash : 0;
                      const cardForCalc = r.card_included !== false ? r.card : 0;
                      const mealCardForCalc = r.meal_card_included !== false ? (r.mealCard || 0) : 0;
                      const posForCalc = r.card_included !== false ? r.posCommission : 0;
                      const sonuc = (toplamTasima + posForCalc) - (cashForCalc + cardForCalc + mealCardForCalc);
                      return (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 text-right">{r.orderCount}</td>
                          <td className="p-2 text-right">{r.transportFee.toFixed(2)}₺</td>
                          <td className="p-2 text-right">{r.transportKdv.toFixed(2)}₺</td>
                          <td className="p-2 text-right text-green-600">{toplamTasima.toFixed(2)}₺</td>
                          <td className="p-2 text-right text-green-600">{r.posCommission.toFixed(2)}₺</td>
                          <td className={`p-2 text-right ${r.cash_included !== false ? 'text-red-600' : 'text-slate-800'}`} title={r.cash_included === false ? 'Restoran tahsil ediyor' : ''}>
                            {r.cash.toFixed(2)}₺{r.cash_included === false && '*'}
                          </td>
                          <td className={`p-2 text-right ${r.card_included !== false ? 'text-red-600' : 'text-slate-800'}`} title={r.card_included === false ? 'Restoran tahsil ediyor' : ''}>
                            {r.card.toFixed(2)}₺{r.card_included === false && '*'}
                          </td>
                          <td className={`p-2 text-right ${r.meal_card_included !== false ? 'text-red-600' : 'text-slate-800'}`} title={r.meal_card_included === false ? 'Restoran tahsil ediyor' : ''}>
                            {(r.mealCard || 0).toFixed(2)}₺{r.meal_card_included === false && '*'}
                          </td>
                          <td className="p-2 text-right">
                            {(r.online || 0).toFixed(2)}₺
                          </td>
                          <td className={`p-2 text-right font-bold ${sonuc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {sonuc >= 0 ? '+' : ''}{sonuc.toFixed(2)}₺
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {searchTerm && !filteredRestaurants.length && reportData.restaurants?.length > 0 && (
              <p className="text-center py-4 text-xs text-muted-foreground">"{searchTerm}" bulunamadı.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
