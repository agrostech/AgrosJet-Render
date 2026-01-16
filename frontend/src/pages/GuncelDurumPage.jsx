import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Calendar, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DAYS = [
  { key: "pazartesi", label: "Pazartesi" },
  { key: "sali", label: "Salı" },
  { key: "carsamba", label: "Çarşamba" },
  { key: "persembe", label: "Perşembe" },
  { key: "cuma", label: "Cuma" },
  { key: "cumartesi", label: "Cumartesi" },
  { key: "pazar", label: "Pazar" },
];

// Get current "work day" based on 06:00 start time
function getWorkDay() {
  const now = new Date();
  const hour = now.getHours();
  
  // If before 06:00, consider it as previous day
  let targetDate = new Date(now);
  if (hour < 6) {
    targetDate.setDate(targetDate.getDate() - 1);
  }
  
  // Get day of week (0 = Sunday, 1 = Monday, ...)
  const jsDay = targetDate.getDay();
  // Convert to our day keys (Monday = 0)
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  
  return {
    dayKey: DAYS[dayIndex].key,
    dayLabel: DAYS[dayIndex].label,
    date: targetDate,
    isNextDay: hour < 6
  };
}

function formatDate(date) {
  return date.toLocaleDateString('tr-TR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

function formatTime(date) {
  return date.toLocaleTimeString('tr-TR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Sort shifts with 06:00 as day start
function sortShifts(shifts) {
  return [...shifts].sort((a, b) => {
    const getMinutes = (time) => {
      const [h, m] = time.split(':').map(Number);
      // If before 06:00, add 24 hours for sorting
      const adjustedHour = h < 6 ? h + 24 : h;
      return adjustedHour * 60 + m;
    };
    return getMinutes(a.start_time) - getMinutes(b.start_time);
  });
}

// Check if current time is within shift hours
function isShiftActive(shift) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  const [startH, startM] = shift.start_time.split(':').map(Number);
  const [endH, endM] = shift.end_time.split(':').map(Number);
  
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  // Handle overnight shifts
  if (endMinutes <= startMinutes) {
    // Shift crosses midnight
    if (currentTotalMinutes >= startMinutes || currentTotalMinutes < endMinutes) {
      return true;
    }
  } else {
    if (currentTotalMinutes >= startMinutes && currentTotalMinutes < endMinutes) {
      return true;
    }
  }
  
  return false;
}

export default function GuncelDurumPage({ companyId }) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null); // null = bugün (default)

  const workDay = getWorkDay();
  const activeDay = selectedDay || workDay.dayKey;
  const activeDayLabel = DAYS.find(d => d.key === activeDay)?.label || workDay.dayLabel;
  const isToday = !selectedDay || selectedDay === workDay.dayKey;

  const fetchData = async () => {
    try {
      const [shiftsRes, assignmentsRes, leavesRes, couriersRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/shifts`),
        axios.get(`${API}/companies/${companyId}/shift-assignments`),
        axios.get(`${API}/companies/${companyId}/leaves`),
        axios.get(`${API}/companies/${companyId}/couriers`),
      ]);
      setShifts(shiftsRes.data);
      setAssignments(assignmentsRes.data);
      setLeaves(leavesRes.data);
      setCouriers(couriersRes.data);
    } catch (err) {
      toast.error("Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Get today's data
  const todayAssignments = assignments.filter(a => a.day === activeDay);
  const todayLeaves = leaves.filter(l => l.day === activeDay);
  const sortedShifts = sortShifts(shifts);

  // Group assignments by shift
  const getShiftAssignments = (shiftId) => {
    return todayAssignments.filter(a => a.shift_id === shiftId);
  };

  // Count totals
  const totalAssigned = todayAssignments.length;
  const totalOnLeave = todayLeaves.length;

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-guncel-page" className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">Güncel Durum</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchData}
          className="border-2 font-semibold"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Yenile
        </Button>
      </div>

      {/* Gün Seçici */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-100 rounded-lg border">
        <button
          onClick={() => setSelectedDay(null)}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            isToday ? 'bg-primary text-white' : 'bg-white hover:bg-slate-50 border'
          }`}
        >
          Bugün ({workDay.dayLabel})
        </button>
        {DAYS.map((day) => (
          day.key !== workDay.dayKey && (
            <button
              key={day.key}
              onClick={() => setSelectedDay(day.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                selectedDay === day.key ? 'bg-primary text-white' : 'bg-white hover:bg-slate-50 border'
              }`}
            >
              {day.label}
            </button>
          )
        ))}
      </div>

      {/* Günlük Rapor Kartı */}
      <div className="border-2 border-border bg-white p-4 space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isToday ? 'bg-primary/10' : 'bg-amber-100'}`}>
              <Calendar className={`w-5 h-5 ${isToday ? 'text-primary' : 'text-amber-600'}`} />
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg">{activeDayLabel}</h3>
              <p className="text-sm text-muted-foreground">
                {isToday ? formatDate(workDay.date) : 'Haftalık görünüm'}
              </p>
            </div>
          </div>
          {isToday && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono font-semibold">{formatTime(currentTime)}</span>
            </div>
          )}
        </div>

        {/* Shift Details */}
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Vardiyalar
          </h4>
          {sortedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Henüz vardiya eklenmemiş
            </p>
          ) : (
            <div className="grid gap-2">
              {sortedShifts.map(shift => {
                const shiftAssignments = getShiftAssignments(shift.id);
                const isActive = isToday && isShiftActive(shift);
                const courierCount = shiftAssignments.length;
                
                return (
                  <div 
                    key={shift.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      isActive 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                        isActive 
                          ? 'bg-green-200 text-green-800' 
                          : courierCount > 0 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-slate-200 text-slate-500'
                      }`}>
                        {courierCount}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {shift.start_time} - {shift.end_time}
                        </p>
                        {isActive && (
                          <span className="text-xs text-green-700">Aktif vardiya</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 ml-4 flex justify-end">
                      {shiftAssignments.length === 0 ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <div className="flex flex-wrap-reverse gap-1 justify-end max-w-full">
                          {shiftAssignments.slice().reverse().map(a => (
                            <span 
                              key={a.id} 
                              className={`text-[11px] px-2 py-1 rounded font-medium text-center truncate w-[100px] ${
                                isActive 
                                  ? 'bg-green-200 text-green-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                              title={a.courier_name}
                            >
                              {a.courier_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Today's Leaves */}
        {todayLeaves.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <h4 className="font-semibold text-sm text-orange-700 uppercase tracking-wide">
              Bugün İzinli
            </h4>
            <div className="flex flex-wrap gap-2">
              {todayLeaves.map(l => (
                <span 
                  key={l.id} 
                  className="text-xs px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg font-medium"
                >
                  {l.courier_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Placeholder for future cards */}
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center text-muted-foreground">
        <p className="text-sm">Diğer bilgi kartları buraya eklenecek</p>
      </div>
    </div>
  );
}
