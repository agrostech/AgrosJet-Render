import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const fmtDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export default function ReportDateFilter({ companyId, onGenerate, loading, onPresetChange }) {
  const [preset, setPreset] = useState("bugun");
  const [openingTime, setOpeningTime] = useState("06:00");
  const [closingTime, setClosingTime] = useState("06:00");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [ready, setReady] = useState(false);
  const autoFired = useRef(false);

  useEffect(() => {
    if (!companyId) return;
    const fetch = async () => {
      try {
        const res = await axios.get(`${API}/companies/${companyId}`);
        setOpeningTime(res.data?.opening_time || "06:00");
        setClosingTime(res.data?.closing_time || "06:00");
      } catch {}
      setReady(true);
    };
    fetch();
  }, [companyId]);

  const calcDates = useCallback(
    (p) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      switch (p) {
        case "dun":
          return { start: `${fmtDate(yesterday)}T${openingTime}`, end: `${fmtDate(today)}T${closingTime}` };
        case "bugun":
          return { start: `${fmtDate(today)}T${openingTime}`, end: `${fmtDate(tomorrow)}T${closingTime}` };
        case "bu-hafta": {
          const mon = getMonday(today);
          const nextMon = new Date(mon);
          nextMon.setDate(mon.getDate() + 7);
          return { start: `${fmtDate(mon)}T${openingTime}`, end: `${fmtDate(nextMon)}T${openingTime}` };
        }
        case "gecen-hafta": {
          const thisMon = getMonday(today);
          const prevMon = new Date(thisMon);
          prevMon.setDate(thisMon.getDate() - 7);
          return { start: `${fmtDate(prevMon)}T${openingTime}`, end: `${fmtDate(thisMon)}T${openingTime}` };
        }
        case "bu-ay": {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
          const nextFirstDay = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          return { start: `${fmtDate(firstDay)}T${openingTime}`, end: `${fmtDate(nextFirstDay)}T${closingTime}` };
        }
        default:
          return null;
      }
    },
    [openingTime, closingTime]
  );

  useEffect(() => {
    if (ready && !autoFired.current) {
      autoFired.current = true;
      const dates = calcDates("bugun");
      if (dates && onGenerate) {
        setManualStart(dates.start);
        setManualEnd(dates.end);
        onPresetChange?.("bugun");
        onGenerate(dates.start, dates.end);
      }
    }
  }, [ready, calcDates, onGenerate]);

  const handlePreset = (p) => {
    setPreset(p);
    onPresetChange?.(p);
    if (p === "ozel") return;
    const dates = calcDates(p);
    if (dates && onGenerate) {
      setManualStart(dates.start);
      setManualEnd(dates.end);
      onGenerate(dates.start, dates.end);
    }
  };

  const handleManualGenerate = () => {
    if (manualStart && manualEnd && onGenerate) {
      onGenerate(manualStart, manualEnd);
    }
  };

  const presets = [
    { key: "dun", label: "Dün" },
    { key: "bugun", label: "Bugün" },
    { key: "bu-hafta", label: "Bu Hafta" },
    { key: "gecen-hafta", label: "Geçen Hafta" },
    { key: "bu-ay", label: "Bu Ay" },
    { key: "ozel", label: "Tarih Aralığı" },
  ];

  return (
    <div className="space-y-2" data-testid="report-date-filter">
      {/* Preset butonları - mobilde grid, masaüstünde flex */}
      <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5">
        {presets.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            onClick={() => handlePreset(p.key)}
            disabled={loading}
            className="h-8 sm:h-7 text-xs px-2 sm:px-3 rounded-full"
            data-testid={`filter-${p.key}`}
          >
            {p.key === "ozel" && <Calendar className="w-3 h-3 mr-1" />}
            {p.label}
          </Button>
        ))}
        {loading && preset !== "ozel" && (
          <div className="flex items-center justify-center sm:ml-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Manuel tarih aralığı - mobilde dikey, masaüstünde yatay */}
      {preset === "ozel" && (
        <div className="flex flex-col sm:flex-row gap-1.5 sm:items-center">
          <Input
            type="datetime-local"
            value={manualStart}
            onChange={(e) => setManualStart(e.target.value)}
            className="h-8 text-xs w-full sm:w-auto"
            data-testid="filter-manual-start"
          />
          <span className="text-muted-foreground text-xs text-center hidden sm:block">-</span>
          <Input
            type="datetime-local"
            value={manualEnd}
            onChange={(e) => setManualEnd(e.target.value)}
            className="h-8 text-xs w-full sm:w-auto"
            data-testid="filter-manual-end"
          />
          <Button
            size="sm"
            onClick={handleManualGenerate}
            disabled={loading || !manualStart || !manualEnd}
            className="h-8 text-xs px-4 w-full sm:w-auto"
            data-testid="filter-manual-generate"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Uygula"}
          </Button>
        </div>
      )}
    </div>
  );
}
