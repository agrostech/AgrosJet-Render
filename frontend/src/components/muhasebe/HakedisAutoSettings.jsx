import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Settings } from "lucide-react";

export default function HakedisAutoSettings({ 
  enabled, 
  onToggle, 
  closingTime,
  lastAutoRun,
  saving 
}) {
  // 1 saat sonraki saati hesapla
  const getAutoRunTime = () => {
    if (!closingTime) return null;
    const [h, m] = closingTime.split(':').map(Number);
    const targetH = (h + 1) % 24;
    return `${String(targetH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  
  const autoRunTime = getAutoRunTime();
  
  return (
    <Card className="border bg-white shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-slate-500" />
            <div>
              <p className="text-sm font-medium">Otomatik İşleme</p>
              <p className="text-xs text-muted-foreground">
                Her hafta {autoRunTime}'de otomatik hakediş
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {lastAutoRun && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Son: {new Date(lastAutoRun).toLocaleDateString('tr-TR')}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="auto-hakedis"
                checked={enabled}
                onCheckedChange={onToggle}
                disabled={saving}
                data-testid="auto-hakedis-toggle"
              />
              <Label htmlFor="auto-hakedis" className="text-sm">
                {enabled ? "Açık" : "Kapalı"}
              </Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
