import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Store, Banknote, CreditCard, Wallet, Globe, ShoppingBag, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportDateFilter from "./ReportDateFilter";
import { exportCiroRaporuPDF } from "@/utils/reportPdfExport";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmt = (val) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

function SummaryCard({ icon: Icon, label, value, color = "text-slate-800", isCurrency = true, bold = false }) {
  return (
    <div className="p-2 sm:p-2.5 border rounded-lg" data-testid={`summary-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground mb-0.5">
        <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        {label}
      </div>
      <p className={`text-sm sm:text-base ${bold ? "font-bold" : "font-semibold"} ${color}`}>
        {isCurrency ? `${fmt(value)} TL` : value}
      </p>
    </div>
  );
}

const CellBadge = ({ byCourier }) =>
  byCourier ? (
    <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" title="Kurye tahsilatı" />
  ) : null;

/* Mobil kart görünümü */
function TurnoverCard({ r }) {
  return (
    <div className="border rounded-lg p-2.5 space-y-1.5" data-testid={`turnover-card-${r.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="font-medium text-sm truncate">{r.name}</span>
        </div>
        <span className="text-xs font-bold text-slate-800 flex-shrink-0 ml-2">{fmt(r.total)} TL</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        <span className="text-muted-foreground">Sipariş: <strong className="text-foreground">{r.order_count}</strong></span>
        {r.cash > 0 && (
          <span className="text-muted-foreground">
            Nakit: <strong className={r.cash_by_courier ? "text-blue-700" : "text-slate-700"}>{fmt(r.cash)}<CellBadge byCourier={r.cash_by_courier} /></strong>
          </span>
        )}
        {r.card > 0 && (
          <span className="text-muted-foreground">
            K.Kartı: <strong className={r.card_by_courier ? "text-blue-700" : "text-slate-700"}>{fmt(r.card)}<CellBadge byCourier={r.card_by_courier} /></strong>
          </span>
        )}
        {r.meal_card > 0 && (
          <span className="text-muted-foreground">
            Y.Kartı: <strong className={r.meal_card_by_courier ? "text-blue-700" : "text-slate-700"}>{fmt(r.meal_card)}<CellBadge byCourier={r.meal_card_by_courier} /></strong>
          </span>
        )}
        {r.online > 0 && (
          <span className="text-muted-foreground">Online: <strong className="text-slate-700">{fmt(r.online)}</strong></span>
        )}
      </div>
    </div>
  );
}

export default function CiroRaporu({ companyId, companyLogo, companyName }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const handleGenerate = useCallback(async (start, end) => {
    if (!companyId) return;
    setLoading(true);
    setDateRange({ start, end });
    try {
      const res = await axios.get(`${API}/reports/turnover`, {
        params: { company_id: companyId, start_datetime: start, end_datetime: end },
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return (
    <div className="space-y-3" data-testid="ciro-raporu">
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
              onClick={() => exportCiroRaporuPDF({ data, companyLogo, companyName, dateRange })}
              data-testid="btn-export-ciro-pdf"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </div>
          {/* Özet kartlar */}
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2">
            <SummaryCard icon={ShoppingBag} label="Sipariş" value={data.summary.total_orders} isCurrency={false} />
            <SummaryCard icon={Banknote} label="Nakit" value={data.summary.total_cash} color="text-emerald-700" />
            <SummaryCard icon={CreditCard} label="K.Kartı" value={data.summary.total_card} color="text-blue-700" />
            <SummaryCard icon={Wallet} label="Y.Kartı" value={data.summary.total_meal_card} color="text-orange-700" />
            <SummaryCard icon={Globe} label="Online" value={data.summary.total_online} color="text-purple-700" />
            <SummaryCard icon={Store} label="Toplam" value={data.summary.total_revenue} color="text-slate-900" bold />
          </div>

          {/* Kurye tahsilat bilgisi */}
          {data.summary.courier_total > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <span>Kurye tahsilatı: <strong className="text-slate-700">{fmt(data.summary.courier_total)} TL</strong></span>
            </div>
          )}

          {/* Mobil: Kart görünümü */}
          <div className="sm:hidden space-y-2" data-testid="turnover-cards-mobile">
            {data.restaurants.filter((r) => r.order_count > 0).map((r) => (
              <TurnoverCard key={r.id} r={r} />
            ))}
            {/* Toplam */}
            <div className="border-2 border-slate-300 rounded-lg p-2.5 bg-slate-50" data-testid="turnover-card-total">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">Toplam</span>
                <span className="font-bold text-base text-slate-900">{fmt(data.summary.total_revenue)} TL</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mt-1">
                <span className="text-muted-foreground">Sipariş: <strong>{data.summary.total_orders}</strong></span>
                <span className="text-muted-foreground">Nakit: <strong>{fmt(data.summary.total_cash)}</strong></span>
                <span className="text-muted-foreground">K.Kartı: <strong>{fmt(data.summary.total_card)}</strong></span>
                <span className="text-muted-foreground">Y.Kartı: <strong>{fmt(data.summary.total_meal_card)}</strong></span>
                <span className="text-muted-foreground">Online: <strong>{fmt(data.summary.total_online)}</strong></span>
              </div>
            </div>
          </div>

          {/* Masaüstü: Tablo */}
          <div className="hidden sm:block border rounded-lg overflow-x-auto">
            <table className="w-full text-sm" data-testid="turnover-table">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Restoran</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Sipariş</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Nakit</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Kredi Kartı</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Yemek Kartı</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Online</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.restaurants.filter((r) => r.order_count > 0).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50" data-testid={`turnover-row-${r.id}`}>
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        {r.name}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{r.order_count}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.cash > 0 ? (
                        <span className={r.cash_by_courier ? "text-blue-700 font-medium" : "text-slate-700"}>
                          {fmt(r.cash)}<CellBadge byCourier={r.cash_by_courier} />
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.card > 0 ? (
                        <span className={r.card_by_courier ? "text-blue-700 font-medium" : "text-slate-700"}>
                          {fmt(r.card)}<CellBadge byCourier={r.card_by_courier} />
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.meal_card > 0 ? (
                        <span className={r.meal_card_by_courier ? "text-blue-700 font-medium" : "text-slate-700"}>
                          {fmt(r.meal_card)}<CellBadge byCourier={r.meal_card_by_courier} />
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.online > 0 ? <span className="text-slate-700">{fmt(r.online)}</span> : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">{fmt(r.total)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold border-t-2" data-testid="turnover-row-total">
                  <td className="py-3 px-3 text-slate-800">Toplam</td>
                  <td className="py-3 px-3 text-right text-slate-700">{data.summary.total_orders}</td>
                  <td className="py-3 px-3 text-right text-slate-800">{fmt(data.summary.total_cash)}</td>
                  <td className="py-3 px-3 text-right text-slate-800">{fmt(data.summary.total_card)}</td>
                  <td className="py-3 px-3 text-right text-slate-800">{fmt(data.summary.total_meal_card)}</td>
                  <td className="py-3 px-3 text-right text-slate-800">{fmt(data.summary.total_online)}</td>
                  <td className="py-3 px-3 text-right text-slate-900 text-base">{fmt(data.summary.total_revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.restaurants.filter((r) => r.order_count === 0).length > 0 && (
            <p className="text-xs text-muted-foreground px-1">
              {data.restaurants.filter((r) => r.order_count === 0).length} restoranda bu tarih aralığında sipariş bulunmuyor.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
