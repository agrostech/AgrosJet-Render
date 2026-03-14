import { useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronUp, ShoppingBag, Truck, CreditCard, Banknote, Globe, Wallet, FileDown } from "lucide-react";
import ReportDateFilter from "./ReportDateFilter";
import { exportRestoranRaporuPDF } from "@/utils/reportPdfExport";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function MiniStat({ label, value, color = "text-foreground" }) {
  return (
    <div className="flex items-center justify-between min-w-0">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <strong className={`text-[11px] ${color} ml-2 flex-shrink-0`}>{value}</strong>
    </div>
  );
}

/* Mobil kart görünümü */
function RestaurantCard({ r }) {
  const toplamTasima = r.transportFee + r.transportKdv;
  const cashForCalc = r.cash_included !== false ? r.cash : 0;
  const cardForCalc = r.card_included !== false ? r.card : 0;
  const mealCardForCalc = r.meal_card_included !== false ? (r.mealCard || 0) : 0;
  const posForCalc = r.card_included !== false ? r.posCommission : 0;
  const sonuc = (toplamTasima + posForCalc) - (cashForCalc + cardForCalc + mealCardForCalc);

  return (
    <div className="border rounded-lg p-2.5 space-y-1.5" data-testid={`restaurant-card-${r.name}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm truncate mr-2">{r.name}</span>
        <span className={`text-xs font-bold flex-shrink-0 ${sonuc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {sonuc >= 0 ? '+' : ''}{sonuc.toFixed(2)}₺
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">Sipariş: <strong className="text-foreground">{r.orderCount}</strong></span>
        <span className="text-muted-foreground">Top. Taşıma: <strong className="text-green-600">{toplamTasima.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">Taşıma Ü: <strong className="text-foreground">{r.transportFee.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">Taşıma KDV: <strong className="text-foreground">{r.transportKdv.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">POS Kom: <strong className="text-green-600">{r.posCommission.toFixed(2)}₺</strong></span>
        <span className={`text-muted-foreground`}>
          Nakit: <strong className={r.cash_included !== false ? 'text-red-600' : 'text-slate-800'}>{r.cash.toFixed(2)}₺{r.cash_included === false && '*'}</strong>
        </span>
        <span className={`text-muted-foreground`}>
          Kart: <strong className={r.card_included !== false ? 'text-red-600' : 'text-slate-800'}>{r.card.toFixed(2)}₺{r.card_included === false && '*'}</strong>
        </span>
        <span className={`text-muted-foreground`}>
          Y.Kartı: <strong className={r.meal_card_included !== false ? 'text-red-600' : 'text-slate-800'}>{(r.mealCard || 0).toFixed(2)}₺{r.meal_card_included === false && '*'}</strong>
        </span>
        <span className="text-muted-foreground">Online: <strong className="text-foreground">{(r.online || 0).toFixed(2)}₺</strong></span>
      </div>
    </div>
  );
}

export default function RestoranRaporlari({ companyId, isSuperAdmin, companyLogo, companyName }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setSearchTerm("");
    setDateRange({ start, end });
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

  const s = reportData?.summary;

  return (
    <div className="space-y-3">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} />

      {reportData && (
        <Card>
          <CardContent className="p-2.5 sm:p-3">
            {/* Başlık + PDF butonu */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{reportData.restaurants?.length || 0} restoran</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportRestoranRaporuPDF({ reportData, companyLogo, companyName, dateRange })}
                data-testid="btn-export-restoran-pdf"
              >
                <FileDown className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
            {/* Özet */}
            {s && (
              <div className="mb-3" data-testid="restaurant-report-summary">
                {/* Mobil: Kompakt özet + toggle */}
                <div className="sm:hidden">
                  <button
                    onClick={() => setSummaryOpen(!summaryOpen)}
                    className="w-full flex items-center justify-between py-1.5 px-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs"
                    data-testid="restaurant-summary-toggle"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        <ShoppingBag className="w-3 h-3 inline mr-1" />{s.totalOrders || 0} sipariş
                      </span>
                      <span className={`font-semibold ${(s.result || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <Wallet className="w-3 h-3 inline mr-1" />{(s.result || 0) >= 0 ? '+' : ''}{(s.result || 0).toFixed(2)}₺
                      </span>
                    </div>
                    {summaryOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {summaryOpen && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 px-1">
                      <MiniStat label="Taşıma Ü." value={`${(s.totalTransportFee || 0).toFixed(2)}₺`} />
                      <MiniStat label="Taşıma KDV" value={`${(s.totalTransportKdv || 0).toFixed(2)}₺`} />
                      <MiniStat label="Top. Taşıma" value={`${(s.totalTransport || 0).toFixed(2)}₺`} color="text-green-600" />
                      <MiniStat label="POS Kom." value={`${(s.totalPosCommission || 0).toFixed(2)}₺`} color="text-green-600" />
                      <MiniStat label="Nakit" value={`${(s.totalCash || 0).toFixed(2)}₺`} color="text-red-600" />
                      <MiniStat label="Kart" value={`${(s.totalCard || 0).toFixed(2)}₺`} color="text-red-600" />
                      <MiniStat label="Y.Kartı" value={`${(s.totalMealCardAll || 0).toFixed(2)}₺`} />
                      <MiniStat label="Online" value={`${(s.totalOnline || 0).toFixed(2)}₺`} />
                    </div>
                  )}
                </div>

                {/* Masaüstü: Mevcut inline özet */}
                <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Sipariş: <strong className="text-foreground">{s.totalOrders || 0}</strong></span>
                  <span>Taşıma Ü.: <strong className="text-foreground">{(s.totalTransportFee || 0).toFixed(2)}₺</strong></span>
                  <span>Taşıma KDV: <strong className="text-foreground">{(s.totalTransportKdv || 0).toFixed(2)}₺</strong></span>
                  <span>Top. Taşıma: <strong className="text-green-600">{(s.totalTransport || 0).toFixed(2)}₺</strong></span>
                  <span>POS Kom.: <strong className="text-green-600">{(s.totalPosCommission || 0).toFixed(2)}₺</strong></span>
                  <span>Nakit: <strong className="text-red-600">{(s.totalCash || 0).toFixed(2)}₺</strong></span>
                  <span>Kart: <strong className="text-red-600">{(s.totalCard || 0).toFixed(2)}₺</strong></span>
                  <span>Y.Kartı: <strong className="text-foreground">{(s.totalMealCardAll || 0).toFixed(2)}₺</strong>{(s.totalMealCard || 0) > 0 && <strong className="text-red-600 ml-1">({(s.totalMealCard || 0).toFixed(2)}₺)</strong>}</span>
                  <span>Online: <strong>{(s.totalOnline || 0).toFixed(2)}₺</strong></span>
                  <span className="border-l pl-3 ml-1">Sonuç: <strong className={(s.result || 0) >= 0 ? 'text-green-600' : 'text-red-600'}>{(s.result || 0) >= 0 ? '+' : ''}{(s.result || 0).toFixed(2)}₺</strong></span>
                </div>
              </div>
            )}

            {/* Arama */}
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

            {!reportData.restaurants?.length && (
              <p className="text-center py-4 text-xs text-muted-foreground">Veri bulunamadı.</p>
            )}

            {/* Mobil: Kart görünümü */}
            {filteredRestaurants.length > 0 && (
              <div className="sm:hidden space-y-2" data-testid="restaurant-cards-mobile">
                {filteredRestaurants.map((r, i) => (
                  <RestaurantCard key={i} r={r} />
                ))}
              </div>
            )}

            {/* Masaüstü: Tablo */}
            {filteredRestaurants.length > 0 && (
              <div className="hidden sm:block border rounded overflow-x-auto">
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
