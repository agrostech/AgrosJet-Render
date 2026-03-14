import { useState, useCallback, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Info, Clock, Package, Wallet, Banknote, CreditCard, UtensilsCrossed } from "lucide-react";
import ReportDateFilter from "./ReportDateFilter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryeRaporlari({ companyId, isSuperAdmin }) {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setSearchTerm("");
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

  return (
    <div className="space-y-3">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} />

      {/* Report Results */}
      {reportData && (
        <Card>
          <CardContent className="p-3">
            {/* Summary - Updated Layout */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3 text-slate-500" />
                Paket Sayısı: <strong className="text-foreground">{reportData.summary?.totalOrders || 0}</strong>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Çalışma Saati: <strong className="text-foreground">{(reportData.summary?.totalActiveHours || 0).toFixed(2)}s</strong>
              </span>
              <span>Paket Ücreti: <strong className="text-foreground">{(reportData.summary?.totalEarnings || 0).toFixed(2)}₺</strong></span>
              <span>Saatlik Ücret: <strong className="text-foreground">{(reportData.summary?.totalHourlyEarnings || 0).toFixed(2)}₺</strong></span>
              <span className="flex items-center gap-1">
                <Wallet className="w-3 h-3 text-slate-500" />
                Toplam Hakediş: <strong className="text-red-600">{(reportData.summary?.totalCombined || reportData.summary?.totalEarnings || 0).toFixed(2)}₺</strong>
              </span>
              <span className="flex items-center gap-1">
                <Banknote className="w-3 h-3 text-green-500" />
                Nakit: <strong className="text-green-600">{(reportData.summary?.totalCash || 0).toFixed(2)}₺</strong>
              </span>
              <span className="flex items-center gap-1">
                <CreditCard className="w-3 h-3 text-green-500" />
                Kredi Kartı: <strong className="text-green-600">{(reportData.summary?.totalCard || 0).toFixed(2)}₺</strong>
              </span>
              {reportData.hasMealCardCollection && (
                <span className="flex items-center gap-1">
                  <UtensilsCrossed className="w-3 h-3 text-green-500" />
                  Yemek Kartı: <strong className="text-green-600">{(reportData.summary?.totalMealCard || 0).toFixed(2)}₺</strong>
                </span>
              )}
              {reportData.summary?.totalModified > 0 && (
                <span className="text-amber-600">Ödeme Değ.: <strong>{reportData.summary.totalModified}</strong></span>
              )}
            </div>

            {/* Search */}
            {reportData.couriers?.length > 0 && (
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Kurye ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
              </div>
            )}

            {/* Empty */}
            {!reportData.couriers?.length && (
              <p className="text-center py-4 text-xs text-muted-foreground">Veri bulunamadı.</p>
            )}

            {/* Table */}
            {filteredCouriers.length > 0 && (
              <div className="border rounded overflow-hidden">
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
