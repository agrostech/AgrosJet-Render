import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, FileText, AlertTriangle, Info, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INTEGRATIONS = [
  { key: "", label: "Tümü" },
  { key: "migros", label: "Migros" },
  { key: "getir", label: "Getir" },
  { key: "trendyol", label: "Trendyol" },
  { key: "adisyo", label: "Adisyo" },
  { key: "sepettakip", label: "SepetTakip" },
  { key: "yemeksepeti", label: "Yemeksepeti" },
  { key: "firebase", label: "Firebase" },
];

function LogLevel({ level }) {
  if (level === "ERROR")
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">ERROR</span>;
  if (level === "WARNING")
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">WARN</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">INFO</span>;
}

export default function IntegrationLogsModal({ open, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [total, setTotal] = useState(0);

  const fetchLogs = async (integration) => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (integration) params.integration = integration;
      const res = await axios.get(`${API}/integration-logs`, { params });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Log alınamadı:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLogs(filter);
  }, [open, filter]);

  const handleFilterChange = (key) => {
    setFilter(key);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Entegrasyon Logları
            {total > 0 && <span className="text-xs text-muted-foreground font-normal">({total})</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Filter buttons */}
        <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b">
          {INTEGRATIONS.map((i) => (
            <Button
              key={i.key}
              variant={filter === i.key ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => handleFilterChange(i.key)}
              data-testid={`log-filter-${i.key || "all"}`}
            >
              {i.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] ml-auto"
            onClick={() => fetchLogs(filter)}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </Button>
        </div>

        {/* Logs list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Info className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-xs">Log bulunamadı</p>
            </div>
          )}

          {!loading && logs.map((log, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 px-2 py-1 rounded hover:bg-muted/40 ${
                log.level === "ERROR" ? "bg-red-50/50" : ""
              }`}
            >
              <span className="text-muted-foreground shrink-0 w-[120px]">
                {log.timestamp}
              </span>
              <LogLevel level={log.level} />
              <span className="break-all whitespace-pre-wrap leading-relaxed">
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
