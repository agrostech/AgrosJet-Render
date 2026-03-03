import { useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Package, FileText, Info } from "lucide-react";
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
      <RaporFiltre companyId={companyId} onFilter={handleFilter} loading={loading} defaultPreset="bu_hafta" />

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
                    <th className="p-3 font-medium text-right">Taşıma Ücreti</th>
                    <th className="p-3 font-medium text-right">Taşıma Ücreti Kdv</th>
                    <th className="p-3 font-medium text-right">Toplam Taşıma Ücreti</th>
                    <th className="p-3 font-medium text-right">Pos Komisyonu</th>
                    <th className="p-3 font-medium text-right">Nakit Tahsilat</th>
                    <th className="p-3 font-medium text-right">Kredi Kartı Tahsilat</th>
                    <th className="p-3 font-medium text-right">Yemek Kartı Tahsilat</th>
                    <th className="p-3 font-medium text-right">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-center font-medium">{data.order_count || 0}</td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center">{formatMoney(data.delivery_fee || 0)}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center">{formatMoney(data.delivery_vat || 0)}</div>
                    </td>
                    <td className="p-3 text-right font-medium text-red-600">
                      <div className="inline-flex items-center">{formatMoney(data.total_delivery || 0)}</div>
                    </td>
                    <td className="p-3 text-right text-red-600">
                      <div className="inline-flex items-center">{formatMoney(data.pos_commission || 0)}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className={`inline-flex items-center font-medium ${data.cash_included ? 'text-green-600' : 'text-slate-900'}`}>
                        {formatMoney(data.cash_amount || 0)}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className={`inline-flex items-center font-medium ${data.card_included ? 'text-green-600' : 'text-slate-900'}`}>
                        {formatMoney((data.card_amount || 0) + (data.online_amount || 0))}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className={`inline-flex items-center font-medium ${data.meal_card_included ? 'text-green-600' : 'text-slate-900'}`}>
                        {formatMoney(data.meal_card_amount || 0)}
                      </div>
                    </td>
                    <td className="p-3 text-right font-bold">
                      <div className={`inline-flex items-center ${(data.net_amount || 0) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMoney(data.net_amount || 0)}
                      </div>
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

      {/* Bilgi Kutucuğu */}
      <Card className="border-slate-200 bg-slate-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <p className="font-medium text-slate-700 mb-1">Tahsilat Renk Göstergeleri</p>
                <p className="text-slate-500 text-xs mb-2">Nakit, Kredi Kartı ve Yemek Kartı sütunları için geçerlidir.</p>
                <ul className="space-y-1 ml-1">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span><span className="text-green-600 font-medium">Yeşil</span> — Kurye şirketi tarafından tahsil edilmiş, mütabakat hesaplamasına dahildir.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-800"></span>
                    <span><span className="text-slate-800 font-medium">Siyah</span> — Restoran tarafından tahsil edilmiş, mütabakat hesaplamasına dahil değildir.</span>
                  </li>
                </ul>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <p className="text-slate-500">
                  <span className="font-medium text-slate-600">Not:</span> Restoran teslimatı olarak işaretlenen siparişler bu rapora dahil edilmez. 
                  Tüm siparişlerinizi ve doğru ciro bilgisini görmek için <span className="font-medium">Ciro Raporları</span> sekmesini inceleyiniz.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
