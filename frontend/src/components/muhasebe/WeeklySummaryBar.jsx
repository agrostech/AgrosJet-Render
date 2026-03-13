import { useState, useEffect } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Haftalık özet barı - Günlük Tahsilat ve Mütabakat için ortak bileşen
 */
export default function WeeklySummaryBar({ companyId, selectedDate, onDateSelect, type = "collection" }) {
  const [weekStart, setWeekStart] = useState(null);
  const [summary, setSummary] = useState({ days: [] });

  useEffect(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setWeekStart(fmtLocal(monday));
  }, []);

  useEffect(() => {
    if (companyId && weekStart) {
      fetchWeeklySummary();
    }
  }, [companyId, weekStart, type]);

  const fetchWeeklySummary = async () => {
    try {
      const endpoint = type === "collection" 
        ? `${API}/daily-collections/${companyId}/weekly-summary?week_start=${weekStart}`
        : `${API}/daily-reports/weekly-summary/${companyId}?week_start=${weekStart}`;
      
      const res = await axios.get(endpoint);
      setSummary(res.data);
    } catch (err) {
      setSummary({ days: [] });
    }
  };

  const navigateWeek = (direction) => {
    const current = new Date(weekStart);
    current.setDate(current.getDate() + (direction * 7));
    const fmtLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setWeekStart(fmtLocal(current));
  };

  const formatWeekRange = () => {
    if (!weekStart) return "";
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    
    const startStr = `${start.getDate()} ${start.toLocaleDateString('tr-TR', { month: 'short' })}`;
    const endStr = `${end.getDate()} ${end.toLocaleDateString('tr-TR', { month: 'short' })}`;
    return `${startStr} - ${endStr}`;
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateWeek(-1)}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          {formatWeekRange()}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateWeek(1)}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {summary.days.map((day) => {
          const isSelected = selectedDate === day.date;
          const isFuture = day.status === "future";
          const isComplete = day.status === "complete";
          
          return (
            <button
              key={day.date}
              onClick={() => !isFuture && onDateSelect(day.date)}
              disabled={isFuture}
              className={cn(
                "flex flex-col items-center py-1.5 px-1 rounded border transition-all",
                isFuture ? "opacity-40 cursor-not-allowed border-slate-100 bg-slate-50" : "cursor-pointer border-slate-200 hover:border-slate-300",
                isSelected && "ring-2 ring-primary ring-offset-1 border-primary bg-primary/5"
              )}
              data-testid={`week-day-${day.date}`}
            >
              {/* Gün adı */}
              <span className={cn(
                "text-[10px] font-medium leading-none",
                isFuture ? "text-slate-400" : "text-slate-500"
              )}>
                {day.day_name}
              </span>
              
              {/* Gün numarası */}
              <span className={cn(
                "text-sm font-bold leading-tight",
                isFuture ? "text-slate-400" : "text-slate-700",
                day.is_today && "underline"
              )}>
                {day.day_number}
              </span>
              
              {/* Tamamlandı ise tik, değilse kayıt durumu */}
              <span className="h-3.5 flex items-center justify-center mt-0.5">
                {isComplete ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  type === "collection" && !isFuture && (
                    <span className="text-[9px] text-slate-500 font-mono">
                      {day.completed}/{day.total}
                    </span>
                  )
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
