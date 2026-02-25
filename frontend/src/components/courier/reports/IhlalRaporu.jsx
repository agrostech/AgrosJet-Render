import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Calendar, Search, Clock, XCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Tarih formatla
const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

// İhlal tipi çevir
const getViolationLabel = (type) => {
  const labels = {
    "active_without_shift": "Vardiya dışı aktif",
    "offline_before_shift_end": "Erken çevrimdışı",
    "still_active_after_shift_end": "Vardiya sonrası aktif",
    "late_start": "Geç başlama",
    "early_end": "Erken bitirme"
  };
  return labels[type] || type;
};

export default function IhlalRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(false);
  const [violations, setViolations] = useState([]);
  const [startDateTime, setStartDateTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 16);
  });
  const [endDateTime, setEndDateTime] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/shift-violations/${companyId}`, {
        params: {
          courier_id: courierId,
          start_date: startDateTime.split("T")[0],
          end_date: endDateTime.split("T")[0],
          limit: 100
        }
      });
      setViolations(res.data.violations || []);
    } catch (err) {
      console.error("İhlal raporu yüklenemedi:", err);
      setViolations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courierId && companyId) {
      handleGenerate();
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Calendar className="w-4 h-4" />
          Tarih Aralığı
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Başlangıç</label>
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Bitiş</label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>
        <Button 
          onClick={handleGenerate} 
          disabled={loading} 
          className="w-full h-10 bg-orange-600 hover:bg-orange-700"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Search className="w-4 h-4 mr-2" />
          )}
          {loading ? "Yükleniyor..." : "Raporu Göster"}
        </Button>
      </div>

      {/* Özet */}
      {violations.length > 0 && (
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <span className="font-medium text-orange-800">Toplam İhlal</span>
              </div>
              <span className="text-2xl font-bold text-orange-600">{violations.length}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* İhlal Listesi */}
      {violations.length > 0 ? (
        <div className="space-y-2">
          {violations.map((v, idx) => (
            <Card key={v.id || idx} className="border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {getViolationLabel(v.violation_type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(v.created_at)}
                    </div>
                    {v.details && (
                      <p className="text-xs text-slate-600 mt-2 bg-slate-100 rounded p-2">
                        {v.details.shift_start_time && `Vardiya: ${v.details.shift_start_time} - ${v.details.shift_end_time}`}
                        {v.details.tolerance_minutes && ` (Tolerans: ${v.details.tolerance_minutes}dk)`}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !loading && (
        <div className="text-center py-8 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">İhlal bulunamadı</p>
          <p className="text-sm">Seçilen tarih aralığında ihlal kaydı yok</p>
        </div>
      )}
    </div>
  );
}
