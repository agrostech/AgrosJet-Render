import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Store, Banknote, CreditCard, Wallet, Globe, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CiroRaporu({ companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  const getDefaultDateTimes = useCallback((companyData) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const openingTime = companyData?.opening_time || "09:00";
    const closingTime = companyData?.closing_time || "23:00";
    const formatDate = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      start: `${formatDate(today)}T${openingTime}`,
      end: `${formatDate(tomorrow)}T${closingTime}`,
    };
  }, []);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!companyId) return;
      try {
        const res = await axios.get(`${API}/companies/${companyId}`);
        const defaults = getDefaultDateTimes(res.data);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      } catch {
        const defaults = getDefaultDateTimes(null);
        setStartDateTime(defaults.start);
        setEndDateTime(defaults.end);
      }
    };
    fetchCompany();
  }, [companyId, getDefaultDateTimes]);

  const handleGenerate = async () => {
    if (!companyId || !startDateTime || !endDateTime) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reports/turnover`, {
        params: { company_id: companyId, start_datetime: startDateTime, end_datetime: endDateTime },
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (val) =>
    new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

  const CellBadge = ({ byCourier }) =>
    byCourier ? (
      <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" title="Kurye tahsilatı" />
    ) : null;

  return (
    <div className="space-y-3" data-testid="ciro-raporu">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="datetime-local"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="turnover-start-datetime"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="datetime-local"
          value={endDateTime}
          onChange={(e) => setEndDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="turnover-end-datetime"
        />
        <Button size="sm" onClick={handleGenerate} disabled={loading} className="h-8 text-xs" data-testid="turnover-generate-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rapor Oluştur"}
        </Button>
      </div>

      {/* Result */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <SummaryCard icon={ShoppingBag} label="Toplam Sipariş" value={data.summary.total_orders} isCurrency={false} />
            <SummaryCard icon={Banknote} label="Nakit" value={data.summary.total_cash} color="text-emerald-700" />
            <SummaryCard icon={CreditCard} label="Kredi Kartı" value={data.summary.total_card} color="text-blue-700" />
            <SummaryCard icon={Wallet} label="Yemek Kartı" value={data.summary.total_meal_card} color="text-orange-700" />
            <SummaryCard icon={Globe} label="Online" value={data.summary.total_online} color="text-purple-700" />
            <SummaryCard icon={Store} label="Toplam Ciro" value={data.summary.total_revenue} color="text-slate-900" bold />
          </div>

          {/* Courier collection info */}
          {data.summary.courier_total > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              <span>Kurye tahsilatı: <strong className="text-slate-700">{fmt(data.summary.courier_total)} TL</strong></span>
            </div>
          )}

          {/* Table */}
          <div className="border rounded-lg overflow-x-auto">
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
                          {fmt(r.cash)}
                          <CellBadge byCourier={r.cash_by_courier} />
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.card > 0 ? (
                        <span className={r.card_by_courier ? "text-blue-700 font-medium" : "text-slate-700"}>
                          {fmt(r.card)}
                          <CellBadge byCourier={r.card_by_courier} />
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.meal_card > 0 ? (
                        <span className={r.meal_card_by_courier ? "text-blue-700 font-medium" : "text-slate-700"}>
                          {fmt(r.meal_card)}
                          <CellBadge byCourier={r.meal_card_by_courier} />
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.online > 0 ? (
                        <span className="text-slate-700">{fmt(r.online)}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                      {fmt(r.total)}
                    </td>
                  </tr>
                ))}
                {/* Toplam satırı */}
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

          {/* Empty restaurants note */}
          {data.restaurants.filter((r) => r.order_count === 0).length > 0 && (
            <p className="text-xs text-muted-foreground px-1">
              {data.restaurants.filter((r) => r.order_count === 0).length} restoranda bu tarih aralığında sipariş bulunmuyor.
            </p>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Tarih aralığı seçip "Rapor Oluştur" butonuna tıklayın
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color = "text-slate-800", isCurrency = true, bold = false }) {
  const fmt = (val) =>
    new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

  return (
    <div className="p-2.5 border rounded-lg" data-testid={`summary-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <p className={`text-base ${bold ? "font-bold" : "font-semibold"} ${color}`}>
        {isCurrency ? `${fmt(value)} TL` : value}
      </p>
    </div>
  );
}
