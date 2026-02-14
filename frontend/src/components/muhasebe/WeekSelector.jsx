import { ChevronDown, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function WeekSelector({ weeks, selectedWeek, onSelect, loading }) {
  const selectedLabel = selectedWeek?.label || "Hafta Seçin";
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="h-9 min-w-[200px] justify-between border text-sm font-medium"
          disabled={loading}
          data-testid="week-selector"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            {selectedLabel}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {weeks.map((week, idx) => (
          <DropdownMenuItem
            key={week.week_start}
            onClick={() => onSelect(week)}
            className={`cursor-pointer ${
              selectedWeek?.week_start === week.week_start 
                ? 'bg-primary/10 text-primary font-medium' 
                : ''
            }`}
            data-testid={`week-option-${idx}`}
          >
            <span className="flex items-center gap-2">
              {week.label}
              {week.is_current && (
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  Bu Hafta
                </span>
              )}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
