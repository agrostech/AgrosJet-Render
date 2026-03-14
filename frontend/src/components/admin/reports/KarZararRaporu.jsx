import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  TrendingUp, TrendingDown, Truck, CreditCard, Minus, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KarZararRaporu({ companyId }) {
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
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return {
      start: `${formatDate(today)}T${openingTime}`,
      end: `${formatDate(tomorrow)}T${closingTime}`
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
      const res = await axios.get(`${API}/reports/profit-loss`, {
        params: { company_id: companyId, start_datetime: startDateTime, end_datetime: endDateTime }
      });
      setData(res.data);
    } catch {
      toast.error("Rapor yüklenemedi");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

  const profit = data ? data.total_revenue - data.total_expense : 0;

  return (
    <div className="space-y-3" data-testid="kar-zarar-raporu">
      {/* Filters - same as Restoran Raporları */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input
          type="datetime-local"
          value={startDateTime}
          onChange={(e) => setStartDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="profit-start-datetime"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="datetime-local"
          value={endDateTime}
          onChange={(e) => setEndDateTime(e.target.value)}
          className="h-8 w-auto text-xs"
          data-testid="profit-end-datetime"
        />
        <Button size="sm" onClick={handleGenerate} disabled={loading} className="h-8 text-xs" data-testid="profit-generate-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rapor Oluştur"}
        </Button>
      </div>

      {/* Result */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : data ? (
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
              <tr className="hover:bg-slate-50" data-testid="row-revenue">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-slate-500" />
                    <span className="font-medium">Taşıma Ücreti (Gelir)</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">{data.order_count} sipariş</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-800">{formatCurrency(data.total_revenue)} TL</td>
              </tr>
              <tr className="hover:bg-slate-50" data-testid="row-expense">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-500" />
                    <span className="font-medium">Kurye Hakediş (Gider)</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">{data.hakedis_count} işlem</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-800">{formatCurrency(data.total_expense)} TL</td>
              </tr>
              <tr className={`${profit >= 0 ? "bg-emerald-50/50" : "bg-red-50/50"}`} data-testid="row-profit">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {profit > 0 ? <TrendingUp className="w-4 h-4 text-emerald-600" /> :
                     profit < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
                     <Minus className="w-4 h-4 text-slate-500" />}
                    <span className="font-bold">Kar / Zarar</span>
                  </div>
                </td>
                <td className="py-3 px-4"></td>
                <td className={`py-3 px-4 text-right font-bold text-lg ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {profit >= 0 ? "+" : ""}{formatCurrency(profit)} TL
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Tarih aralığı seçip "Rapor Oluştur" butonuna tıklayın
        </div>
      )}
    </div>
  );
}
