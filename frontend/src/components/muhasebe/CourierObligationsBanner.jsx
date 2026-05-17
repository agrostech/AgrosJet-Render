/**
 * Kurye için Fatura Yükümlülüğü Kompakt Rozeti
 *
 * Muhasebe → Kuryeler ekranında bakiye satırının yanında küçük bir pill
 * olarak görünür. Kaba banner yerine sade bir info chip.
 *
 * Eğer obligation yoksa hiçbir şey render etmez.
 */
import { useState, useEffect } from "react";
import axios from "axios";
import { FileText } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (n) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + " TL";

export default function CourierObligationsBanner({ courierId }) {
  const [data, setData] = useState({ count: 0, total_expected: 0 });

  useEffect(() => {
    let cancelled = false;
    if (!courierId) {
      setData({ count: 0, total_expected: 0 });
      return;
    }
    (async () => {
      try {
        const res = await axios.get(`${API}/courier-invoice-obligations/courier/${courierId}/summary`);
        if (!cancelled) {
          setData({
            count: res.data.count || 0,
            total_expected: res.data.total_expected || 0,
          });
        }
      } catch {
        if (!cancelled) setData({ count: 0, total_expected: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courierId]);

  if (!courierId || data.count === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 border border-amber-200"
      data-testid="courier-obligations-banner"
      title={`${data.count} bekleyen/yüklenen fatura yükümlülüğü — Toplam ${formatMoney(data.total_expected)}`}
    >
      <FileText className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
      <span className="text-[11px] font-medium text-amber-700">
        {data.count} fatura
      </span>
      <span className="text-[11px] font-bold text-amber-700 tabular-nums">
        {formatMoney(data.total_expected)}
      </span>
    </div>
  );
}
