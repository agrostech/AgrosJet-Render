import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Calendar, Clock, RefreshCw, ChevronLeft, ChevronRight, Wallet, Users, Building2, Briefcase, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationsPopover from "@/components/admin/NotificationsPopover";

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
  const [accountingSummary, setAccountingSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null); // null = bugün (default)
  const [expandedShift, setExpandedShift] = useState(null); // Mobilde genişletilmiş vardiya

  const workDay = getWorkDay();
  const activeDay = selectedDay || workDay.dayKey;
  const activeDayLabel = DAYS.find(d => d.key === activeDay)?.label || workDay.dayLabel;
  const isToday = !selectedDay || selectedDay === workDay.dayKey;

  const fetchData = async () => {
    try {
      const [shiftsRes, assignmentsRes, leavesRes, couriersRes, accountingRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/shifts`),
        axios.get(`${API}/companies/${companyId}/shift-assignments`),
        axios.get(`${API}/companies/${companyId}/leaves`),
        axios.get(`${API}/companies/${companyId}/couriers`),
        axios.get(`${API}/companies/${companyId}/accounting-summary`),
      ]);
      setShifts(shiftsRes.data);
      setAssignments(assignmentsRes.data);
      setLeaves(leavesRes.data);
      setCouriers(couriersRes.data);
      setAccountingSummary(accountingRes.data);
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
        <div className="flex gap-2 justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="border-2 font-semibold"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Yenile
          </Button>
          <NotificationsPopover companyId={companyId} />
        </div>
      </div>

      {/* Vardiya Takibi - Birleşik Kart */}
      <div className="border-2 border-border bg-white p-4 space-y-4">
        {/* Header - Başlık ve Saat */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isToday ? 'bg-primary/10' : 'bg-amber-100'}`}>
              <Calendar className={`w-5 h-5 ${isToday ? 'text-primary' : 'text-amber-600'}`} />
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg">Vardiya Takibi</h3>
              <p className="text-sm text-muted-foreground">
                {activeDayLabel} - {isToday ? formatDate(workDay.date) : 'Haftalık görünüm'}
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

        {/* Gün Seçici */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => {
              const currentIndex = DAYS.findIndex(d => d.key === activeDay);
              const prevIndex = currentIndex === 0 ? 6 : currentIndex - 1;
              setSelectedDay(DAYS[prevIndex].key === workDay.dayKey ? null : DAYS[prevIndex].key);
            }}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-500" />
          </button>
          
          <div className="flex-1 grid grid-cols-7 gap-1">
            {DAYS.map((day, index) => {
              const isActive = activeDay === day.key;
              const isTodayDay = workDay.dayKey === day.key;
              
              // Calculate the date for this day of the week
              const todayIndex = DAYS.findIndex(d => d.key === workDay.dayKey);
              const diff = index - todayIndex;
              const dayDate = new Date(workDay.date);
              dayDate.setDate(dayDate.getDate() + diff);
              const dayOfMonth = dayDate.getDate();
              
              // Gün kısaltmaları - manuel tanımlı
              const dayAbbreviations = {
                'pazartesi': 'Pzt',
                'sali': 'Sal',
                'carsamba': 'Çar',
                'persembe': 'Per',
                'cuma': 'Cum',
                'cumartesi': 'Cmt',
                'pazar': 'Paz'
              };
              const dayAbbr = dayAbbreviations[day.key];
              
              return (
                <button
                  key={day.key}
                  onClick={() => setSelectedDay(day.key === workDay.dayKey ? null : day.key)}
                  className={`flex flex-col items-center py-2 px-1 rounded-lg transition-all ${
                    isActive 
                      ? 'bg-primary text-white shadow-md scale-105' 
                      : isTodayDay
                        ? 'bg-primary/10 text-primary hover:bg-primary/20 ring-2 ring-primary/30'
                        : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                    {dayAbbr}
                  </span>
                  <span className={`text-sm font-bold ${isActive ? '' : isTodayDay ? 'text-primary' : ''}`}>
                    {dayOfMonth}
                  </span>
                  {isTodayDay && !isActive && (
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-0.5"></span>
                  )}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => {
              const currentIndex = DAYS.findIndex(d => d.key === activeDay);
              const nextIndex = currentIndex === 6 ? 0 : currentIndex + 1;
              setSelectedDay(DAYS[nextIndex].key === workDay.dayKey ? null : DAYS[nextIndex].key);
            }}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Shift Details */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Vardiyalar
          </h4>
          {sortedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Henüz vardiya eklenmemiş
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
              {sortedShifts.map(shift => {
                const shiftAssignments = getShiftAssignments(shift.id);
                const isActive = isToday && isShiftActive(shift);
                const courierCount = shiftAssignments.length;
                const isExpanded = expandedShift === shift.id;
                
                return (
                  <div 
                    key={shift.id} 
                    className={`rounded-lg border transition-colors ${
                      isActive 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {/* Compact Header - Always visible */}
                    <div 
                      className={`flex items-center justify-between p-2 sm:p-3 ${courierCount > 0 ? 'cursor-pointer sm:cursor-default' : ''}`}
                      onClick={() => {
                        if (courierCount > 0 && window.innerWidth < 640) {
                          setExpandedShift(isExpanded ? null : shift.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-bold text-base sm:text-lg ${
                          isActive 
                            ? 'bg-green-200 text-green-800' 
                            : courierCount > 0 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-slate-200 text-slate-500'
                        }`}>
                          {courierCount}
                        </div>
                        <div>
                          <p className="font-semibold text-xs sm:text-sm">
                            {shift.start_time} - {shift.end_time}
                          </p>
                          {isActive && (
                            <span className="text-[10px] sm:text-xs text-green-700">Aktif vardiya</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Desktop: Show names inline, Mobile: Show expand button */}
                      <div className="flex items-center gap-2">
                        {/* Desktop view - inline names */}
                        <div className="hidden sm:flex flex-wrap-reverse gap-1 justify-end max-w-[200px] lg:max-w-[250px]">
                          {shiftAssignments.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            shiftAssignments.slice().reverse().map(a => (
                              <span 
                                key={a.id} 
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium truncate max-w-[80px] ${
                                  isActive 
                                    ? 'bg-green-200 text-green-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                                title={a.courier_name}
                              >
                                {a.courier_name}
                              </span>
                            ))
                          )}
                        </div>
                        
                        {/* Mobile view - expand button */}
                        {courierCount > 0 && (
                          <button 
                            className="sm:hidden p-1 rounded hover:bg-white/50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedShift(isExpanded ? null : shift.id);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Mobile Expanded Content */}
                    {isExpanded && courierCount > 0 && (
                      <div className="sm:hidden px-2 pb-2 border-t border-slate-200/50">
                        <div className="flex flex-wrap gap-1 pt-2">
                          {shiftAssignments.map(a => (
                            <span 
                              key={a.id} 
                              className={`text-[10px] px-2 py-1 rounded font-medium ${
                                isActive 
                                  ? 'bg-green-200 text-green-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {a.courier_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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

      {/* Muhasebe Özet Kartı */}
      {accountingSummary && (
        <div className="border-2 border-border bg-white p-4 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-100">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg">Muhasebe Durumu</h3>
              <p className="text-sm text-muted-foreground">Güncel bakiye özeti</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Kuryeler */}
            <div className="p-3 sm:p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between sm:justify-start sm:flex-col sm:items-start gap-2 sm:gap-0">
                <div className="flex items-center gap-2 sm:mb-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">Kuryeler</span>
                </div>
                <p className={`text-lg sm:text-xl font-bold font-mono ${
                  accountingSummary.couriers.balance > 0 
                    ? 'text-red-600' 
                    : accountingSummary.couriers.balance < 0 
                      ? 'text-green-600' 
                      : 'text-slate-800'
                }`}>
                  {accountingSummary.couriers.balance === 0 
                    ? '0 TL' 
                    : accountingSummary.couriers.balance > 0 
                      ? `-${new Intl.NumberFormat('tr-TR').format(accountingSummary.couriers.balance)} TL`
                      : `${new Intl.NumberFormat('tr-TR').format(Math.abs(accountingSummary.couriers.balance))} TL`
                  }
                </p>
              </div>
            </div>
            
            {/* İşletmeler */}
            <div className="p-3 sm:p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between sm:justify-start sm:flex-col sm:items-start gap-2 sm:gap-0">
                <div className="flex items-center gap-2 sm:mb-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">İşletmeler</span>
                </div>
                <p className={`text-lg sm:text-xl font-bold font-mono ${
                  accountingSummary.businesses.balance > 0 
                    ? 'text-red-600' 
                    : accountingSummary.businesses.balance < 0 
                      ? 'text-green-600' 
                      : 'text-slate-800'
                }`}>
                  {accountingSummary.businesses.balance === 0 
                    ? '0 TL' 
                    : accountingSummary.businesses.balance > 0 
                      ? `-${new Intl.NumberFormat('tr-TR').format(accountingSummary.businesses.balance)} TL`
                      : `${new Intl.NumberFormat('tr-TR').format(Math.abs(accountingSummary.businesses.balance))} TL`
                  }
                </p>
              </div>
            </div>
            
            {/* Cariler */}
            <div className="p-3 sm:p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between sm:justify-start sm:flex-col sm:items-start gap-2 sm:gap-0">
                <div className="flex items-center gap-2 sm:mb-2">
                  <Briefcase className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">Cariler</span>
                </div>
                <p className={`text-lg sm:text-xl font-bold font-mono ${
                  accountingSummary.vendors.balance > 0 
                    ? 'text-red-600' 
                    : accountingSummary.vendors.balance < 0 
                      ? 'text-green-600' 
                      : 'text-slate-800'
                }`}>
                  {accountingSummary.vendors.balance === 0 
                    ? '0 TL' 
                    : accountingSummary.vendors.balance > 0 
                      ? `-${new Intl.NumberFormat('tr-TR').format(accountingSummary.vendors.balance)} TL`
                      : `${new Intl.NumberFormat('tr-TR').format(Math.abs(accountingSummary.vendors.balance))} TL`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
