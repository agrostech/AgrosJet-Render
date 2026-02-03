import { useState, useEffect } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight, Check, AlertTriangle, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Haftalık özet barı - Günlük Tahsilat ve Mütabakat için ortak bileşen
 * 
 * Props:
 * - companyId: Şirket ID
 * - selectedDate: Seçili tarih (YYYY-MM-DD)
 * - onDateSelect: Tarih seçildiğinde çağrılır
 * - type: "collection" | "mutabakat"
 */
export default function WeeklySummaryBar({ companyId, selectedDate, onDateSelect, type = "collection" }) {
  const [weekStart, setWeekStart] = useState(null);
  const [summary, setSummary] = useState({ days: [] });
  const [loading, setLoading] = useState(false);

  // Başlangıçta bu haftanın Pazartesi'sini hesapla
  useEffect(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    setWeekStart(monday.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (companyId && weekStart) {
      fetchWeeklySummary();
    }
  }, [companyId, weekStart, type]);

  const fetchWeeklySummary = async () => {
    setLoading(true);
    try {
      const endpoint = type === "collection" 
        ? `${API}/daily-collections/${companyId}/weekly-summary?week_start=${weekStart}`
        : `${API}/daily-reports/weekly-summary/${companyId}?week_start=${weekStart}`;
      
      const res = await axios.get(endpoint);
      setSummary(res.data);
    } catch (err) {
      setSummary({ days: [] });
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (direction) => {
    const current = new Date(weekStart);
    current.setDate(current.getDate() + (direction * 7));
    setWeekStart(current.toISOString().split('T')[0]);
  };

  const getStatusIcon = (day) => {
    if (day.status === "future") return null;
    if (day.status === "complete") return <Check className="w-3 h-3" />;
    if (day.status === "partial" || day.status === "ready") return <AlertTriangle className="w-3 h-3" />;
    if (day.status === "empty") return <X className="w-3 h-3" />;
    return null;
  };

  const getStatusColor = (day, isSelected) => {
    if (isSelected) {
      return "ring-2 ring-primary ring-offset-1";
    }
    
    switch (day.status) {
      case "complete":
        return "bg-green-100 border-green-400 text-green-700";
      case "partial":
      case "ready":
        return "bg-amber-100 border-amber-400 text-amber-700";
      case "empty":
        return "bg-red-100 border-red-400 text-red-700";
      case "future":
        return "bg-slate-50 border-slate-200 text-slate-400";
      default:
        return "bg-slate-100 border-slate-300 text-slate-600";
    }
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

  if (loading && summary.days.length === 0) {
    return (
      <div className="flex items-center justify-center py-3 bg-slate-50 rounded-lg border border-slate-200">
        <Clock className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateWeek(-1)}
          className="h-6 w-6 p-0"
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
          className="h-6 w-6 p-0"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-1">
        {summary.days.map((day) => {
          const isSelected = selectedDate === day.date;
          const isFuture = day.status === "future";
          
          return (
            <button
              key={day.date}
              onClick={() => !isFuture && onDateSelect(day.date)}
              disabled={isFuture}
              className={cn(
                "flex flex-col items-center py-1.5 px-1 rounded border transition-all",
                "hover:bg-opacity-80 focus:outline-none",
                getStatusColor(day, isSelected),
                isFuture ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                isSelected && "bg-primary/10 border-primary"
              )}
              data-testid={`week-day-${day.date}`}
            >
              {/* Gün adı */}
              <span className="text-[10px] font-medium leading-none">
                {day.day_name}
              </span>
              
              {/* Gün numarası */}
              <span className={cn(
                "text-sm font-bold leading-tight",
                day.is_today && "underline"
              )}>
                {day.day_number}
              </span>
              
              {/* Durum göstergesi */}
              {type === "collection" ? (
                // Tahsilat için: tamamlanan/toplam
                <span className="text-[9px] leading-none mt-0.5">
                  {!isFuture ? `${day.completed}/${day.total}` : "-"}
                </span>
              ) : (
                // Mütabakat için: ikon
                <span className="h-3 flex items-center justify-center mt-0.5">
                  {getStatusIcon(day)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend - küçük */}
      <div className="flex items-center justify-center gap-3 mt-2 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Tamam
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Eksik
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Boş
        </span>
      </div>
    </div>
  );
}
