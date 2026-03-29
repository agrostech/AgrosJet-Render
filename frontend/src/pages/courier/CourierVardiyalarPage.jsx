import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Clock, CheckCircle, Coffee, AlertTriangle, MinusCircle } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DAYS = [
  { key: "pazartesi", label: "Pazartesi", short: "Pzt" },
  { key: "sali", label: "Salı", short: "Sal" },
  { key: "carsamba", label: "Çarşamba", short: "Çar" },
  { key: "persembe", label: "Perşembe", short: "Per" },
  { key: "cuma", label: "Cuma", short: "Cum" },
  { key: "cumartesi", label: "Cumartesi", short: "Cmt" },
  { key: "pazar", label: "Pazar", short: "Paz" },
];

// Convert time string (HH:MM) to minutes since 06:00 (day start)
const timeToMinutesSince0600 = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  // 06:00 = 0, 07:00 = 60, ..., 05:59 = 1439
  let mins = (hours - 6) * 60 + minutes;
  if (mins < 0) mins += 24 * 60; // Handle times before 06:00 (e.g., 00:00-05:59)
  return mins;
};

// Merge consecutive shifts into time ranges
const mergeConsecutiveShifts = (dayAssignments, shifts) => {
  if (dayAssignments.length === 0) return [];
  
  // Get shift times for each assignment
  const shiftTimes = dayAssignments.map(a => {
    const shift = shifts.find(s => s.id === a.shift_id);
    return shift ? { start: shift.start_time, end: shift.end_time } : null;
  }).filter(Boolean);
  
  if (shiftTimes.length === 0) return [];
  
  // Sort by start time using 06:00 rule
  shiftTimes.sort((a, b) => timeToMinutesSince0600(a.start) - timeToMinutesSince0600(b.start));
  
  // Merge consecutive shifts
  const merged = [];
  let current = { ...shiftTimes[0] };
  
  for (let i = 1; i < shiftTimes.length; i++) {
    const next = shiftTimes[i];
    // If current end equals next start, merge them
    if (current.end === next.start) {
      current.end = next.end;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  
  return merged;
};

export default function CourierVardiyalarPage({ courierId, companyId }) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [terminationInfo, setTerminationInfo] = useState(null);

  useEffect(() => {
    if (!companyId || !courierId) return;
    const fetchData = async () => {
      try {
        const [shiftsRes, assignmentsRes, leavesRes] = await Promise.all([
          axios.get(`${API}/companies/${companyId}/shifts`),
          axios.get(`${API}/companies/${companyId}/shift-assignments`),
          axios.get(`${API}/companies/${companyId}/leaves`),
        ]);
        setShifts(shiftsRes.data);
        setAssignments(assignmentsRes.data);
        setLeaves(leavesRes.data);
      } catch (err) {
        // Eğer hata axiosConfig'de handle edilmediyse göster
        if (!err.handled) {
          toast.error("Veriler yüklenemedi");
        }
      } finally {
        setLoading(false);
      }
    };

    const fetchTerminationStatus = async () => {
      try {
        const res = await axios.get(`${API}/couriers/${courierId}/termination-status?company_id=${companyId}`);
        if (res.data.has_termination) {
          setTerminationInfo(res.data);
        }
      } catch (err) {
        console.error("Fesih durumu alınamadı");
      }
    };

    if (companyId) {
      fetchData();
      fetchTerminationStatus();
    }
  }, [companyId, courierId]);

  // Filter assignments for this courier
  const myAssignments = assignments.filter(a => a.courier_id === courierId);
  const myLeaves = leaves.filter(l => l.courier_id === courierId);

  // Get current day
  const today = new Date();
  const dayIndex = today.getDay();
  const currentDayKey = DAYS[(dayIndex + 6) % 7].key; // Convert Sunday=0 to Monday=0

  if (!companyId) {
    return <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Şirket bilgisi yükleniyor...</div>;
  }

  if (loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4" data-testid="courier-vardiyalar-page">
      {/* Termination Warning */}
      {terminationInfo && (
        <div className="border-2 border-orange-400 bg-orange-50 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-100">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-orange-800">FESİH SÜRENİZ BAŞLATILDI</h3>
              <p className="text-sm text-orange-700">
                Kalan süre: <span className="font-bold">{terminationInfo.remaining_days} gün</span>
              </p>
              <p className="text-xs text-orange-600 mt-1">
                Bu süreçte eski performansınızı göstermemek veya diğer kuryelerle dedikodu yapmak yasal yaptırımlara sebep olabilir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Schedule */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-xl">Vardiyalarım</h2>
              <p className="text-sm text-muted-foreground">Haftalık çalışma programınız</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border">
          {DAYS.map((day) => {
            const isToday = day.key === currentDayKey;
            const dayAssignments = myAssignments.filter(a => a.day === day.key);
            const hasLeave = myLeaves.some(l => l.day === day.key);
            
            // Check if explicitly on leave vs no shift assigned
            const isOnLeave = hasLeave;
            const hasNoShift = dayAssignments.length === 0 && !hasLeave;
            
            // Merge consecutive shifts
            const mergedShifts = mergeConsecutiveShifts(dayAssignments, shifts);
            
            return (
              <div 
                key={day.key} 
                className={`p-4 ${isToday ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                      isToday ? 'bg-primary text-white' : 'bg-slate-100'
                    }`}>
                      <span className="text-[10px] font-semibold uppercase">{day.short}</span>
                      <span className="text-sm font-bold">{isToday ? 'Bugün' : ''}</span>
                    </div>
                    <div>
                      <p className={`font-semibold ${isToday ? 'text-primary' : ''}`}>{day.label}</p>
                      {isOnLeave ? (
                        <p className="text-sm text-orange-600 font-medium">İzinli</p>
                      ) : hasNoShift ? (
                        <p className="text-sm text-slate-400 font-medium">Vardiya atanmamış</p>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {mergedShifts.map((range, idx) => (
                            <span 
                              key={idx} 
                              className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded font-medium"
                            >
                              {range.start} - {range.end}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    {isOnLeave ? (
                      <Coffee className="w-6 h-6 text-orange-500" />
                    ) : hasNoShift ? (
                      <MinusCircle className="w-6 h-6 text-slate-400" />
                    ) : (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
