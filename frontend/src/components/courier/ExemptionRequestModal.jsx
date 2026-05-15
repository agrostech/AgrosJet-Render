import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, X, Check } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const REASONS = [
  { value: "health", label: "Sağlık Sorunu" },
  { value: "accident", label: "Trafik Kazası" },
  { value: "equipment", label: "Ekipman Arızası" },
  { value: "other", label: "Diğer" },
];

const STATUS_LABELS = {
  pending: { label: "Talep değerlendiriliyor", color: "text-amber-600 bg-amber-50" },
  approved: { label: "Onaylandı — bugünden yarın açılışa kadar geçerli", color: "text-green-700 bg-green-50" },
  rejected: { label: "Reddedildi", color: "text-red-700 bg-red-50" },
};

export default function ExemptionRequestModal({ open, onOpenChange }) {
  const [reason, setReason] = useState("health");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [todayRequest, setTodayRequest] = useState(null); // mevcut talep (varsa)
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("health"); setNotes(""); setFile(null);
      return;
    }
    setLoading(true);
    axios.get(`${API}/exemption-requests/courier/today`)
      .then(res => setTodayRequest(res.data.request || null))
      .catch(() => setTodayRequest(null))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSubmit = async () => {
    if (notes.trim().length < 10) {
      return toast.error("Notlar en az 10 karakter olmalı");
    }
    if (!file) return toast.error("Görsel zorunlu");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("reason", reason);
      fd.append("notes", notes.trim());
      fd.append("file", file);
      const res = await axios.post(`${API}/exemption-requests`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Muafiyet talebi gönderildi");
      setTodayRequest(res.data.request);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Talep oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error("Görsel 10MB'tan büyük olamaz");
    setFile(f);
  };

  const renderExisting = () => {
    if (!todayRequest) return null;
    const status = STATUS_LABELS[todayRequest.status] || {};
    return (
      <div className="space-y-3" data-testid="existing-exemption">
        <div className={`p-3 rounded-md ${status.color}`}>
          <p className="font-medium text-sm">{status.label}</p>
        </div>
        <div className="text-sm space-y-1.5">
          <div><span className="text-muted-foreground">Sebep:</span> <span className="font-medium">{todayRequest.reason_label}</span></div>
          <div className="text-muted-foreground">Notlarınız:</div>
          <p className="text-xs whitespace-pre-wrap bg-slate-50 p-2 rounded border">{todayRequest.notes}</p>
          {todayRequest.image_url && (
            <a href={todayRequest.image_url} target="_blank" rel="noreferrer" className="block mt-1">
              <img src={todayRequest.image_url} alt="" className="w-full max-h-48 object-cover rounded border" />
            </a>
          )}
          {todayRequest.status === "rejected" && todayRequest.rejection_reason && (
            <div className="mt-2">
              <span className="text-muted-foreground text-xs">Red sebebi:</span>
              <p className="text-xs italic">"{todayRequest.rejection_reason}"</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="exemption-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Muafiyet Talebi
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : todayRequest ? (
          renderExisting()
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Onaylanırsa bir sonraki gün şirket açılış saatine kadar tüm ceza işleyişlerinden muaf tutulursunuz. İhlal kaydı oluşur ama ücretten kesinti yapılmaz.
            </p>

            <div>
              <Label className="text-xs">Sebep *</Label>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {REASONS.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`text-xs py-1.5 px-2 rounded border transition-colors ${
                      reason === r.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    data-testid={`exemption-reason-${r.value}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Notlarınız * <span className="text-muted-foreground">(en az 10 karakter)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mazeretinizi detaylı açıklayın..."
                rows={4}
                data-testid="exemption-notes"
              />
            </div>

            <div>
              <Label className="text-xs">Görsel * <span className="text-muted-foreground">(zorunlu)</span></Label>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                data-testid="exemption-file"
              />
              {file && (
                <div className="relative mt-2 inline-block">
                  <img src={URL.createObjectURL(file)} alt="" className="w-32 h-32 object-cover rounded border" />
                  <button
                    onClick={() => setFile(null)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Kapat
          </Button>
          {!todayRequest && !loading && (
            <Button onClick={handleSubmit} disabled={submitting} data-testid="exemption-submit">
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              <Check className="w-4 h-4 mr-1" />
              Talep Oluştur
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
