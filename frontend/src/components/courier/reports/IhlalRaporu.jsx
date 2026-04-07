import { useState, useEffect } from "react";
import axios from "axios";
import { AlertTriangle, XCircle } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Türkiye saatini al (UTC+3) - tarayıcı timezone'undan bağımsız
const getTurkeyNow = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3 * 3600000));
};

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

const getViolationLabel = (type) => {
  const labels = {
    "break_overtime": "Mola aşımı",
    "shift_started_not_active": "Vardiyaya geç giriş",
    "offline_before_shift_end": "Vardiyadan erken çıkış",
    "package_not_confirmed": "Paketi onaylamadı",
    "still_active_after_shift_end": "Vardiya sonrası aktif kaldı",
    "active_without_shift": "Vardiyasız çevrimiçi",
    "break_limit_exceeded": "Mola limiti aşımı"
  };
  return labels[type] || type;
};

const COURIER_VIOLATION_TYPES = [
  "break_overtime",
  "shift_started_not_active",
  "offline_before_shift_end",
  "package_not_confirmed",
  "still_active_after_shift_end",
  "active_without_shift",
  "break_limit_exceeded"
];

const getWeekRange = (openingTime = "06:00") => {
  const [hours, minutes] = openingTime.split(":").map(Number);
  const now = getTurkeyNow();
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

  const fetchViolations = async (companyOpeningTime) => {
    setLoading(true);
    try {
      const { monday, nextMonday } = getWeekRange(companyOpeningTime);
      
      const res = await axios.get(`${API}/shift-violations/${companyId}`, {
        params: {
          entity_id: courierId,
          start_date: `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`,
          end_date: `${nextMonday.getFullYear()}-${String(nextMonday.getMonth()+1).padStart(2,'0')}-${String(nextMonday.getDate()).padStart(2,'0')}`,
          limit: 100
        }
      });
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
      
      try {
        const res = await axios.get(`${API}/companies/${companyId}/work-hours`);
        const companyOpeningTime = res.data.opening_time || "06:00";
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
    <div className="space-y-3">
      {/* Özet */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${violations.length === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${violations.length === 0 ? 'text-green-600' : 'text-orange-600'}`} />
          <span className={`text-sm font-medium ${violations.length === 0 ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}`}>
            Bu Hafta
          </span>
        </div>
        <span className={`text-sm font-bold ${violations.length === 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
          {violations.length === 0 ? 'İhlal yok' : `${violations.length} ihlal`}
        </span>
      </div>

      {/* İhlal Listesi */}
      {violations.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden">
          {violations.map((v, idx) => (
            <div key={v.id || idx} className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-800">
              <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{getViolationLabel(v.violation_type)}</span>
                {v.details?.shift_start_time && (
                  <span className="text-[11px] text-slate-400 ml-1.5">{v.details.shift_start_time}-{v.details.shift_end_time}</span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{formatDate(v.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
