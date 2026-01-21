import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Calendar, Clock, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Convert time to minutes since 06:00 for proper sorting
const timeToMinutesSince0600 = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  let mins = (hours - 6) * 60 + minutes;
  if (mins < 0) mins += 24 * 60;
  return mins;
};

// Merge consecutive shifts into time ranges (e.g., 11:00-12:00 + 12:00-13:00 = 11:00-13:00)
const mergeConsecutiveShifts = (dayAssignments, shifts) => {
  if (dayAssignments.length === 0) return [];
  
  const shiftTimes = dayAssignments.map(a => {
    const shift = shifts.find(s => s.id === a.shift_id);
    return shift ? { start: shift.start_time, end: shift.end_time } : null;
  }).filter(Boolean);
  
  if (shiftTimes.length === 0) return [];
  
  shiftTimes.sort((a, b) => timeToMinutesSince0600(a.start) - timeToMinutesSince0600(b.start));
  
  const merged = [];
  let current = { ...shiftTimes[0] };
  
  for (let i = 1; i < shiftTimes.length; i++) {
    const next = shiftTimes[i];
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

// Get week dates starting from Monday
const getWeekDates = (weekOffset = 0) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (weekOffset * 7));
  
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
};

const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function CourierShiftsSection({ courierId, courierName, companyId }) {
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const weekDates = getWeekDates(weekOffset);

  useEffect(() => {
    fetchData();
  }, [companyId, courierId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shiftsRes, assignmentsRes, leavesRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/shifts`),
        axios.get(`${API}/companies/${companyId}/shift-assignments`),
        axios.get(`${API}/companies/${companyId}/leaves`)
      ]);
      setShifts(shiftsRes.data);
      // Filter assignments and leaves for this courier only
      setAssignments(assignmentsRes.data.filter(a => a.courier_id === courierId));
      setLeaves(leavesRes.data.filter(l => l.courier_id === courierId));
    } catch (err) {
      toast.error("Vardiya bilgileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDayShifts = async (date) => {
    setDeleting(date);
    try {
      // Get all assignments for this date and courier
      const dayAssignments = assignments.filter(a => a.date === date);
      
      // Delete each assignment
      for (const assignment of dayAssignments) {
        await axios.delete(`${API}/companies/${companyId}/shift-assignments/${assignment.id}`);
      }
      
      toast.success(`${formatDate(date)} vardiyaları silindi`);
      fetchData();
    } catch (err) {
      toast.error("Vardiyalar silinemedi");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const isToday = (dateStr) => {
    return dateStr === new Date().toISOString().split('T')[0];
  };

  const isPast = (dateStr) => {
    return dateStr < new Date().toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-shifts-section">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setWeekOffset(w => w - 1)}
          className="h-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-sm font-medium text-center">
          {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setWeekOffset(w => w + 1)}
          className="h-8"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week Grid */}
      <div className="space-y-2">
        {weekDates.map((date, idx) => {
          const dayAssignments = assignments.filter(a => a.date === date);
          const dayLeave = leaves.find(l => l.date === date);
          const mergedShifts = mergeConsecutiveShifts(dayAssignments, shifts);
          const hasShifts = dayAssignments.length > 0;
          const past = isPast(date);
          const today = isToday(date);

          return (
            <div 
              key={date}
              className={`flex items-center gap-2 p-2 rounded-lg border ${
                today ? 'border-primary bg-primary/5' : 
                past ? 'border-border bg-slate-50/50' : 'border-border bg-white'
              }`}
            >
              {/* Day Label */}
              <div className={`w-12 text-center flex-shrink-0 ${past ? 'opacity-50' : ''}`}>
                <div className={`text-xs font-semibold ${today ? 'text-primary' : 'text-muted-foreground'}`}>
                  {dayNames[idx]}
                </div>
                <div className={`text-sm font-bold ${today ? 'text-primary' : ''}`}>
                  {new Date(date).getDate()}
                </div>
              </div>

              {/* Shift Info */}
              <div className="flex-1 min-w-0">
                {dayLeave ? (
                  <div className="flex items-center gap-1 text-amber-600 text-sm">
                    <AlertTriangle className="w-3 h-3" />
                    <span>İzinli</span>
                  </div>
                ) : mergedShifts.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {mergedShifts.map((range, i) => (
                      <span 
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium"
                      >
                        <Clock className="w-3 h-3" />
                        {range.start} - {range.end}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Vardiya yok</span>
                )}
              </div>

              {/* Delete Button - Only for days with shifts and not past */}
              {hasShifts && !past && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(date)}
                  disabled={deleting === date}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                >
                  {deleting === date ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
        Bu hafta: {assignments.filter(a => weekDates.includes(a.date)).length} vardiya
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Vardiyaları Sil"
        description={`${confirmDelete ? formatDate(confirmDelete) : ''} tarihindeki tüm vardiyaları silmek istediğinize emin misiniz?`}
        onConfirm={() => handleDeleteDayShifts(confirmDelete)}
        variant="danger"
      />
    </div>
  );
}
