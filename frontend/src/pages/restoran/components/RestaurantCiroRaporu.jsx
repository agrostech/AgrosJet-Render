import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Search, TrendingUp, List, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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

function CiroCell({ value, orders, label }) {
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
                data-testid={`ciro-list-${label}`}
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

export default function RestaurantCiroRaporu({ restaurantId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [initialized, setInitialized] = useState(false);
  
  const [companySettings, setCompanySettings] = useState({ opening_time: "09:00", closing_time: "23:00" });
  
  const getDefaultDates = useCallback((settings) => {
    const s = settings || { opening_time: "09:00", closing_time: "23:00" };
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const openingTime = s.opening_time || "09:00";
    const closingTime = s.closing_time || "23:00";
    
    const startDateTime = `${today.toISOString().split('T')[0]}T${openingTime}`;
    const endDateTime = `${tomorrow.toISOString().split('T')[0]}T${closingTime}`;
    
    return { startDateTime, endDateTime };
  }, []);
  
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");

  const formatDateTurkey = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    return `${dateTimeStr}:00+03:00`;
  };

  const fetchData = useCallback(async (params = {}) => {
    const start = params.startDateTime || startDateTime;
    const end = params.endDateTime || endDateTime;
    
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
  }, [restaurantId, startDateTime, endDateTime]);

  useEffect(() => {
    const initData = async () => {
      if (!companyId || !restaurantId) return;
      
      try {
        const companyRes = await axios.get(`${API}/companies/${companyId}`);
        const company = companyRes.data;
        
        const settings = {
          opening_time: company?.opening_time || "09:00",
          closing_time: company?.closing_time || "23:00"
        };
        setCompanySettings(settings);
        
        const defaults = getDefaultDates(settings);
        setStartDateTime(defaults.startDateTime);
        setEndDateTime(defaults.endDateTime);
        
        setLoading(true);
        try {
          const res = await axios.post(`${API}/restoran-mutabakat/ciro/restaurant/${restaurantId}`, {
            start_datetime: formatDateTurkey(defaults.startDateTime),
            end_datetime: formatDateTurkey(defaults.endDateTime)
          });
          setData(res.data);
        } catch (err) {
          console.error("Ciro verisi alınamadı:", err);
          setData(null);
        } finally {
          setLoading(false);
        }
        
        setInitialized(true);
      } catch (err) {
        console.error("Şirket ayarları alınamadı:", err);
      }
    };
    
    if (!initialized) {
      initData();
    }
  }, [companyId, restaurantId, initialized, getDefaultDates]);

  const handleFilter = () => {
    fetchData();
  };

  return (
    <div className="space-y-4" data-testid="restaurant-ciro-raporu">
      {/* Compact Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input 
                type="datetime-local" 
                value={startDateTime} 
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Bitiş</Label>
              <Input 
                type="datetime-local" 
                value={endDateTime} 
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Button 
                onClick={handleFilter} 
                disabled={loading}
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Filtrele
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Sonuçlar */}
      {!loading && data && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
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
                    <td className="p-3 text-center font-medium">{data.order_count || 0}</td>
                    <CiroCell value={data.cash_total} orders={data.cash_orders} label="Nakit Ciro" />
                    <CiroCell value={data.card_total} orders={data.card_orders} label="Kredi Kartı Ciro" />
                    <CiroCell value={data.meal_card_total} orders={data.meal_card_orders} label="Yemek Kartı Ciro" />
                    <CiroCell value={data.online_meal_card_total} orders={data.online_meal_card_orders} label="Online Yemek Kartı Ciro" />
                    <CiroCell value={data.online_total} orders={data.online_orders} label="Online Kredi Kartı Ciro" />
                    <td className="p-3 text-right font-bold text-green-600">{formatMoney(data.total_ciro)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* İlk yükleme */}
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
