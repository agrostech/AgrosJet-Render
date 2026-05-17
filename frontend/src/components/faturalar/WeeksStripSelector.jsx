/**
 * Hafta Şeritli Seçici (Kurye Hakediş tarzı)
 *
 * Son N hafta için yatay tab şeridi.
 * Her tab: hafta etiketi + "yüklenen/oluşturulan/toplam" rozeti veya yeşil tik.
 */
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WeeksStripSelector({
  weeks = [],
  selectedWeekStart,
  onSelect,
  onPrevPage,
  onNextPage,
  canPrev = false,
  canNext = false,
}) {
  return (
    <div
      className="flex items-center gap-1 bg-white border rounded-lg p-1.5 shadow-sm"
      data-testid="weeks-strip-selector"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onPrevPage}
        disabled={!canPrev}
        className="h-8 w-8 p-0 shrink-0"
        data-testid="weeks-strip-prev"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
        {weeks.map((w) => {
          const isSelected = w.week_start === selectedWeekStart;
          const total = w.total_couriers || 0;
          const created = w.created || 0;
          const uploaded = w.uploaded || 0;
          const allUploaded = total > 0 && uploaded === total && created === total;
          const isFuture = w.is_current && created === 0; // bu hafta, henüz oluşmamış
          return (
            <button
              key={w.week_start}
              onClick={() => onSelect(w)}
              className={`
                flex-1 min-w-[90px] py-1.5 px-2 rounded-md text-center transition-all
                ${isSelected
                  ? "bg-slate-900 text-white shadow-sm"
                  : "hover:bg-slate-100 text-slate-700"}
              `}
              data-testid={`weeks-strip-tab-${w.week_start}`}
            >
              <div className={`text-[10px] font-medium ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                {w.label}
              </div>
              {isFuture ? (
                <div className={`text-[10px] mt-0.5 ${isSelected ? "text-blue-200" : "text-blue-600"}`}>
                  Yaklaşan
                </div>
              ) : total === 0 ? (
                <div className={`text-[10px] mt-0.5 ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
                  0 kurye
                </div>
              ) : allUploaded ? (
                <div className={`mt-0.5 ${isSelected ? "text-green-400" : "text-green-500"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                </div>
              ) : (
                <div
                  className={`text-[11px] font-semibold mt-0.5 tabular-nums ${
                    isSelected ? "text-blue-200" : "text-blue-600"
                  }`}
                  title="Yüklenen / Oluşturulan / Toplam"
                >
                  {uploaded}/{created}/{total}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onNextPage}
        disabled={!canNext}
        className="h-8 w-8 p-0 shrink-0"
        data-testid="weeks-strip-next"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
