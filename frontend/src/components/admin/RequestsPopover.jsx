/**
 * RequestsPopover — Mola + Muafiyet talepleri için tek buton, 2 sub-tab.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Inbox, Coffee, Check, X, Shield, Loader2 } from "lucide-react";

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


function ExemptionDetailDialog({ open, onOpenChange, request, onAction }) {
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setRejectReason("");
  }, [open]);

  const submit = async (action) => {
    if (!request) return;
    setBusy(true);
    try {
      const url = `${API}/exemption-requests/${request.id}/${action}`;
      const body = action === "reject" ? { reason: rejectReason || null } : {};
      await axios.post(url, body);
      toast.success(action === "approve" ? "Muafiyet onaylandı" : "Talep reddedildi");
      onAction?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="exemption-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Muafiyet Talebi
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            <div><span className="text-muted-foreground">Kurye:</span> <span className="font-medium">{request.courier_name}</span></div>
            <div><span className="text-muted-foreground">Sebep:</span> <span className="font-medium">{request.reason_label}</span></div>
            <div><span className="text-muted-foreground">Talep zamanı:</span> {formatTime(request.submitted_at)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notlar</Label>
            <p className="text-sm whitespace-pre-wrap bg-slate-50 p-2 rounded border mt-1">{request.notes}</p>
          </div>
          {request.image_url && (
            <div>
              <Label className="text-xs text-muted-foreground">Görsel</Label>
              <a href={request.image_url} target="_blank" rel="noreferrer" className="block mt-1">
                <img src={request.image_url} alt="" className="w-full max-h-72 object-contain rounded border" />
              </a>
            </div>
          )}
          {request.status === "pending" && (
            <div>
              <Label className="text-xs text-muted-foreground">Red sebebi (opsiyonel)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reddederken belirtebilirsiniz"
                rows={2}
                data-testid="reject-reason-input"
              />
            </div>
          )}
          {request.status !== "pending" && (
            <div className="text-sm">
              <span className="text-muted-foreground">Durum:</span>{" "}
              {request.status === "approved" ? (
                <span className="text-green-700 font-medium">Onaylandı</span>
              ) : (
                <span className="text-red-700 font-medium">Reddedildi</span>
              )}
              {request.decided_by_name && <span className="text-muted-foreground"> · {request.decided_by_name}</span>}
              {request.rejection_reason && (
                <p className="text-xs italic mt-1">"{request.rejection_reason}"</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {request.status === "pending" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>İptal</Button>
              <Button
                variant="outline"
                className="border-red-500 text-red-600 hover:bg-red-50"
                onClick={() => submit("reject")}
                disabled={busy}
                data-testid="reject-exemption-btn"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Reddet
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => submit("approve")}
                disabled={busy}
                data-testid="approve-exemption-btn"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Onayla
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Kapat</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function RequestsPopover({ companyId }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("break"); // break | exemption
  const [breakRequests, setBreakRequests] = useState([]);
  const [exemptions, setExemptions] = useState([]);
  const [breakCount, setBreakCount] = useState(0);
  const [exemptionCount, setExemptionCount] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeExemption, setActiveExemption] = useState(null);
  const prevTotal = useRef(0);
  const isFirst = useRef(true);

  const fetchBreak = useCallback(async () => {
    if (!companyId) return 0;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/break-status`);
      if (res.data.break_mode === "manual" && res.data.pending_requests) {
        setBreakRequests(res.data.pending_requests);
        setBreakCount(res.data.pending_requests.length);
        return res.data.pending_requests.length;
      }
      setBreakRequests([]);
      setBreakCount(0);
      return 0;
    } catch { return 0; }
  }, [companyId]);

  const fetchExemptions = useCallback(async () => {
    if (!companyId) return 0;
    try {
      const res = await axios.get(`${API}/exemption-requests?status=pending`);
      const list = res.data.requests || [];
      setExemptions(list);
      setExemptionCount(list.length);
      return list.length;
    } catch { return 0; }
  }, [companyId]);

  const refresh = useCallback(async () => {
    const [b, e] = await Promise.all([fetchBreak(), fetchExemptions()]);
    const total = b + e;
    if (!isFirst.current && total > prevTotal.current) playSound();
    prevTotal.current = total;
    isFirst.current = false;
  }, [fetchBreak, fetchExemptions]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const handleBreakAction = async (id, action) => {
    try {
      await axios.put(`${API}/break-requests/${id}/action`, { action });
      toast.success(action === "approve" ? "Mola onaylandı" : "Mola reddedildi");
      setBreakRequests(prev => prev.filter(r => r.id !== id));
      setBreakCount(c => Math.max(0, c - 1));
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const totalCount = breakCount + exemptionCount;

  return (
    <>
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
            {totalCount > 0 && (
              <span className="absolute -top-2 -right-2 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center bg-amber-500">
                {totalCount > 9 ? "9+" : totalCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0 mx-4" align="end">
          <div className="p-3 border-b">
            <h4 className="font-semibold text-sm mb-2">Talepler</h4>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setTab("break")}
                className={`text-[11px] py-1.5 px-2 rounded border transition-colors ${
                  tab === "break"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
                data-testid="req-tab-break"
              >
                <Coffee className="w-3 h-3 inline mr-1" />
                Mola {breakCount > 0 && `(${breakCount})`}
              </button>
              <button
                onClick={() => setTab("exemption")}
                className={`text-[11px] py-1.5 px-2 rounded border transition-colors ${
                  tab === "exemption"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
                data-testid="req-tab-exemption"
              >
                <Shield className="w-3 h-3 inline mr-1" />
                Muafiyet {exemptionCount > 0 && `(${exemptionCount})`}
              </button>
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {tab === "break" ? (
              breakRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Coffee className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Bekleyen mola talebi yok</p>
                </div>
              ) : (
                breakRequests.map(req => (
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
                        onClick={() => handleBreakAction(req.id, "approve")}
                        data-testid={`approve-request-${req.id}`}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-red-500 text-red-600 hover:bg-red-50"
                        onClick={() => handleBreakAction(req.id, "reject")}
                        data-testid={`reject-request-${req.id}`}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Reddet
                      </Button>
                    </div>
                  </div>
                ))
              )
            ) : (
              exemptions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Bekleyen muafiyet talebi yok</p>
                </div>
              ) : (
                exemptions.map(req => (
                  <div key={req.id} className="p-3 border-b hover:bg-blue-50/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Shield className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{req.courier_name}</p>
                          <p className="text-xs text-muted-foreground">{req.reason_label}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatTime(req.submitted_at)}</span>
                    </div>
                    <div className="ml-10">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setActiveExemption(req); setDetailOpen(true); }}
                        data-testid={`exemption-detail-${req.id}`}
                      >
                        Detay
                      </Button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </PopoverContent>
      </Popover>

      <ExemptionDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        request={activeExemption}
        onAction={() => { fetchExemptions(); }}
      />
    </>
  );
}
