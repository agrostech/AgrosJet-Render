import { useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Info, Clock, Package, Wallet, Banknote, CreditCard, UtensilsCrossed, ChevronDown, ChevronUp, FileDown } from "lucide-react";
import ReportDateFilter from "./ReportDateFilter";
import { exportKuryeRaporuPDF } from "@/utils/reportPdfExport";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function MiniStat({ icon: Icon, label, value, color = "text-foreground" }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {Icon && <Icon className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <strong className={`text-[11px] ${color} ml-auto flex-shrink-0`}>{value}</strong>
    </div>
  );
}

/* Mobilde her kurye bir kart olarak gösterilir */
function CourierCard({ c, hasMealCard }) {
  return (
    <div className="border rounded-lg p-2.5 space-y-1.5" data-testid={`courier-card-${c.name}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm truncate mr-2">
          {c.name}
          {c.modified_count > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="text-amber-500 hover:text-amber-600 ml-1 inline-flex" onClick={(e) => e.stopPropagation()}>
                  <Info className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 text-xs" align="start">
                <div className="space-y-1">
                  <div className="font-semibold text-amber-600 border-b pb-1">Ödeme Değişiklikleri</div>
                  <p className="text-muted-foreground">
                    <strong>{c.modified_count}</strong> siparişte ödeme yöntemi değiştirildi.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </span>
        <span className="text-xs font-bold text-red-600 flex-shrink-0">{(c.total_earnings || c.earnings).toFixed(2)}₺</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">Paket: <strong className="text-foreground">{c.orderCount}</strong></span>
        <span className="text-muted-foreground">Saat: <strong className="text-foreground">{c.active_hours}s</strong></span>
        <span className="text-muted-foreground">Paket Ü: <strong className="text-foreground">{c.earnings.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">Saatlik: <strong className="text-foreground">{c.hourly_earnings.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">Nakit: <strong className="text-green-600">{c.cash.toFixed(2)}₺</strong></span>
        <span className="text-muted-foreground">K.Kartı: <strong className="text-green-600">{c.card.toFixed(2)}₺</strong></span>
        {hasMealCard && (
          <span className="text-muted-foreground">Y.Kartı: <strong className="text-green-600">{(c.meal_card || 0).toFixed(2)}₺</strong></span>
        )}
      </div>
    </div>
  );
}

export default function KuryeRaporlari({ companyId, isSuperAdmin, companyLogo, companyName }) {
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
      const res = await axios.get(`${API}/reports/courier?${params.toString()}`);
      setReportData(res.data);
    } catch {
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const filteredCouriers = useMemo(() => {
    if (!reportData?.couriers) return [];
    if (!searchTerm.trim()) return reportData.couriers;
    return reportData.couriers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [reportData?.couriers, searchTerm]);

  const s = reportData?.summary;

  return (
    <div className="space-y-3">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} />

      {reportData && (
        <Card>
          <CardContent className="p-2.5 sm:p-3">
            {/* Başlık + PDF butonu */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">{reportData.couriers?.length || 0} kurye</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => exportKuryeRaporuPDF({ reportData, companyLogo, companyName, dateRange, companyId })}
                data-testid="btn-export-kurye-pdf"
              >
                <FileDown className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
            {/* Özet - Mobilde açılır/kapanır kompakt görünüm */}
            {s && (
              <div className="mb-3" data-testid="courier-report-summary">
                {/* Mobil: Kompakt özet + toggle */}
                <div className="sm:hidden">
                  <button
                    onClick={() => setSummaryOpen(!summaryOpen)}
                    className="w-full flex items-center justify-between py-1.5 px-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs"
                    data-testid="courier-summary-toggle"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        <Package className="w-3 h-3 inline mr-1" />{s.totalOrders || 0} paket
                      </span>
                      <span className="font-semibold text-red-600">
                        <Wallet className="w-3 h-3 inline mr-1" />{(s.totalCombined || s.totalEarnings || 0).toFixed(2)}₺
                      </span>
                    </div>
                    {summaryOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {summaryOpen && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 px-1">
                      <MiniStat icon={Clock} label="Çalışma" value={`${(s.totalActiveHours || 0).toFixed(1)}s`} />
                      <MiniStat label="Paket Ü." value={`${(s.totalEarnings || 0).toFixed(2)}₺`} />
                      <MiniStat label="Saatlik Ü." value={`${(s.totalHourlyEarnings || 0).toFixed(2)}₺`} />
                      <MiniStat icon={Banknote} label="Nakit" value={`${(s.totalCash || 0).toFixed(2)}₺`} color="text-green-600" />
                      <MiniStat icon={CreditCard} label="K.Kartı" value={`${(s.totalCard || 0).toFixed(2)}₺`} color="text-green-600" />
                      {reportData.hasMealCardCollection && (
                        <MiniStat icon={UtensilsCrossed} label="Y.Kartı" value={`${(s.totalMealCard || 0).toFixed(2)}₺`} color="text-green-600" />
                      )}
                      {s.totalModified > 0 && (
                        <span className="text-amber-600 text-[11px] col-span-2">Ödeme Değ.: <strong>{s.totalModified}</strong></span>
                      )}
                    </div>
                  )}
                </div>

                {/* Masaüstü: Mevcut inline özet */}
                <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-slate-500" />
                    Paket Sayısı: <strong className="text-foreground">{s.totalOrders || 0}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    Çalışma Saati: <strong className="text-foreground">{(s.totalActiveHours || 0).toFixed(2)}s</strong>
                  </span>
                  <span>Paket Ücreti: <strong className="text-foreground">{(s.totalEarnings || 0).toFixed(2)}₺</strong></span>
                  <span>Saatlik Ücret: <strong className="text-foreground">{(s.totalHourlyEarnings || 0).toFixed(2)}₺</strong></span>
                  <span className="flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-slate-500" />
                    Toplam Hakediş: <strong className="text-red-600">{(s.totalCombined || s.totalEarnings || 0).toFixed(2)}₺</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Banknote className="w-3 h-3 text-green-500" />
                    Nakit: <strong className="text-green-600">{(s.totalCash || 0).toFixed(2)}₺</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-green-500" />
                    Kredi Kartı: <strong className="text-green-600">{(s.totalCard || 0).toFixed(2)}₺</strong>
                  </span>
                  {reportData.hasMealCardCollection && (
                    <span className="flex items-center gap-1">
                      <UtensilsCrossed className="w-3 h-3 text-green-500" />
                      Yemek Kartı: <strong className="text-green-600">{(s.totalMealCard || 0).toFixed(2)}₺</strong>
                    </span>
                  )}
                  {s.totalModified > 0 && (
                    <span className="text-amber-600">Ödeme Değ.: <strong>{s.totalModified}</strong></span>
                  )}
                </div>
              </div>
            )}

            {/* Arama */}
            {reportData.couriers?.length > 0 && (
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Kurye ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 pl-7 text-xs"
                  data-testid="input-search-courier"
                />
              </div>
            )}

            {!reportData.couriers?.length && (
              <p className="text-center py-4 text-xs text-muted-foreground">Veri bulunamadı.</p>
            )}

            {/* Mobil: Kart görünümü */}
            {filteredCouriers.length > 0 && (
              <div className="sm:hidden space-y-2" data-testid="courier-cards-mobile">
                {filteredCouriers.map((c, i) => (
                  <CourierCard key={i} c={c} hasMealCard={reportData.hasMealCardCollection} />
                ))}
              </div>
            )}

            {/* Masaüstü: Tablo görünümü */}
            {filteredCouriers.length > 0 && (
              <div className="hidden sm:block border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Kurye</th>
                      <th className="text-right p-2 font-medium">Paket</th>
                      <th className="text-right p-2 font-medium">
                        <span className="flex items-center justify-end gap-1">
                          <Clock className="w-3 h-3" />
                          Saat
                        </span>
                      </th>
                      <th className="text-right p-2 font-medium">Paket Ü.</th>
                      <th className="text-right p-2 font-medium">Saatlik Ü.</th>
                      <th className="text-right p-2 font-medium">Toplam</th>
                      <th className="text-right p-2 font-medium text-green-600">Nakit</th>
                      <th className="text-right p-2 font-medium text-green-600">K.Kartı</th>
                      {reportData.hasMealCardCollection && (
                        <th className="text-right p-2 font-medium text-green-600">Y.Kartı</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCouriers.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">
                          <span className="inline-flex items-center gap-1">
                            {c.name}
                            {c.modified_count > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="text-amber-500 hover:text-amber-600" onClick={(e) => e.stopPropagation()}>
                                    <Info className="w-3 h-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2 text-xs" align="start">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-amber-600 border-b pb-1">Ödeme Değişiklikleri</div>
                                    <p className="text-muted-foreground">
                                      <strong>{c.modified_count}</strong> siparişte ödeme yöntemi teslim sırasında değiştirildi.
                                    </p>
                                    <p className="text-[10px] text-amber-600 bg-amber-50 p-1.5 rounded mt-1">
                                      Nakit ve kart tutarları güncellenerek hesaplanmıştır.
                                    </p>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </span>
                        </td>
                        <td className="p-2 text-right">{c.orderCount}</td>
                        <td className="p-2 text-right text-slate-600">{c.active_hours}s</td>
                        <td className="p-2 text-right">{c.earnings.toFixed(2)}₺</td>
                        <td className="p-2 text-right">{c.hourly_earnings.toFixed(2)}₺</td>
                        <td className="p-2 text-right font-medium text-red-600">{(c.total_earnings || c.earnings).toFixed(2)}₺</td>
                        <td className="p-2 text-right text-green-600">{c.cash.toFixed(2)}₺</td>
                        <td className="p-2 text-right text-green-600">{c.card.toFixed(2)}₺</td>
                        {reportData.hasMealCardCollection && (
                          <td className="p-2 text-right text-green-600">{(c.meal_card || 0).toFixed(2)}₺</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {searchTerm && !filteredCouriers.length && reportData.couriers?.length > 0 && (
              <p className="text-center py-4 text-xs text-muted-foreground">"{searchTerm}" bulunamadı.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
