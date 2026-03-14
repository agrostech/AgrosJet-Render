import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  TrendingUp, TrendingDown, Truck, Minus, Loader2,
  Users, Briefcase, Package
} from "lucide-react";
import ReportDateFilter from "./ReportDateFilter";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KarZararRaporu({ companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
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

      {/* Result */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600">Kalem</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-600">Adet</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-600">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Gelir */}
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

                {/* Kurye Hakediş */}
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

                {/* Yönetici Hakediş */}
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

                {/* Kar / Zarar */}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 border rounded-lg" data-testid="avg-revenue-per-order">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Package className="w-3.5 h-3.5" />
                Ort. Paket Başı Kazanç
              </div>
              <p className="text-lg font-bold text-slate-800">
                {fmt(data.avg_revenue_per_order)} TL
              </p>
            </div>
            <div className="p-3 border rounded-lg" data-testid="avg-cost-per-order">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Users className="w-3.5 h-3.5" />
                Ort. Paket Başı Maliyet
              </div>
              <p className="text-lg font-bold text-slate-800">
                {fmt(data.avg_cost_per_order)} TL
              </p>
            </div>
            <div className="p-3 border rounded-lg" data-testid="avg-profit-per-order">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Ort. Paket Başı Kar
              </div>
              <p className={`text-lg font-bold ${data.avg_profit_per_order >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {data.avg_profit_per_order >= 0 ? "+" : ""}{fmt(data.avg_profit_per_order)} TL
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
