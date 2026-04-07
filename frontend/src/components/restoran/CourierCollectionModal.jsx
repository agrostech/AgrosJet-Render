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
import { Input } from "@/components/ui/input";
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
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

const DAY_NAMES_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default function CourierCollectionModal({ open, onOpenChange, restaurantId }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => formatDateStr(new Date()));
  const [weekStatus, setWeekStatus] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const [inputs, setInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [collectionFlags, setCollectionFlags] = useState({});

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
    setWeekLoading(true);
    try {
      const res = await axios.get(
        `${API}/restaurant-collections/${restaurantId}/week-status?week_start=${formatDateStr(weekStart)}`
      );
      setWeekStatus(res.data.days || []);
    } catch {
      // silent
    } finally {
      setWeekLoading(false);
    }
  }, [restaurantId, weekStart, open]);

  const fetchBalances = useCallback(async () => {
    if (!restaurantId || !selectedDate || !open) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/restaurant-collections/${restaurantId}/courier-balances?date=${selectedDate}`
      );
      setCouriers(res.data.couriers || []);
      setCollectionFlags({
        cash: res.data.cash_by_restaurant,
        card: res.data.card_by_restaurant,
      });
      setInputs({});
    } catch {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedDate, open]);

  useEffect(() => {
    if (open) fetchWeekStatus();
  }, [fetchWeekStatus, open]);

  useEffect(() => {
    if (open) fetchBalances();
  }, [fetchBalances, open]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const handleCollect = async (courierId, paymentType) => {
    const key = `${courierId}_${paymentType}`;
    const amount = parseFloat(inputs[key]);
    if (!amount || amount <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }

    const courier = couriers.find((c) => c.courier_id === courierId);
    const maxBalance = paymentType === "cash" ? courier?.cash_balance : courier?.card_balance;
    if (amount > maxBalance) {
      toast.error(`Maksimum ${formatMoney(maxBalance)} tahsil edebilirsiniz`);
      return;
    }

    setSubmitting((p) => ({ ...p, [key]: true }));
    try {
      const res = await axios.post(
        `${API}/restaurant-collections/${restaurantId}/collect`,
        {
          courier_id: courierId,
          amount,
          payment_type: paymentType,
          date: selectedDate,
        }
      );
      toast.success(res.data.message);
      setInputs((p) => ({ ...p, [key]: "" }));
      fetchBalances();
      fetchWeekStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Tahsilat kaydedilemedi");
    } finally {
      setSubmitting((p) => ({ ...p, [key]: false }));
    }
  };

  const weekLabel = useMemo(() => {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}`;
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
          <Button variant="ghost" size="icon" onClick={prevWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-slate-700">{weekLabel}</span>
          <Button variant="ghost" size="icon" onClick={nextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Gün Seçici */}
        <div className="grid grid-cols-7 gap-1 mb-4" data-testid="day-selector">
          {weekDates.map((wd) => {
            const status = getStatusForDate(wd.date);
            const isSelected = wd.date === selectedDate;
            const isCompleted = status.all_completed;
            const hasOrders = status.has_orders;

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
                {hasOrders && isCompleted && (
                  <Check className="w-3.5 h-3.5 text-green-500 mt-0.5" />
                )}
                {hasOrders && !isCompleted && (
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
                  c.is_completed ? "bg-green-50/50 border-green-200" : "bg-white"
                }`}
                data-testid={`courier-row-${c.courier_id}`}
              >
                {/* Kurye Bilgisi */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      c.is_completed ? "bg-green-100" : "bg-slate-100"
                    }`}>
                      {c.is_completed ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <User className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.courier_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.order_count} paket
                      </p>
                    </div>
                  </div>
                  {c.is_completed && (
                    <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full" data-testid="completed-badge">
                      Alındı
                    </span>
                  )}
                </div>

                {!c.is_completed && (
                  <div className="space-y-2">
                    {/* Nakit Satırı */}
                    {collectionFlags.cash && c.cash_total > 0 && (
                      <div className="flex items-center gap-2" data-testid={`cash-row-${c.courier_id}`}>
                        <div className="flex items-center gap-1.5 min-w-[100px]">
                          <Banknote className="w-4 h-4 text-green-600" />
                          <div>
                            <span className="text-[11px] text-muted-foreground block leading-none">Nakit</span>
                            <span className="text-xs font-bold text-green-700">{formatMoney(c.cash_balance)}</span>
                          </div>
                        </div>
                        {c.cash_balance > 0 ? (
                          <>
                            <Input
                              type="number"
                              placeholder="Tutar"
                              className="h-8 text-xs flex-1"
                              value={inputs[`${c.courier_id}_cash`] || ""}
                              onChange={(e) =>
                                setInputs((p) => ({
                                  ...p,
                                  [`${c.courier_id}_cash`]: e.target.value,
                                }))
                              }
                              max={c.cash_balance}
                              data-testid={`cash-input-${c.courier_id}`}
                            />
                            <Button
                              size="sm"
                              className="h-8 text-xs px-3"
                              disabled={submitting[`${c.courier_id}_cash`]}
                              onClick={() => handleCollect(c.courier_id, "cash")}
                              data-testid={`cash-collect-btn-${c.courier_id}`}
                            >
                              {submitting[`${c.courier_id}_cash`] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Al"
                              )}
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-green-600 font-medium ml-auto">Tamamlandı</span>
                        )}
                      </div>
                    )}

                    {/* Kart Satırı */}
                    {collectionFlags.card && c.card_total > 0 && (
                      <div className="flex items-center gap-2" data-testid={`card-row-${c.courier_id}`}>
                        <div className="flex items-center gap-1.5 min-w-[100px]">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          <div>
                            <span className="text-[11px] text-muted-foreground block leading-none">Kart</span>
                            <span className="text-xs font-bold text-blue-700">{formatMoney(c.card_balance)}</span>
                          </div>
                        </div>
                        {c.card_balance > 0 ? (
                          <>
                            <Input
                              type="number"
                              placeholder="Tutar"
                              className="h-8 text-xs flex-1"
                              value={inputs[`${c.courier_id}_card`] || ""}
                              onChange={(e) =>
                                setInputs((p) => ({
                                  ...p,
                                  [`${c.courier_id}_card`]: e.target.value,
                                }))
                              }
                              max={c.card_balance}
                              data-testid={`card-input-${c.courier_id}`}
                            />
                            <Button
                              size="sm"
                              className="h-8 text-xs px-3"
                              disabled={submitting[`${c.courier_id}_card`]}
                              onClick={() => handleCollect(c.courier_id, "card")}
                              data-testid={`card-collect-btn-${c.courier_id}`}
                            >
                              {submitting[`${c.courier_id}_card`] ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                "Al"
                              )}
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-blue-600 font-medium ml-auto">Tamamlandı</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
