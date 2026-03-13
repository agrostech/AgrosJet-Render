import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

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
    "break_overtime": "Mola aşımı",
    "shift_started_not_active": "Vardiyaya geç giriş",
    "offline_before_shift_end": "Vardiyadan erken çıkış"
  };
  return labels[type] || null;
};

// Kuryeye gösterilecek ihlal tipleri
const COURIER_VIOLATION_TYPES = [
  "break_overtime",
  "shift_started_not_active", 
  "offline_before_shift_end"
];

// Bu haftanın pazartesi ve gelecek pazartesi tarihlerini al (şirket açılış saatiyle)
const getWeekRange = (openingTime = "06:00") => {
  const [hours, minutes] = openingTime.split(":").map(Number);
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(hours, minutes, 0, 0);
  
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(hours, minutes, 0, 0);
  
  return { monday, nextMonday };
};

export default function IhlalRaporu({ courierId, companyId }) {
  const [loading, setLoading] = useState(true);
  const [violations, setViolations] = useState([]);
  const [openingTime, setOpeningTime] = useState("06:00");

  const fetchViolations = async (companyOpeningTime) => {
    setLoading(true);
    try {
      const { monday, nextMonday } = getWeekRange(companyOpeningTime);
      
      const res = await axios.get(`${API}/shift-violations/${companyId}`, {
        params: {
          courier_id: courierId,
          start_date: `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`,
          end_date: `${nextMonday.getFullYear()}-${String(nextMonday.getMonth()+1).padStart(2,'0')}-${String(nextMonday.getDate()).padStart(2,'0')}`,
          limit: 100
        }
      });
      // Sadece kuryeye gösterilecek ihlal tiplerini filtrele
      const allViolations = res.data.violations || [];
      const filteredViolations = allViolations.filter(v => 
        COURIER_VIOLATION_TYPES.includes(v.violation_type)
      );
      setViolations(filteredViolations);
    } catch (err) {
      console.error("İhlal raporu yüklenemedi:", err);
      setViolations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!courierId || !companyId) return;
      
      // Şirket açılış saatini al
      try {
        const res = await axios.get(`${API}/companies/${companyId}/work-hours`);
        const companyOpeningTime = res.data.opening_time || "06:00";
        setOpeningTime(companyOpeningTime);
        await fetchViolations(companyOpeningTime);
      } catch (err) {
        console.error("Şirket bilgisi alınamadı:", err);
        await fetchViolations("06:00");
      }
    };
    
    init();
  }, [courierId, companyId]);

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-800">Bu Haftaki İhlallerin</h3>
      </div>

      {/* Özet */}
      <Card className={violations.length === 0 ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${violations.length === 0 ? 'text-green-600' : 'text-orange-600'}`} />
              <span className={`font-medium ${violations.length === 0 ? 'text-green-800' : 'text-orange-800'}`}>
                {violations.length === 0 ? 'İhlal Yok!' : 'Toplam İhlal'}
              </span>
            </div>
            <span className={`text-2xl font-bold ${violations.length === 0 ? 'text-green-600' : 'text-orange-600'}`}>
              {violations.length === 0 ? '✓' : violations.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* İhlal Listesi */}
      {violations.length > 0 && (
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
      )}
    </div>
  );
}
