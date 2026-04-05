import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Search, Calendar } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmt(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

const PRESETS = [
  { key: "dun", label: "Dün" },
  { key: "bugun", label: "Bugün" },
  { key: "bu_hafta", label: "Bu Hafta" },
  { key: "gecen_hafta", label: "Geçen Hafta" },
  { key: "tarih_araligi", label: "Tarih Aralığı" },
];

function calcDates(preset, opening, closing) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const thisMonday = getMonday(today);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  switch (preset) {
    case "dun":
      return {
        start: `${fmt(yesterday)}T${opening}`,
        end: `${fmt(today)}T${closing}`,
      };
    case "bugun":
      return {
        start: `${fmt(today)}T${opening}`,
        end: `${fmt(tomorrow)}T${closing}`,
      };
    case "bu_hafta":
      return {
        start: `${fmt(thisMonday)}T${opening}`,
        end: `${fmt(nextMonday)}T${closing}`,
      };
    case "gecen_hafta":
      return {
        start: `${fmt(lastMonday)}T${opening}`,
        end: `${fmt(thisMonday)}T${closing}`,
      };
    default:
      return null;
  }
}

export default function RaporFiltre({ companyId, onFilter, loading, defaultPreset = "bugun" }) {
  const [activePreset, setActivePreset] = useState(defaultPreset);
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [opening, setOpening] = useState("06:00");
  const [closing, setClosing] = useState("06:00");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    axios.get(`${API}/companies/${companyId}`).then((res) => {
      if (cancelled) return;
      const c = res.data;
      const o = c?.opening_time || "06:00";
      const cl = c?.closing_time || "06:00";
      setOpening(o);
      setClosing(cl);

      const dates = calcDates(defaultPreset, o, cl);
      setStartDateTime(dates.start);
      setEndDateTime(dates.end);
      setReady(true);

      onFilter(dates.start, dates.end);
    });
    return () => { cancelled = true; };
  }, [companyId, defaultPreset]);

  const handlePreset = (key) => {
    setActivePreset(key);
    if (key === "tarih_araligi") return;
    const dates = calcDates(key, opening, closing);
    if (dates) {
      setStartDateTime(dates.start);
      setEndDateTime(dates.end);
      onFilter(dates.start, dates.end);
    }
  };

  const handleCustomFilter = () => {
    if (startDateTime && endDateTime) {
      onFilter(startDateTime, endDateTime);
    }
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={activePreset === p.key ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => handlePreset(p.key)}
              disabled={loading}
              data-testid={`filter-${p.key}`}
            >
              {p.key === "tarih_araligi" && <Calendar className="w-3 h-3 mr-1" />}
              {p.label}
            </Button>
          ))}
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
        </div>

        {activePreset === "tarih_araligi" && (
          <div className="flex flex-wrap items-end gap-2 mt-2 pt-2 border-t">
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Başlangıç</Label>
              <Input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="h-8 text-xs"
                data-testid="filter-start-date"
              />
            </div>
            <div className="min-w-[140px] flex-1 max-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Bitiş</Label>
              <Input
                type="datetime-local"
                value={endDateTime}
                onChange={(e) => setEndDateTime(e.target.value)}
                className="h-8 text-xs"
                data-testid="filter-end-date"
              />
            </div>
            <Button
              onClick={handleCustomFilter}
              disabled={loading}
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              data-testid="filter-apply-btn"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Filtrele
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
