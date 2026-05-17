/**
 * Kurye için Fatura Yükümlülüğü Uyarı Banner'ı
 *
 * Muhasebe → Kuryeler ekranında seçili kuryenin pending+uploaded fatura
 * yükümlülüklerini özetler.
 */
import { useState, useEffect } from "react";
import axios from "axios";
import { AlertTriangle } from "lucide-react";

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
        if (!cancelled) setData({ count: res.data.count || 0, total_expected: res.data.total_expected || 0 });
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
      className="mx-3 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2"
      data-testid="courier-obligations-banner"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="text-xs sm:text-sm text-amber-700">
        <span className="font-medium">{data.count} bekleyen/yüklenen fatura yükümlülüğü</span>
        <span className="text-amber-600"> • Toplam: {formatMoney(data.total_expected)}</span>
      </span>
    </div>
  );
}
