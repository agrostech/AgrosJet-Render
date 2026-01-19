import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

export function MonthSelector({ year, month, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between border-2 border-border bg-white p-3">
      <Button variant="ghost" size="sm" onClick={onPrev}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-primary" />
        <span className="font-semibold">{MONTHS[month - 1]} {year}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onNext}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
