import { useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, TrendingUp, List, X } from "lucide-react";
import RaporFiltre from "./RaporFiltre";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORMS = [
  { key: "yemeksepeti", label: "Yemeksepeti", color: "text-pink-600", bg: "bg-pink-50" },
  { key: "trendyol", label: "Trendyol", color: "text-orange-600", bg: "bg-orange-50" },
  { key: "getir", label: "Getir", color: "text-violet-600", bg: "bg-violet-50" },
  { key: "migros", label: "Migros", color: "text-amber-600", bg: "bg-amber-50" },
  { key: "phone", label: "Telefon", color: "text-sky-600", bg: "bg-sky-50" },
];

function formatMoney(val) {
  if (val === null || val === undefined) return "0,00 ₺";
  return val.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function OrderListModal({ title, orders, onClose }) {
  if (!orders) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-slate-900">{title} ({orders.length})</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted" data-testid="ciro-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sipariş bulunamadı</p>
          ) : (
            <div className="space-y-0.5">
              {orders.map((o, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-muted/40 text-xs">
                  <span className="text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                  <span className="font-medium min-w-[100px] shrink-0">{o.customer_name}</span>
                  <span className="text-muted-foreground truncate flex-1">{o.delivery_address}</span>
                  <span className="shrink-0 text-muted-foreground">{o.date}</span>
                  <span className="shrink-0 text-muted-foreground">{o.payment_method}</span>
                  <span className="font-medium shrink-0 min-w-[70px] text-right">{formatMoney(o.total_amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CiroCell({ value, orders, label, testKey }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <td className="p-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          {formatMoney(value)}
          {orders && orders.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">({orders.length})</span>
              <button
                onClick={() => setOpen(true)}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`ciro-list-${testKey}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
      {open && <OrderListModal title={label} orders={orders} onClose={() => setOpen(false)} />}
    </>
  );
}

function CiroTable({ title, bucket, badgeColor, badgeBg, testId }) {
  if (!bucket) return null;
  const isEmpty = (bucket.order_count || 0) === 0;
  return (
    <Card data-testid={testId}>
      <div className={`px-4 py-2.5 border-b flex items-center justify-between ${badgeBg || "bg-slate-50"}`}>
        <h3 className={`text-sm font-semibold ${badgeColor || "text-slate-800"}`}>{title}</h3>
        <span className="text-xs text-slate-600">{bucket.order_count || 0} sipariş</span>
      </div>
      <CardContent className="p-0">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-6">Bu platform için sipariş bulunamadı</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="p-3 font-medium text-center">Sipariş</th>
                  <th className="p-3 font-medium text-right">Nakit Ciro</th>
                  <th className="p-3 font-medium text-right">Kredi Kartı Ciro</th>
                  <th className="p-3 font-medium text-right">Yemek Kartı Ciro</th>
                  <th className="p-3 font-medium text-right">Online Yemek Kartı Ciro</th>
                  <th className="p-3 font-medium text-right">Online Kredi Kartı Ciro</th>
                  <th className="p-3 font-medium text-right">Toplam Ciro</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 text-center font-medium">{bucket.order_count || 0}</td>
                  <CiroCell value={bucket.cash_total} orders={bucket.cash_orders} label={`${title} - Nakit`} testKey={`${testId}-cash`} />
                  <CiroCell value={bucket.card_total} orders={bucket.card_orders} label={`${title} - Kredi Kartı`} testKey={`${testId}-card`} />
                  <CiroCell value={bucket.meal_card_total} orders={bucket.meal_card_orders} label={`${title} - Yemek Kartı`} testKey={`${testId}-mealcard`} />
                  <CiroCell value={bucket.online_meal_card_total} orders={bucket.online_meal_card_orders} label={`${title} - Online Yemek Kartı`} testKey={`${testId}-online-mealcard`} />
                  <CiroCell value={bucket.online_total} orders={bucket.online_orders} label={`${title} - Online Kredi Kartı`} testKey={`${testId}-online-card`} />
                  <td className="p-3 text-right font-bold text-green-600">{formatMoney(bucket.total_ciro)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RestaurantCiroRaporu({ restaurantId, companyId }) {
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
      const res = await axios.post(`${API}/restoran-mutabakat/ciro/restaurant/${restaurantId}`, {
        start_datetime: formatDateTurkey(start),
        end_datetime: formatDateTurkey(end)
      });
      setData(res.data);
    } catch (err) {
      console.error("Ciro verisi alınamadı:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  return (
    <div className="space-y-4" data-testid="restaurant-ciro-raporu">
      <RaporFiltre companyId={companyId} onFilter={handleFilter} loading={loading} />

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {!loading && data && (
        <div className="space-y-4">
          <CiroTable
            title="Toplam Ciro"
            bucket={{
              order_count: data.order_count,
              cash_total: data.cash_total,
              card_total: data.card_total,
              meal_card_total: data.meal_card_total,
              online_total: data.online_total,
              online_meal_card_total: data.online_meal_card_total,
              total_ciro: data.total_ciro,
              cash_orders: data.cash_orders,
              card_orders: data.card_orders,
              meal_card_orders: data.meal_card_orders,
              online_orders: data.online_orders,
              online_meal_card_orders: data.online_meal_card_orders,
            }}
            badgeColor="text-emerald-700"
            badgeBg="bg-emerald-50"
            testId="ciro-toplam"
          />

          {PLATFORMS.map((p) => (
            <CiroTable
              key={p.key}
              title={p.label}
              bucket={data.by_platform?.[p.key]}
              badgeColor={p.color}
              badgeBg={p.bg}
              testId={`ciro-${p.key}`}
            />
          ))}
        </div>
      )}

      {!loading && !data && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Tarih aralığı seçip "Filtrele" butonuna tıklayın</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
