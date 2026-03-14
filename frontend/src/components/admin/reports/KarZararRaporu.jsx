import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  TrendingUp, TrendingDown, Truck, Minus, Loader2,
  Users, Briefcase, Package, FileDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportDateFilter from "./ReportDateFilter";
import { exportKarZararRaporuPDF } from "@/utils/reportPdfExport";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KarZararRaporu({ companyId, companyLogo, companyName }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setDateRange({ start, end });
    try {
      const res = await axios.get(`${API}/reports/profit-loss`, {
        params: { company_id: companyId, start_datetime: start, end_datetime: end }
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fmt = (val) =>
    new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  return (
    <div className="space-y-3" data-testid="kar-zarar-raporu">
      <ReportDateFilter companyId={companyId} onGenerate={handleGenerate} loading={loading} />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-3 sm:space-y-4">
          {/* PDF butonu */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => exportKarZararRaporuPDF({ data, companyLogo, companyName, dateRange, companyId })}
              data-testid="btn-export-karzarar-pdf"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </div>
          {/* Mobil: Kart görünümü */}
          <div className="sm:hidden space-y-2">
            {/* Gelir */}
            <div className="border rounded-lg p-3" data-testid="mobile-row-revenue">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-sm">Taşıma Ücreti (Gelir)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{data.order_count} sipariş</span>
                <span className="font-semibold text-slate-800">{fmt(data.total_revenue)} TL</span>
              </div>
            </div>
            {/* Kurye Gider */}
            <div className="border rounded-lg p-3" data-testid="mobile-row-courier">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-sm">Kurye Hakediş (Gider)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{data.courier_order_count} sipariş</span>
                <span className="font-semibold text-slate-800">{fmt(data.courier_expense)} TL</span>
              </div>
            </div>
            {/* Yönetici Gider */}
            <div className="border rounded-lg p-3" data-testid="mobile-row-admin">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-sm">Yönetici Hakediş (Gider)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{data.admin_order_count} sipariş</span>
                <span className="font-semibold text-slate-800">{fmt(data.admin_expense)} TL</span>
              </div>
            </div>
            {/* Kar/Zarar */}
            <div className={`border-2 rounded-lg p-3 ${data.profit >= 0 ? "border-emerald-300 bg-emerald-50/50" : "border-red-300 bg-red-50/50"}`} data-testid="mobile-row-profit">
              <div className="flex items-center gap-2 mb-1">
                {data.profit > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                 data.profit < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
                 <Minus className="w-4 h-4 text-slate-500" />}
                <span className="font-bold text-sm">Kar / Zarar</span>
              </div>
              <p className={`text-right font-bold text-lg ${data.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {data.profit >= 0 ? "+" : ""}{fmt(data.profit)} TL
              </p>
            </div>
          </div>

          {/* Masaüstü: Tablo */}
          <div className="hidden sm:block border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600">Kalem</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-600">Adet</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-600">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50" data-testid="row-revenue">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">Taşıma Ücreti (Gelir)</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{data.order_count} sipariş</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">{fmt(data.total_revenue)} TL</td>
                </tr>
                <tr className="hover:bg-slate-50" data-testid="row-courier-expense">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">Kurye Hakediş (Gider)</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{data.courier_order_count} sipariş</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">{fmt(data.courier_expense)} TL</td>
                </tr>
                <tr className="hover:bg-slate-50" data-testid="row-admin-expense">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-500" />
                      <span className="font-medium">Yönetici Hakediş (Gider)</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-muted-foreground">{data.admin_order_count} sipariş</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">{fmt(data.admin_expense)} TL</td>
                </tr>
                <tr className={`${data.profit >= 0 ? "bg-emerald-50/50" : "bg-red-50/50"}`} data-testid="row-profit">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {data.profit > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                       data.profit < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
                       <Minus className="w-4 h-4 text-slate-500" />}
                      <span className="font-bold">Kar / Zarar</span>
                    </div>
                  </td>
                  <td className="py-3 px-4"></td>
                  <td className={`py-3 px-4 text-right font-bold text-lg ${data.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {data.profit >= 0 ? "+" : ""}{fmt(data.profit)} TL
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Ortalamalar */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 border rounded-lg" data-testid="avg-revenue-per-order">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">
                <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="truncate">Ort. Kazanç</span>
              </div>
              <p className="text-sm sm:text-lg font-bold text-slate-800">
                {fmt(data.avg_revenue_per_order)} TL
              </p>
            </div>
            <div className="p-2 sm:p-3 border rounded-lg" data-testid="avg-cost-per-order">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">
                <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="truncate">Ort. Maliyet</span>
              </div>
              <p className="text-sm sm:text-lg font-bold text-slate-800">
                {fmt(data.avg_cost_per_order)} TL
              </p>
            </div>
            <div className="p-2 sm:p-3 border rounded-lg" data-testid="avg-profit-per-order">
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground mb-0.5 sm:mb-1">
                <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span className="truncate">Ort. Kar</span>
              </div>
              <p className={`text-sm sm:text-lg font-bold ${data.avg_profit_per_order >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {data.avg_profit_per_order >= 0 ? "+" : ""}{fmt(data.avg_profit_per_order)} TL
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
