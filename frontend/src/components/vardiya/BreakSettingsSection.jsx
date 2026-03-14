import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Coffee, Clock, Users, Settings, RefreshCw } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function BreakSettingsSection({ companyId, shifts }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breakMode, setBreakMode] = useState("automatic");
  const [breakStartRestriction, setBreakStartRestriction] = useState(30);
  const [breakAssignmentRestriction, setBreakAssignmentRestriction] = useState(10);
  const [shiftLimits, setShiftLimits] = useState({});

  useEffect(() => { if (companyId) fetchSettings(); }, [companyId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const settingsRes = await axios.get(`${API}/companies/${companyId}/break-settings`);
      setBreakMode(settingsRes.data.break_mode || "automatic");
      setBreakStartRestriction(settingsRes.data.break_start_restriction || 30);
      setBreakAssignmentRestriction(settingsRes.data.break_assignment_restriction || 10);
      const limitsRes = await axios.get(`${API}/companies/${companyId}/shifts-break-limits`);
      const m = {};
      limitsRes.data.forEach(s => { m[s.id] = s.break_limit || 2; });
      setShiftLimits(m);
    } catch { toast.error("Mola ayarları yüklenemedi"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/companies/${companyId}/break-settings`, {
        break_mode: breakMode,
        break_start_restriction: parseInt(breakStartRestriction) || 30,
        break_assignment_restriction: parseInt(breakAssignmentRestriction) || 10
      });
      for (const [shiftId, limit] of Object.entries(shiftLimits)) {
        await axios.put(`${API}/shifts/${shiftId}/break-limit`, { break_limit: parseInt(limit) || 2 });
      }
      toast.success("Mola ayarları kaydedildi");
    } catch (err) { toast.error(err.response?.data?.detail || "Kaydetme başarısız"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="border-2 border-border bg-white dark:bg-slate-900 rounded-lg overflow-hidden" data-testid="break-settings-section">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-700">
            <Coffee className="w-4.5 h-4.5 text-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base">Mola Sistemi Ayarları</h3>
            <p className="text-xs text-muted-foreground">Mola modu, kısıtlamalar ve vardiya limitleri</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 sm:space-y-6">

      {/* Mola Modu */}
      <div className="space-y-2">
        <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4" /> Mola Modu
        </Label>
        <div className="flex items-center justify-between p-3 sm:p-4 border-2 rounded-lg">
          <div>
            <p className="font-medium text-sm">{breakMode === "automatic" ? "Otomatik Mola" : "Manuel Mola"}</p>
            <p className="text-xs text-muted-foreground">{breakMode === "automatic" ? "Kuryeler sıraya girerek molaya çıkar" : "Kuryeler talep gönderir, admin onaylar"}</p>
          </div>
          <Switch checked={breakMode === "automatic"} onCheckedChange={(checked) => setBreakMode(checked ? "automatic" : "manual")} />
        </div>
      </div>

      {/* Kısıtlamalar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-2 p-3 border rounded-lg">
          <Label className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Başlangıç Kısıtlama
          </Label>
          <p className="text-[11px] sm:text-xs text-muted-foreground">Vardiya başladıktan sonra bu süre geçmeden molaya çıkılamaz</p>
          <div className="flex items-center gap-2">
            <Input type="number" min="0" max="480" value={breakStartRestriction} onChange={(e) => setBreakStartRestriction(e.target.value)} className="w-20 h-8 text-sm" />
            <span className="text-xs text-muted-foreground">dakika</span>
          </div>
        </div>

        {breakMode === "automatic" && (
          <div className="space-y-2 p-3 border rounded-lg">
            <Label className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Paket Atama Kısıtlama
            </Label>
            <p className="text-[11px] sm:text-xs text-muted-foreground">Molasına bu kadar süre kala otomatik paket atanmaz</p>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="120" value={breakAssignmentRestriction} onChange={(e) => setBreakAssignmentRestriction(e.target.value)} className="w-20 h-8 text-sm" />
              <span className="text-xs text-muted-foreground">dakika</span>
            </div>
          </div>
        )}
      </div>

      {/* Vardiya Bazlı Limitler */}
      <div className="space-y-2">
        <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" /> Vardiya Bazlı Mola Limitleri
        </Label>
        <p className="text-[11px] sm:text-xs text-muted-foreground">Her vardiya için aynı anda molada olabilecek maksimum kişi sayısı</p>
        <div className="space-y-2">
          {shifts && shifts.length > 0 ? (
            shifts.map(shift => (
              <div key={shift.id} className="flex items-center justify-between p-2.5 sm:p-3 border rounded-lg">
                <div className="min-w-0 mr-2">
                  <p className="font-medium text-sm truncate">{shift.name}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{shift.start_time} - {shift.end_time}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Input type="number" min="0" max="50" value={shiftLimits[shift.id] || 2} onChange={(e) => setShiftLimits(prev => ({ ...prev, [shift.id]: e.target.value }))} className="w-16 sm:w-20 h-8 text-center text-sm" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">kişi</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">Henüz vardiya tanımlı değil</p>
          )}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </Button>
      </div>
    </div>
  );
}
