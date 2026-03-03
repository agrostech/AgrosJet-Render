import { useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Package, FileText } from "lucide-react";
import RaporFiltre from "./RaporFiltre";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatMoney(val) {
  if (val === null || val === undefined) return "0,00 ₺";
  return val.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

export default function RestaurantMutabakatRaporu({ restaurantId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const formatDateTurkey = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    return `${dateTimeStr}:00+03:00`;
  };

  const handleFilter = useCallback(async (start, end) => {
    if (!start || !end || !restaurantId) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/restoran-mutabakat/restaurant/${restaurantId}`, {
        start_datetime: formatDateTurkey(start),
        end_datetime: formatDateTurkey(end)
      });
      setData(res.data);
    } catch (err) {
      console.error("Mütabakat verisi alınamadı:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  return (
    <div className="space-y-4" data-testid="restaurant-mutabakat-raporu">
      <RaporFiltre companyId={companyId} onFilter={handleFilter} loading={loading} />

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {!loading && data && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 font-medium text-center">Sipariş</th>
                    <th className="p-3 font-medium text-right">Taşıma</th>
                    <th className="p-3 font-medium text-right">KDV</th>
                    <th className="p-3 font-medium text-right">Top. Taşıma</th>
                    <th className="p-3 font-medium text-right">POS Kom.</th>
                    <th className="p-3 font-medium text-right">Nakit</th>
                    <th className="p-3 font-medium text-right">Kart</th>
                    <th className="p-3 font-medium text-right">Y.Kartı</th>
                    <th className="p-3 font-medium text-right">Net Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-center font-medium">{data.order_count || 0}</td>
                    <td className="p-3 text-right">
                      {formatMoney(data.delivery_fee || 0)}
                    </td>
                    <td className="p-3 text-right">
                      {formatMoney(data.delivery_vat || 0)}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatMoney(data.total_delivery || 0)}
                    </td>
                    <td className="p-3 text-right text-red-600">
                      {formatMoney(data.pos_commission || 0)}
                    </td>
                    <td className={`p-3 text-right ${(data.cash_amount || 0) > 0 ? 'text-green-600 font-medium' : ''}`}>
                      {formatMoney(data.cash_amount || 0)}
                    </td>
                    <td className={`p-3 text-right ${((data.card_amount || 0) + (data.online_amount || 0)) > 0 ? 'text-blue-600 font-medium' : ''}`}>
                      {formatMoney((data.card_amount || 0) + (data.online_amount || 0))}
                    </td>
                    <td className={`p-3 text-right ${(data.meal_card_amount || 0) > 0 ? 'text-purple-600 font-medium' : ''}`}>
                      {formatMoney(data.meal_card_amount || 0)}
                    </td>
                    <td className="p-3 text-right text-green-600 font-bold">
                      {formatMoney(data.net_amount || 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Tarih aralığı seçip "Filtrele" butonuna tıklayın</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
