/**
 * RequestsPopover - Mola talepleri için ayrı buton.
 * NotificationsPopover'dan ayrılarak 3 tabbed sistem yerine 3 buton + tek tab modeline geçişin parçası.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Inbox, Coffee, Check, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const playSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* noop */ }
};

const formatTime = (iso) => {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "Az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return d.toLocaleDateString("tr-TR");
};

export default function RequestsPopover({ companyId }) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  const isFirst = useRef(true);

  const fetchRequests = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/break-status`);
      if (res.data.break_mode === "manual" && res.data.pending_requests) {
        const newCount = res.data.pending_requests.length;
        if (!isFirst.current && newCount > prev.current) playSound();
        prev.current = newCount;
        setRequests(res.data.pending_requests);
        setCount(newCount);
      } else {
        prev.current = 0;
        setRequests([]);
        setCount(0);
      }
      isFirst.current = false;
    } catch { /* ignore */ }
  }, [companyId]);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 10000);
    const onFocus = () => fetchRequests();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [fetchRequests]);

  const handleAction = async (id, action) => {
    try {
      await axios.put(`${API}/break-requests/${id}/action`, { action });
      toast.success(action === "approve" ? "Mola talebi onaylandı" : "Mola talebi reddedildi");
      setRequests(prev => prev.filter(r => r.id !== id));
      setCount(c => Math.max(0, c - 1));
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative border-2 font-semibold px-2 sm:px-3"
          data-testid="requests-btn"
        >
          <Inbox className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Talepler</span>
          {count > 0 && (
            <span className="absolute -top-2 -right-2 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-amber-500">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0 mx-4" align="end">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm">Talepler</h4>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Coffee className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Bekleyen talep yok</p>
            </div>
          ) : (
            requests.map(req => (
              <div key={req.id} className="p-3 border-b hover:bg-amber-50/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <Coffee className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{req.courier_name}</p>
                      <p className="text-xs text-muted-foreground">{req.duration} dakika mola</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatTime(req.created_at)}</span>
                </div>
                <div className="flex gap-2 ml-10">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-green-500 text-green-600 hover:bg-green-50"
                    onClick={() => handleAction(req.id, "approve")}
                    data-testid={`approve-request-${req.id}`}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Onayla
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-500 text-red-600 hover:bg-red-50"
                    onClick={() => handleAction(req.id, "reject")}
                    data-testid={`reject-request-${req.id}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Reddet
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
