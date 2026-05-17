import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Settings, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CourierAutoSettingsCard({ companyId }) {
  const [enabled, setEnabled] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/courier-invoice-obligations/auto-settings/${companyId}`);
        setEnabled(!!res.data?.enabled);
        setLastRun(res.data?.last_run_at || null);
      } catch {
        // sessizce yoksay; admin yetkisi yoksa görünmez
      } finally {
        setLoaded(true);
      }
    })();
  }, [companyId]);

  const handleToggle = async (v) => {
    setSaving(true);
    try {
      await axios.put(`${API}/courier-invoice-obligations/auto-settings/${companyId}`, { enabled: v });
      setEnabled(v);
      toast.success(v ? "Otomatik işleme açıldı" : "Otomatik işleme kapatıldı");
    } catch {
      toast.error("Ayar güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card className="border bg-white shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Settings className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Otomatik İşleme</p>
              <p className="text-xs text-muted-foreground">
                Her Pazartesi haftalık fatura yükümlülüklerini otomatik oluştur
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            {lastRun && (
              <span className="hidden sm:inline-flex text-xs text-muted-foreground items-center gap-1">
                <Clock className="w-3 h-3" />
                Son: {new Date(lastRun).toLocaleDateString("tr-TR")}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="courier-auto-invoice"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={saving}
                data-testid="courier-auto-invoice-toggle"
              />
              <Label htmlFor="courier-auto-invoice" className="text-sm">
                {enabled ? "Açık" : "Kapalı"}
              </Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
