/**
 * Hafta Şeritli Seçici (Kurye Hakediş tarzı)
 *
 * Son N hafta için yatay tab şeridi. Her tab 3 satırlı:
 *  1) Gün aralığı  (örn. "11 - 17")
 *  2) Ay adı       (örn. "Mayıs")  ← big/semibold
 *  3) Rozet        (örn. "0/3/3" veya yeşil tik veya "Yaklaşan")
 *
 * Yükseklik kurye hakediş gün seçicisi ile aynıdır.
 */
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function parseWeek(w) {
  // w.week_start / w.week_end "YYYY-MM-DD" veya ISO datetime (slice ile normalize)
  const ws = (w.week_start || "0000-00-00").slice(0, 10);
  const we = (w.week_end || "0000-00-00").slice(0, 10);
  const [ys, ms, ds] = ws.split("-");
  const [, me, de] = we.split("-");
  const startDay = parseInt(ds, 10) || 0;
  const endDay = parseInt(de, 10) || 0;
  const startMonth = parseInt(ms, 10) || 1;
  const endMonth = parseInt(me, 10) || 1;
  const monthLabel = startMonth === endMonth
    ? MONTHS_TR[startMonth - 1]
    : `${MONTHS_TR[startMonth - 1]?.slice(0, 3)}–${MONTHS_TR[endMonth - 1]?.slice(0, 3)}`;
  return { startDay, endDay, monthLabel, year: ys };
}

function defaultRenderBadge(w, isSelected) {
  const total = w.total_couriers || 0;
  const created = w.created || 0;
  const uploaded = w.uploaded || 0;
  const allUploaded = total > 0 && uploaded === total && created === total;
  const isFuture = w.is_current && created === 0;
  if (isFuture) {
    return (
      <div className={`text-[11px] font-medium mt-0.5 ${isSelected ? "text-blue-200" : "text-blue-600"}`}>
        Yaklaşan
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className={`text-[11px] mt-0.5 ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
        0 kurye
      </div>
    );
  }
  if (allUploaded) {
    return (
      <div className={`mt-0.5 ${isSelected ? "text-green-400" : "text-green-500"}`}>
        <CheckCircle2 className="w-4 h-4 mx-auto" />
      </div>
    );
  }
  return (
    <div
      className={`text-xs font-semibold mt-0.5 tabular-nums ${
        isSelected ? "text-blue-200" : "text-blue-600"
      }`}
      title="Yüklenen / Oluşturulan / Toplam"
    >
      {uploaded}/{created}/{total}
    </div>
  );
}

export default function WeeksStripSelector({
  weeks = [],
  selectedWeekStart,
  onSelect,
  onPrevPage,
  onNextPage,
  canPrev = false,
  canNext = false,
  renderBadge,
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
          const { startDay, endDay, monthLabel } = parseWeek(w);
          const badge = renderBadge
            ? renderBadge(w, isSelected)
            : defaultRenderBadge(w, isSelected);
          return (
            <button
              key={w.week_start}
              onClick={() => onSelect(w)}
              className={`
                flex-1 min-w-[80px] py-2 px-2 rounded-md text-center transition-all
                ${isSelected
                  ? "bg-slate-900 text-white shadow-sm"
                  : "hover:bg-slate-100 text-slate-700"}
              `}
              data-testid={`weeks-strip-tab-${w.week_start}`}
            >
              <div className={`text-[11px] font-medium ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                {startDay} – {endDay}
              </div>
              <div className="text-sm font-semibold leading-tight">{monthLabel}</div>
              {badge}
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
