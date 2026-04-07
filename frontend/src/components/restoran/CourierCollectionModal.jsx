import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Banknote,
  CreditCard,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatMoney = (amount) =>
  new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + " TL";

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDateStr(date) {
  return new Date(date).toISOString().split("T")[0];
}

const DAY_NAMES_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function CourierCollectionModal({ open, onOpenChange, restaurantId }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => formatDateStr(new Date()));
  const [weekStatus, setWeekStatus] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState({});

  const weekDates = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dates.push({
        date: formatDateStr(d),
        dayName: DAY_NAMES_SHORT[i],
        dayNum: d.getDate(),
      });
    }
    return dates;
  }, [weekStart]);

  const fetchWeekStatus = useCallback(async () => {
    if (!restaurantId || !open) return;
    try {
      const res = await axios.get(
        `${API}/restaurant-collections/${restaurantId}/week-status?week_start=${formatDateStr(weekStart)}`
      );
      setWeekStatus(res.data.days || []);
    } catch { /* silent */ }
  }, [restaurantId, weekStart, open]);

  const fetchBalances = useCallback(async () => {
    if (!restaurantId || !selectedDate || !open) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/restaurant-collections/${restaurantId}/courier-balances?date=${selectedDate}`
      );
      setCouriers(res.data.couriers || []);
    } catch {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedDate, open]);

  useEffect(() => { if (open) fetchWeekStatus(); }, [fetchWeekStatus, open]);
  useEffect(() => { if (open) fetchBalances(); }, [fetchBalances, open]);

  const handleCollectOrder = async (orderId, courierId) => {
    setSubmitting((p) => ({ ...p, [orderId]: true }));
    try {
      const res = await axios.post(
        `${API}/restaurant-collections/${restaurantId}/collect`,
        { order_id: orderId, courier_id: courierId, date: selectedDate }
      );
      if (res.data.success) {
        toast.success(res.data.message);
        fetchBalances();
        fetchWeekStatus();
      } else {
        toast.error(res.data.error || "Hata");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Tahsilat kaydedilemedi");
    } finally {
      setSubmitting((p) => ({ ...p, [orderId]: false }));
    }
  };

  const weekLabel = useMemo(() => {
    const s = new Date(weekStart);
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} - ${e.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [weekStart]);

  const getStatusForDate = (dateStr) =>
    weekStatus.find((d) => d.date === dateStr) || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="courier-collection-modal">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Kurye Hesap Al</DialogTitle>
        </DialogHeader>

        {/* Hafta Seçici */}
        <div className="flex items-center justify-between mb-1" data-testid="week-selector">
          <Button variant="ghost" size="icon" onClick={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d);
          }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-slate-700">{weekLabel}</span>
          <Button variant="ghost" size="icon" onClick={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d);
          }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Gün Seçici */}
        <div className="grid grid-cols-7 gap-1 mb-4" data-testid="day-selector">
          {weekDates.map((wd) => {
            const status = getStatusForDate(wd.date);
            const isSelected = wd.date === selectedDate;
            return (
              <button
                key={wd.date}
                onClick={() => setSelectedDate(wd.date)}
                className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs font-medium transition-all border ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent hover:bg-slate-100 text-slate-600"
                }`}
                data-testid={`day-btn-${wd.date}`}
              >
                <span className="text-[10px] uppercase">{wd.dayName}</span>
                <span className="text-sm font-bold">{wd.dayNum}</span>
                {status.has_orders && status.all_completed && (
                  <Check className="w-3.5 h-3.5 text-green-500 mt-0.5" />
                )}
                {status.has_orders && !status.all_completed && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Kurye Listesi */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : couriers.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground" data-testid="no-couriers">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Bu tarihte tahsilat bekleyen kurye yok</p>
          </div>
        ) : (
          <div className="space-y-3" data-testid="courier-list">
            {couriers.map((c) => (
              <div
                key={c.courier_id}
                className={`border rounded-xl p-3 transition-all ${
                  c.all_collected ? "bg-green-50/50 border-green-200" : "bg-white"
                }`}
                data-testid={`courier-row-${c.courier_id}`}
              >
                {/* Kurye Başlık */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      c.all_collected ? "bg-green-100" : "bg-slate-100"
                    }`}>
                      {c.all_collected
                        ? <Check className="w-4 h-4 text-green-600" />
                        : <User className="w-4 h-4 text-slate-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.courier_name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.order_count} paket</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {c.cash_total > 0 && (
                        <div className="flex items-center gap-1 text-xs">
                          <Banknote className="w-3.5 h-3.5 text-green-600" />
                          <span className="font-semibold text-green-700">{formatMoney(c.cash_total)}</span>
                        </div>
                      )}
                      {c.card_total > 0 && (
                        <div className="flex items-center gap-1 text-xs">
                          <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-semibold text-blue-700">{formatMoney(c.card_total)}</span>
                        </div>
                      )}
                    </div>
                    {c.all_collected && (
                      <span className="text-xs font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                        Tümü Alındı
                      </span>
                    )}
                  </div>
                </div>

                {/* Sipariş Listesi */}
                <div className="border-t pt-2 space-y-1">
                  {c.orders.map((order) => (
                    <div
                      key={order.id}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs ${
                        order.is_collected
                          ? "bg-green-50 text-slate-400"
                          : "bg-slate-50 text-slate-700"
                      }`}
                      data-testid={`order-row-${order.id}`}
                    >
                      {/* Sol: Müşteri adı + adres */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {order.payment_method === "cash"
                          ? <Banknote className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          : <CreditCard className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        <span className="truncate">
                          <span className="font-medium">{order.customer_name || "Müşteri"}</span>
                          {order.address && (
                            <span className="text-slate-400 ml-1.5">— {order.address}</span>
                          )}
                        </span>
                      </div>

                      {/* Sağ: Tutar + Al/Alındı */}
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-semibold">{formatMoney(order.total_amount)}</span>
                        {order.is_collected ? (
                          <span className="text-green-600 flex items-center gap-0.5">
                            <Check className="w-3.5 h-3.5" /> Alındı
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            disabled={submitting[order.id]}
                            onClick={() => handleCollectOrder(order.id, c.courier_id)}
                            data-testid={`collect-btn-${order.id}`}
                          >
                            {submitting[order.id]
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : "Al"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
