import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, Zap } from "lucide-react";

export default function HakedisAutoSettings({ 
  enabled, 
  onToggle, 
  closingTime,
  lastAutoRun,
  saving 
}) {
  // 15 dk sonraki saati hesapla
  const getAutoRunTime = () => {
    if (!closingTime) return null;
    const [h, m] = closingTime.split(':').map(Number);
    let targetM = m + 15;
    let targetH = h;
    if (targetM >= 60) {
      targetM -= 60;
      targetH = (targetH + 1) % 24;
    }
    return `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
  };
  
  const autoRunTime = getAutoRunTime();
  
  return (
    <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border">
      <div className="flex items-center gap-2">
        <Zap className={`w-4 h-4 ${enabled ? 'text-amber-500' : 'text-slate-400'}`} />
        <div className="flex flex-col">
          <Label className="text-sm font-medium cursor-pointer" htmlFor="auto-hakedis">
            Otomatik İşleme
          </Label>
          {autoRunTime && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Her hafta {autoRunTime}'de çalışır
            </span>
          )}
        </div>
      </div>
      <Switch
        id="auto-hakedis"
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={saving}
        data-testid="auto-hakedis-toggle"
      />
      {lastAutoRun && (
        <span className="text-xs text-slate-400 ml-auto hidden sm:block">
          Son: {new Date(lastAutoRun).toLocaleDateString('tr-TR', { 
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
          })}
        </span>
      )}
    </div>
  );
}
