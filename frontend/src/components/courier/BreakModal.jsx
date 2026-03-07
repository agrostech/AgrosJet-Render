import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Coffee, Clock, Users, AlertCircle, Loader2, Maximize2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Hızlı seçim butonları
const QUICK_OPTIONS = [15, 30, 45, 60];

export function BreakModal({ 
  open, 
  onOpenChange, 
  courierId, 
  companyId,
  dailyBreakLimit = 30,
  usedBreakTime = 0,
  onBreakStarted 
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [breakStatus, setBreakStatus] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [error, setError] = useState(null);

  // Kalan mola hakkı
  const remainingBreakTime = Math.max(0, dailyBreakLimit - usedBreakTime);

  useEffect(() => {
    if (open && companyId) {
      fetchBreakStatus();
    }
  }, [open, companyId]);

  const fetchBreakStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/companies/${companyId}/break-status`);
      setBreakStatus(res.data);
      
      // Varsayılan süreyi kalan hakka göre ayarla (tam kalan süre veya en yakın hızlı seçenek)
      const maxAllowed = Math.min(remainingBreakTime, 120);
      if (maxAllowed > 0) {
        // Eğer kalan süre hızlı seçeneklerden birine eşitse onu seç, değilse tam kalan süreyi seç
        const quickOption = QUICK_OPTIONS.find(d => d === maxAllowed);
        setSelectedDuration(quickOption || maxAllowed);
      } else {
        setSelectedDuration(15);
      }
    } catch (err) {
      setError("Mola durumu yüklenemedi");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinQueue = async () => {
    if (selectedDuration > remainingBreakTime) {
      toast.error(`Kalan mola hakkınız: ${remainingBreakTime} dakika`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/couriers/${courierId}/break-queue`, {
        duration: selectedDuration
      });
      
      toast.success(res.data.message);
      onBreakStarted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Mola sırasına girilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBreakRequest = async () => {
    if (selectedDuration > remainingBreakTime) {
      toast.error(`Kalan mola hakkınız: ${remainingBreakTime} dakika`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/couriers/${courierId}/break-request`, {
        duration: selectedDuration
      });
      
      toast.success(res.data.message);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Mola talebi gönderilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  // Limit yeterli mi?
  const breakLimit = breakStatus?.active_shift?.break_limit || 0;
  const onBreakCount = breakStatus?.on_break_count || 0;
  const isLimitAvailable = onBreakCount < breakLimit;
  const isAutomatic = breakStatus?.break_mode === "automatic";

  // Sıradaki pozisyon ve bekleme süresi hesapla
  const queueLength = breakStatus?.queue?.length || 0;
  const estimatedWait = breakStatus?.queue?.reduce((sum, q) => sum + (q.duration || 30), 0) || 0;
  const totalWaitWithOnBreak = breakStatus?.on_break_couriers?.reduce(
    (sum, c) => sum + (c.remaining_minutes || 0), 0
  ) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-amber-600" />
            Mola
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Yükleniyor...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
            <p className="mt-2 text-sm text-red-500">{error}</p>
            <Button variant="outline" onClick={fetchBreakStatus} className="mt-4">
              Tekrar Dene
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Mola Hakkı Bilgisi */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800">Kalan Mola Hakkı</span>
                <span className="text-lg font-bold text-amber-600">{remainingBreakTime} dk</span>
              </div>
              <div className="mt-1 h-2 bg-amber-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${(remainingBreakTime / dailyBreakLimit) * 100}%` }}
                />
              </div>
            </div>

            {/* Aktif Vardiya ve Limit Bilgisi */}
            <div className="p-3 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Aktif Vardiya</span>
                <span className="font-medium">{breakStatus?.active_shift?.name || "Belirsiz"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mola Limiti</span>
                <span className={`font-medium ${isLimitAvailable ? 'text-green-600' : 'text-red-600'}`}>
                  {onBreakCount} / {breakLimit} kişi
                </span>
              </div>
            </div>

            {/* Moladaki Kuryeler */}
            {breakStatus?.on_break_couriers?.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  Moladaki Kuryeler
                </Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {breakStatus.on_break_couriers.map((courier, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                      <span>{courier.name}</span>
                      <span className="text-muted-foreground">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {courier.remaining_minutes} dk kaldı
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sıradaki Kuryeler (Otomatik Mod) */}
            {isAutomatic && breakStatus?.queue?.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Sıradaki Kuryeler</Label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {breakStatus.queue.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
                      <span>{idx + 1}. {item.courier_name}</span>
                      <span className="text-muted-foreground">{item.duration} dk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Süre Seçimi */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Mola Süresi</Label>
              
              {/* Manuel Input + Tümünü Kullan */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    min={1}
                    max={remainingBreakTime}
                    value={selectedDuration}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setSelectedDuration(Math.min(Math.max(1, val), remainingBreakTime));
                    }}
                    className="pr-12 text-center text-lg font-semibold h-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    dk
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 px-4 whitespace-nowrap"
                  onClick={() => setSelectedDuration(remainingBreakTime)}
                  disabled={remainingBreakTime <= 0}
                >
                  <Maximize2 className="w-4 h-4 mr-1" />
                  Tümü ({remainingBreakTime})
                </Button>
              </div>
              
              {/* Hızlı Seçim Butonları */}
              <div className="flex gap-2 flex-wrap">
                {QUICK_OPTIONS.map(duration => {
                  const isDisabled = duration > remainingBreakTime;
                  const isSelected = selectedDuration === duration;
                  return (
                    <Button
                      key={duration}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 min-w-[60px] ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setSelectedDuration(duration)}
                    >
                      {duration >= 60 ? `${duration / 60} saat` : `${duration} dk`}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Bekleme Süresi Tahmini (Otomatik Mod, Limit Dolu) */}
            {isAutomatic && !isLimitAvailable && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Tahmini bekleme süresi: <strong>{totalWaitWithOnBreak + estimatedWait} dakika</strong>
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Sıraya girdiğinizde normal çalışmaya devam edebilirsiniz.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            İptal
          </Button>
          
          {isAutomatic ? (
            // Otomatik Mod
            isLimitAvailable ? (
              <Button onClick={handleJoinQueue} disabled={loading || submitting || remainingBreakTime <= 0}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Coffee className="w-4 h-4 mr-2" />}
                Molaya Çık
              </Button>
            ) : (
              <Button onClick={handleJoinQueue} disabled={loading || submitting || remainingBreakTime <= 0}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Clock className="w-4 h-4 mr-2" />}
                Sıraya Gir ({totalWaitWithOnBreak + estimatedWait} dk)
              </Button>
            )
          ) : (
            // Manuel Mod
            isLimitAvailable ? (
              <Button onClick={handleBreakRequest} disabled={loading || submitting || remainingBreakTime <= 0}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Coffee className="w-4 h-4 mr-2" />}
                Mola Talep Et
              </Button>
            ) : (
              <Button disabled className="opacity-50">
                Limit Dolu
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
