import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X, Clock, Trash2, UserPlus, Pencil, Check } from "lucide-react";

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

export default function VardiyaPage({ companyId }) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newShift, setNewShift] = useState({ start_time: "", end_time: "" });

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

  const handleAddShift = async (e) => {
    e.preventDefault();
    if (!newShift.start_time || !newShift.end_time) {
      toast.error("Başlangıç ve bitiş saati gerekli");
      return;
    }
    try {
      const shiftName = `${newShift.start_time} - ${newShift.end_time}`;
      await axios.post(`${API}/companies/${companyId}/shifts`, {
        name: shiftName,
        start_time: newShift.start_time,
        end_time: newShift.end_time,
        company_id: companyId
      });
      toast.success("Vardiya eklendi");
      setShowAddShiftModal(false);
      setNewShift({ start_time: "", end_time: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Vardiya eklenemedi");
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm("Bu vardiyayı silmek istediğinize emin misiniz? Tüm atamalar da silinecek.")) return;
    try {
      await axios.delete(`${API}/shifts/${shiftId}`);
      toast.success("Vardiya silindi");
      fetchData();
    } catch (err) {
      toast.error("Vardiya silinemedi");
    }
  };

  const openAssignModal = (shift, day) => {
    setSelectedShift(shift);
    setSelectedDay(day);
    setShowAssignModal(true);
  };

  const openLeaveModal = (day) => {
    setSelectedDay(day);
    setShowLeaveModal(true);
  };

  const handleAssignCourier = async (courierId) => {
    try {
      await axios.post(`${API}/shifts/${selectedShift.id}/assign`, {
        courier_id: courierId,
        day: selectedDay
      });
      toast.success("Kurye atandı");
      setShowAssignModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Atama başarısız");
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await axios.delete(`${API}/shift-assignments/${assignmentId}`);
      toast.success("Kurye vardiyadan çıkarıldı");
      fetchData();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const handleAddLeave = async (courierId) => {
    try {
      await axios.post(`${API}/companies/${companyId}/leaves`, {
        courier_id: courierId,
        day: selectedDay
      });
      toast.success("İzin eklendi");
      setShowLeaveModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "İzin eklenemedi");
    }
  };

  const handleRemoveLeave = async (leaveId) => {
    try {
      await axios.delete(`${API}/leaves/${leaveId}`);
      toast.success("İzin kaldırıldı");
      fetchData();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const getAssignmentsForCell = (shiftId, day) => {
    return assignments.filter(a => a.shift_id === shiftId && a.day === day);
  };

  const getLeavesForDay = (day) => {
    return leaves.filter(l => l.day === day);
  };

  const getAvailableCouriersForShift = (day) => {
    const assignedIds = assignments
      .filter(a => a.shift_id === selectedShift?.id && a.day === day)
      .map(a => a.courier_id);
    return couriers.filter(c => !assignedIds.includes(c.id));
  };

  const getAvailableCouriersForLeave = (day) => {
    const onLeaveIds = leaves.filter(l => l.day === day).map(l => l.courier_id);
    return couriers.filter(c => !onLeaveIds.includes(c.id));
  };

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-vardiya-page">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Vardiya Yönetimi</h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setEditMode(!editMode)} 
            variant={editMode ? "default" : "outline"}
            className={`font-semibold ${editMode ? "" : "border-2"}`}
            data-testid="edit-mode-btn"
          >
            {editMode ? <Check className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
            {editMode ? "Tamam" : "Düzenle"}
          </Button>
          {editMode && (
            <Button onClick={() => setShowAddShiftModal(true)} className="font-semibold" data-testid="add-shift-btn">
              <Clock className="w-4 h-4 mr-2" />
              Vardiya Ekle
            </Button>
          )}
        </div>
      </div>

      {shifts.length === 0 ? (
        <div className="border-2 border-border p-8 bg-white text-center">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">Henüz vardiya eklenmemiş</p>
          <Button onClick={() => { setEditMode(true); setShowAddShiftModal(true); }} variant="outline" className="border-2">
            İlk Vardiyayı Ekle
          </Button>
        </div>
      ) : (
        <div className="border-2 border-border bg-white overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-b-2 border-primary">
                <TableHead className="font-bold text-xs min-w-[80px] bg-slate-50 p-2">Gün</TableHead>
                {shifts.map(shift => (
                  <TableHead key={shift.id} className="font-bold text-xs min-w-[120px] text-center p-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs">{shift.start_time} - {shift.end_time}</span>
                      {editMode && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteShift(shift.id)}
                          className="h-5 px-1.5 hover:bg-red-50 hover:text-red-600 text-[10px]"
                          data-testid={`delete-shift-${shift.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-0.5" />
                          Sil
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="font-bold text-xs min-w-[100px] text-center bg-orange-50 text-orange-700 p-2">
                  İzinliler
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DAYS.map(day => (
                <TableRow key={day.key} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-semibold bg-slate-50 p-2 text-xs">{day.label}</TableCell>
                  {shifts.map(shift => {
                    const cellAssignments = getAssignmentsForCell(shift.id, day.key);
                    return (
                      <TableCell key={shift.id} className="p-1.5 align-top">
                        <div className="min-h-[40px] space-y-0.5">
                          {cellAssignments.map(a => (
                            <div key={a.id} className="flex items-center justify-between bg-blue-50 px-1.5 py-0.5 rounded text-[11px] group">
                              <span className="font-medium truncate">{a.courier_name}</span>
                              {editMode && (
                                <button
                                  onClick={() => handleRemoveAssignment(a.id)}
                                  className="text-red-500 hover:text-red-700 ml-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                          {editMode && (
                            <button
                              onClick={() => openAssignModal(shift, day.key)}
                              className="w-full text-[10px] text-muted-foreground hover:text-primary hover:bg-slate-100 py-0.5 rounded border border-dashed border-slate-300"
                              data-testid={`assign-${shift.id}-${day.key}`}
                            >
                              + Ekle
                            </button>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell className="p-1.5 align-top bg-orange-50/50">
                    <div className="min-h-[40px] space-y-0.5">
                      {getLeavesForDay(day.key).map(l => (
                        <div key={l.id} className="flex items-center justify-between bg-orange-100 px-1.5 py-0.5 rounded text-[11px] group">
                          <span className="font-medium truncate">{l.courier_name}</span>
                          {editMode && (
                            <button
                              onClick={() => handleRemoveLeave(l.id)}
                              className="text-red-500 hover:text-red-700 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {editMode && (
                        <button
                          onClick={() => openLeaveModal(day.key)}
                          className="w-full text-[10px] text-muted-foreground hover:text-orange-600 hover:bg-orange-100 py-0.5 rounded border border-dashed border-orange-300"
                          data-testid={`add-leave-${day.key}`}
                        >
                          + İzin
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Vardiya Ekle Modal */}
      <Dialog open={showAddShiftModal} onOpenChange={setShowAddShiftModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Vardiya Ekle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddShift} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold">Giriş Saati</Label>
                <Input
                  type="time"
                  value={newShift.start_time}
                  onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Çıkış Saati</Label>
                <Input
                  type="time"
                  value={newShift.end_time}
                  onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  className="mt-1 h-12 border-2"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12 font-semibold" data-testid="submit-shift">
              Vardiya Ekle
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kurye Ata Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Kurye Ata</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {selectedShift?.start_time} - {selectedShift?.end_time} vardiyasına kurye seçin
            </p>
            {getAvailableCouriersForShift(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Atanabilecek kurye yok</p>
            ) : (
              getAvailableCouriersForShift(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAssignCourier(courier.id)}
                  className="w-full flex items-center justify-between p-3 border-2 border-border rounded hover:bg-slate-50 hover:border-primary transition-colors"
                  data-testid={`select-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{courier.plate}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* İzin Ekle Modal */}
      <Dialog open={showLeaveModal} onOpenChange={setShowLeaveModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">İzin Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              {DAYS.find(d => d.key === selectedDay)?.label} günü için izinli kurye seçin
            </p>
            {getAvailableCouriersForLeave(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4">İzin eklenebilecek kurye yok</p>
            ) : (
              getAvailableCouriersForLeave(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAddLeave(courier.id)}
                  className="w-full flex items-center justify-between p-3 border-2 border-border rounded hover:bg-orange-50 hover:border-orange-400 transition-colors"
                  data-testid={`select-leave-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{courier.plate}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
