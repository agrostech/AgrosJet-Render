import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Clock, Calendar, CheckCircle, XCircle } from "lucide-react";

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

export default function CourierVardiyalarPage({ courierId, companyId }) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        toast.error("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    if (companyId) fetchData();
  }, [companyId]);

  // Filter assignments for this courier
  const myAssignments = assignments.filter(a => a.courier_id === courierId);
  const myLeaves = leaves.filter(l => l.courier_id === courierId);

  // Get current day
  const today = new Date();
  const dayIndex = today.getDay();
  const currentDayKey = DAYS[(dayIndex + 6) % 7].key; // Convert Sunday=0 to Monday=0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="courier-vardiyalar-page">
      {/* Header */}
      <div className="border-2 border-border bg-white p-4">
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

      {/* Weekly Schedule */}
      <div className="border-2 border-border bg-white">
        <div className="p-4 border-b-2 border-border">
          <h3 className="font-semibold">Haftalık Program</h3>
        </div>
        <div className="divide-y divide-border">
          {DAYS.map((day) => {
            const isToday = day.key === currentDayKey;
            const dayAssignments = myAssignments.filter(a => a.day === day.key);
            const hasLeave = myLeaves.some(l => l.days?.includes(day.key));
            
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
                      {hasLeave ? (
                        <p className="text-sm text-orange-600 font-medium">İzinli</p>
                      ) : dayAssignments.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dayAssignments.map(a => {
                            const shift = shifts.find(s => s.id === a.shift_id);
                            return shift ? (
                              <span 
                                key={a.id} 
                                className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded font-medium"
                              >
                                {shift.name} ({shift.start_time} - {shift.end_time})
                              </span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Vardiya atanmamış</p>
                      )}
                    </div>
                  </div>
                  <div>
                    {hasLeave ? (
                      <XCircle className="w-6 h-6 text-orange-500" />
                    ) : dayAssignments.length > 0 ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-200" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border-2 border-border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-semibold">Aktif Vardiya</span>
          </div>
          <p className="text-2xl font-bold">{myAssignments.length}</p>
          <p className="text-xs text-muted-foreground">Bu hafta</p>
        </div>
        <div className="border-2 border-border bg-white p-4">
          <div className="flex items-center gap-2 text-orange-600 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-semibold">İzin Günleri</span>
          </div>
          <p className="text-2xl font-bold">{myLeaves.reduce((sum, l) => sum + (l.days?.length || 0), 0)}</p>
          <p className="text-xs text-muted-foreground">Tanımlı</p>
        </div>
      </div>
    </div>
  );
}
