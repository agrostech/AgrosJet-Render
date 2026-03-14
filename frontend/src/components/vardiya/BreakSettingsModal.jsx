import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Coffee, Clock, Users, Settings } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function BreakSettingsModal({ open, onOpenChange, companyId, shifts }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Şirket ayarları
  const [breakMode, setBreakMode] = useState("automatic");
  const [breakStartRestriction, setBreakStartRestriction] = useState(30);
  const [breakAssignmentRestriction, setBreakAssignmentRestriction] = useState(10);
  
  // Vardiya bazlı limitler
  const [shiftLimits, setShiftLimits] = useState({});

  useEffect(() => {
    if (open && companyId) {
      fetchSettings();
    }
  }, [open, companyId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      // Şirket mola ayarlarını çek
      const settingsRes = await axios.get(`${API}/companies/${companyId}/break-settings`);
      setBreakMode(settingsRes.data.break_mode || "automatic");
      setBreakStartRestriction(settingsRes.data.break_start_restriction || 30);
      setBreakAssignmentRestriction(settingsRes.data.break_assignment_restriction || 10);
      
      // Vardiya limitlerini çek
      const limitsRes = await axios.get(`${API}/companies/${companyId}/shifts-break-limits`);
      const limitsMap = {};
      limitsRes.data.forEach(shift => {
        limitsMap[shift.id] = shift.break_limit || 2;
      });
      setShiftLimits(limitsMap);
    } catch (err) {
      toast.error("Mola ayarları yüklenemedi");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Şirket ayarlarını kaydet
      await axios.put(`${API}/companies/${companyId}/break-settings`, {
        break_mode: breakMode,
        break_start_restriction: parseInt(breakStartRestriction) || 30,
        break_assignment_restriction: parseInt(breakAssignmentRestriction) || 10
      });
      
      // Vardiya limitlerini kaydet
      for (const [shiftId, limit] of Object.entries(shiftLimits)) {
        await axios.put(`${API}/shifts/${shiftId}/break-limit`, {
          break_limit: parseInt(limit) || 2
        });
      }
      
      toast.success("Mola ayarları kaydedildi");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    } finally {
      setSaving(false);
    }
  };

  const handleShiftLimitChange = (shiftId, value) => {
    setShiftLimits(prev => ({
      ...prev,
      [shiftId]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-slate-500" />
            Mola Sistemi Ayarları
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="py-8 text-center">
            <LoadingSpinner size="default" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Mola Modu */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Mola Modu
              </Label>
              <div className="flex items-center justify-between p-4 border-2 rounded-lg">
                <div>
                  <p className="font-medium">
                    {breakMode === "automatic" ? "Otomatik Mola" : "Manuel Mola"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {breakMode === "automatic" 
                      ? "Kuryeler sıraya girerek molaya çıkar" 
                      : "Kuryeler talep gönderir, admin onaylar"}
                  </p>
                </div>
                <Switch
                  checked={breakMode === "automatic"}
                  onCheckedChange={(checked) => setBreakMode(checked ? "automatic" : "manual")}
                />
              </div>
            </div>

            {/* Vardiya Başlangıç Kısıtlaması */}
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Vardiya Başlangıç Kısıtlaması
              </Label>
              <p className="text-sm text-muted-foreground">
                Vardiya başladıktan sonra bu süre geçmeden molaya çıkılamaz
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="480"
                  value={breakStartRestriction}
                  onChange={(e) => setBreakStartRestriction(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">dakika</span>
              </div>
            </div>

            {/* Paket Atama Kısıtlaması - Sadece Otomatik Mod */}
            {breakMode === "automatic" && (
              <div className="space-y-2">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Paket Atama Kısıtlaması
                </Label>
                <p className="text-sm text-muted-foreground">
                  Kuryenin molasına bu kadar süre kala otomatik paket atanmaz
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    value={breakAssignmentRestriction}
                    onChange={(e) => setBreakAssignmentRestriction(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">dakika</span>
                </div>
              </div>
            )}

            {/* Vardiya Bazlı Kişi Limitleri */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                Vardiya Bazlı Mola Limitleri
              </Label>
              <p className="text-sm text-muted-foreground">
                Her vardiya için aynı anda molada olabilecek maksimum kişi sayısı
              </p>
              <div className="space-y-2">
                {shifts && shifts.length > 0 ? (
                  shifts.map(shift => (
                    <div key={shift.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{shift.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {shift.start_time} - {shift.end_time}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="50"
                          value={shiftLimits[shift.id] || 2}
                          onChange={(e) => handleShiftLimitChange(shift.id, e.target.value)}
                          className="w-20 text-center"
                        />
                        <span className="text-sm text-muted-foreground">kişi</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">Henüz vardiya tanımlı değil</p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
