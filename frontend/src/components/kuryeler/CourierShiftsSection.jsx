import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Clock, Trash2, AlertTriangle } from "lucide-react";
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
    return shift ? { start: shift.start_time, end: shift.end_time, assignmentId: a.id } : null;
  }).filter(Boolean);
  
  if (shiftTimes.length === 0) return [];
  
  shiftTimes.sort((a, b) => timeToMinutesSince0600(a.start) - timeToMinutesSince0600(b.start));
  
  const merged = [];
  let current = { start: shiftTimes[0].start, end: shiftTimes[0].end, ids: [shiftTimes[0].assignmentId] };
  
  for (let i = 1; i < shiftTimes.length; i++) {
    const next = shiftTimes[i];
    if (current.end === next.start) {
      current.end = next.end;
      current.ids.push(next.assignmentId);
    } else {
      merged.push(current);
      current = { start: next.start, end: next.end, ids: [next.assignmentId] };
    }
  }
  merged.push(current);
  
  return merged;
};

// Day configuration
const DAYS = [
  { key: "pazartesi", label: "Pazartesi", shortLabel: "Pzt" },
  { key: "sali", label: "Salı", shortLabel: "Sal" },
  { key: "carsamba", label: "Çarşamba", shortLabel: "Çar" },
  { key: "persembe", label: "Perşembe", shortLabel: "Per" },
  { key: "cuma", label: "Cuma", shortLabel: "Cum" },
  { key: "cumartesi", label: "Cumartesi", shortLabel: "Cmt" },
  { key: "pazar", label: "Pazar", shortLabel: "Paz" },
];

export default function CourierShiftsSection({ courierId, courierName, companyId }) {
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  const handleDeleteDayShifts = async (dayKey) => {
    setDeleting(dayKey);
    try {
      // Get all assignments for this day and courier
      const dayAssignments = assignments.filter(a => a.day === dayKey);
      
      // Delete each assignment
      for (const assignment of dayAssignments) {
        await axios.delete(`${API}/companies/${companyId}/shift-assignments/${assignment.id}`);
      }
      
      const dayLabel = DAYS.find(d => d.key === dayKey)?.label || dayKey;
      toast.success(`${dayLabel} vardiyaları silindi`);
      fetchData();
    } catch (err) {
      toast.error("Vardiyalar silinemedi");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  // Get leave for a specific day
  const getLeaveForDay = (dayKey) => {
    return leaves.find(l => l.day === dayKey);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // Count total assignments
  const totalAssignments = assignments.length;

  return (
    <div className="space-y-3" data-testid="courier-shifts-section">
      {/* Header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Haftalık Vardiyalar</span>
        <span className="font-medium">{totalAssignments} vardiya</span>
      </div>

      {/* Day List */}
      <div className="space-y-2">
        {DAYS.map((day) => {
          const dayAssignments = assignments.filter(a => a.day === day.key);
          const dayLeave = getLeaveForDay(day.key);
          const mergedShifts = mergeConsecutiveShifts(dayAssignments, shifts);
          const hasShifts = dayAssignments.length > 0;

          return (
            <div 
              key={day.key}
              className={`flex items-center gap-2 p-2 rounded-lg border ${
                hasShifts ? 'border-green-200 bg-green-50/50' : 
                dayLeave ? 'border-amber-200 bg-amber-50/50' : 
                'border-border bg-slate-50/50'
              }`}
            >
              {/* Day Label */}
              <div className="w-16 flex-shrink-0">
                <div className="text-xs font-semibold text-muted-foreground hidden sm:block">
                  {day.label}
                </div>
                <div className="text-xs font-semibold text-muted-foreground sm:hidden">
                  {day.shortLabel}
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

              {/* Delete Button - Only for days with shifts */}
              {hasShifts && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(day.key)}
                  disabled={deleting === day.key}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                >
                  {deleting === day.key ? (
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

      {/* Empty State */}
      {totalAssignments === 0 && leaves.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-4 border-t">
          Bu kuryeye henüz vardiya atanmamış
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Vardiyaları Sil"
        description={`${confirmDelete ? DAYS.find(d => d.key === confirmDelete)?.label : ''} günündeki tüm vardiyaları silmek istediğinize emin misiniz?`}
        onConfirm={() => handleDeleteDayShifts(confirmDelete)}
        variant="danger"
      />
    </div>
  );
}
