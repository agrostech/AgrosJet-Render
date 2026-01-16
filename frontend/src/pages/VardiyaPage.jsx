import { useState, useEffect, useCallback } from "react";
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
import { X, Clock, Trash2, UserPlus, Pencil, Check, Users } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const DAYS = [
  { key: "pazartesi", label: "Pzt" },
  { key: "sali", label: "Sal" },
  { key: "carsamba", label: "Çar" },
  { key: "persembe", label: "Per" },
  { key: "cuma", label: "Cum" },
  { key: "cumartesi", label: "Cmt" },
  { key: "pazar", label: "Paz" },
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
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newShift, setNewShift] = useState({ start_time: "", end_time: "" });
  // Toplu seçim için state
  const [selectedCells, setSelectedCells] = useState([]); // [{shiftId, day}]
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);

  // Ctrl tuşu takibi
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setCtrlPressed(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setCtrlPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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
    if (!window.confirm("Bu vardiyayı silmek istediğinize emin misiniz?")) return;
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
      toast.success("Kurye çıkarıldı");
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

  // Toplu seçim fonksiyonları
  const isCellSelected = (shiftId, day) => {
    return selectedCells.some(c => c.shiftId === shiftId && c.day === day);
  };

  const handleCellClick = (e, shiftId, day) => {
    if (!editMode) return;
    
    // Ctrl veya Cmd tuşu basılı ise toplu seçim modunda
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedCells(prev => {
        const exists = prev.some(c => c.shiftId === shiftId && c.day === day);
        if (exists) {
          // Zaten seçili ise kaldır
          return prev.filter(c => !(c.shiftId === shiftId && c.day === day));
        } else {
          // Seçili değilse ekle
          return [...prev, { shiftId, day }];
        }
      });
    } else {
      // Normal tıklama - tek kurye ekleme modalı aç
      const shift = shifts.find(s => s.id === shiftId);
      openAssignModal(shift, day);
    }
  };

  const clearSelection = () => {
    setSelectedCells([]);
  };

  const handleBulkAssign = async (courierId) => {
    if (selectedCells.length === 0) return;
    
    setBulkAssigning(true);
    let successCount = 0;
    let failCount = 0;

    for (const cell of selectedCells) {
      try {
        await axios.post(`${API}/shifts/${cell.shiftId}/assign`, {
          courier_id: courierId,
          day: cell.day
        });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setBulkAssigning(false);
    setShowBulkAssignModal(false);
    clearSelection();
    fetchData();

    if (successCount > 0) {
      toast.success(`${successCount} vardiyaya kurye atandı`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} vardiyaya atama başarısız (zaten atanmış olabilir)`);
    }
  };

  const getAvailableCouriersForBulkAssign = useCallback(() => {
    // Tüm seçili hücrelerde zaten atanmış olan kuryeleri bul
    const assignedInAllCells = new Set();
    
    selectedCells.forEach(cell => {
      const cellAssignments = assignments.filter(
        a => a.shift_id === cell.shiftId && a.day === cell.day
      );
      cellAssignments.forEach(a => assignedInAllCells.add(a.courier_id));
    });

    // Tüm kuryeleri döndür (zaten atanmış olanları işaretle)
    return couriers.map(c => ({
      ...c,
      alreadyAssignedSomewhere: assignedInAllCells.has(c.id)
    }));
  }, [selectedCells, assignments, couriers]);

  if (loading) return <p>Yükleniyor...</p>;

  return (
    <div data-testid="admin-vardiya-page">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">Vardiya Yönetimi</h2>
        <div className="flex gap-2 flex-wrap">
          {editMode && selectedCells.length > 0 && (
            <>
              <Button 
                onClick={() => setShowBulkAssignModal(true)} 
                size="sm" 
                className="font-semibold bg-green-600 hover:bg-green-700"
                data-testid="bulk-assign-btn"
              >
                <Users className="w-4 h-4 mr-1" />
                {selectedCells.length} Vardiyaya Kurye Ekle
              </Button>
              <Button 
                onClick={clearSelection} 
                size="sm" 
                variant="outline"
                className="font-semibold border-2"
                data-testid="clear-selection-btn"
              >
                <X className="w-4 h-4 mr-1" />
                Seçimi Temizle
              </Button>
            </>
          )}
          <Button 
            onClick={() => { setEditMode(!editMode); clearSelection(); }} 
            variant={editMode ? "default" : "outline"}
            size="sm"
            className={`font-semibold ${editMode ? "" : "border-2"}`}
            data-testid="edit-mode-btn"
          >
            {editMode ? <Check className="w-4 h-4 mr-1" /> : <Pencil className="w-4 h-4 mr-1" />}
            {editMode ? "Tamam" : "Düzenle"}
          </Button>
          {editMode && (
            <Button onClick={() => setShowAddShiftModal(true)} size="sm" className="font-semibold" data-testid="add-shift-btn">
              <Clock className="w-4 h-4 mr-1" />
              Vardiya Ekle
            </Button>
          )}
        </div>
      </div>

      {/* Toplu seçim ipucu */}
      {editMode && selectedCells.length === 0 && !ctrlPressed && (
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
          <strong>İpucu:</strong> Ctrl tuşuna basılı tutarak birden fazla vardiya kutucuğu seçebilir, ardından toplu kurye atayabilirsiniz.
        </div>
      )}
      {editMode && ctrlPressed && (
        <div className="mb-3 p-2 bg-green-50 border border-green-300 rounded text-xs text-green-700 font-medium">
          🎯 <strong>Toplu Seçim Modu Aktif</strong> - Kutucuklara tıklayarak seçin. Seçili: {selectedCells.length}
        </div>
      )}

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
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-b-2 border-primary">
                <TableHead className="font-bold text-xs min-w-[90px] bg-slate-100 p-2 border-r border-slate-300">Vardiya</TableHead>
                {DAYS.map((day, index) => (
                  <TableHead 
                    key={day.key} 
                    className={`font-bold text-xs min-w-[100px] text-center p-2 border-r border-slate-300 ${index % 2 === 0 ? 'bg-slate-100' : 'bg-slate-50'}`}
                  >
                    {day.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift, shiftIndex) => (
                <TableRow key={shift.id} className="border-b border-border hover:bg-slate-50">
                  <TableCell className="font-semibold bg-slate-100 p-2 text-xs border-r border-slate-200">
                    <div className="flex items-center gap-1">
                      <span className="whitespace-nowrap">{shift.start_time}-{shift.end_time}</span>
                      {editMode && (
                        <button
                          onClick={() => handleDeleteShift(shift.id)}
                          className="text-red-500 hover:text-red-700 ml-1"
                          title="Vardiyayı Sil"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  {DAYS.map((day, dayIndex) => {
                    const cellAssignments = getAssignmentsForCell(shift.id, day.key);
                    const isEvenColumn = dayIndex % 2 === 0;
                    const courierCount = cellAssignments.length;
                    const isSelected = isCellSelected(shift.id, day.key);
                    return (
                      <TableCell 
                        key={day.key} 
                        className={`p-1 align-top border-r border-slate-200 cursor-pointer transition-all
                          ${isEvenColumn ? 'bg-slate-50/50' : 'bg-white'}
                          ${isSelected ? 'ring-2 ring-green-500 ring-inset bg-green-50' : ''}
                          ${editMode ? 'hover:bg-blue-50' : ''}
                        `}
                        onClick={(e) => handleCellClick(e, shift.id, day.key)}
                      >
                        <div className="min-h-[32px]">
                          {/* Seçim göstergesi */}
                          {isSelected && (
                            <div className="flex justify-end mb-0.5">
                              <span className="text-[8px] bg-green-500 text-white px-1 rounded">✓ Seçili</span>
                            </div>
                          )}
                          {courierCount === 0 ? (
                            editMode && !isSelected && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openAssignModal(shift, day.key); }}
                                className="w-full text-[9px] text-muted-foreground hover:text-primary hover:bg-slate-100 py-0.5 rounded border border-dashed border-slate-300"
                                data-testid={`assign-${shift.id}-${day.key}`}
                              >
                                +
                              </button>
                            )
                          ) : (
                            <div className="space-y-0.5">
                              {/* Kurye sayısı badge */}
                              <div className="flex items-center gap-1 mb-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${courierCount > 0 ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                                  {courierCount} kişi
                                </span>
                              </div>
                              {/* Scrollable kurye listesi */}
                              <div className="max-h-[60px] overflow-y-auto space-y-0.5 scrollbar-thin">
                                {cellAssignments.map(a => (
                                  <div key={a.id} className="flex items-center justify-between bg-blue-50 px-1 py-0.5 rounded text-[9px] group">
                                    <span className="font-medium truncate" title={a.courier_name}>{a.courier_name}</span>
                                    {editMode && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleRemoveAssignment(a.id); }}
                                        className="text-red-500 hover:text-red-700 ml-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {editMode && !isSelected && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openAssignModal(shift, day.key); }}
                                  className="w-full text-[9px] text-muted-foreground hover:text-primary hover:bg-slate-100 py-0.5 rounded border border-dashed border-slate-300 mt-0.5"
                                  data-testid={`assign-${shift.id}-${day.key}`}
                                >
                                  +
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              {/* İzinliler Satırı */}
              <TableRow className="border-t-2 border-orange-300 bg-orange-50/50">
                <TableCell className="font-semibold p-2 text-xs text-orange-700 bg-orange-100 border-r border-orange-200">
                  İzinliler
                </TableCell>
                {DAYS.map((day, dayIndex) => {
                  const dayLeaves = getLeavesForDay(day.key);
                  const isEvenColumn = dayIndex % 2 === 0;
                  return (
                    <TableCell 
                      key={day.key} 
                      className={`p-1 align-top border-r border-orange-200 ${isEvenColumn ? 'bg-orange-50' : 'bg-orange-50/30'}`}
                    >
                      <div className="min-h-[32px] space-y-0.5">
                        {dayLeaves.map(l => (
                          <div key={l.id} className="flex items-center justify-between bg-orange-200 px-1.5 py-0.5 rounded text-[10px] group">
                            <span className="font-medium truncate">{l.courier_name}</span>
                            {editMode && (
                              <button
                                onClick={() => handleRemoveLeave(l.id)}
                                className="text-red-500 hover:text-red-700 ml-1"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {editMode && (
                          <button
                            onClick={() => openLeaveModal(day.key)}
                            className="w-full text-[9px] text-orange-600 hover:bg-orange-100 py-0.5 rounded border border-dashed border-orange-300"
                            data-testid={`add-leave-${day.key}`}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Vardiya Ekle Modal */}
      <Dialog open={showAddShiftModal} onOpenChange={setShowAddShiftModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Vardiya</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddShift} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Giriş</Label>
                <Input
                  type="time"
                  value={newShift.start_time}
                  onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  className="mt-1 h-10 border-2"
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Çıkış</Label>
                <Input
                  type="time"
                  value={newShift.end_time}
                  onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  className="mt-1 h-10 border-2"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-10 font-semibold" data-testid="submit-shift">
              Ekle
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kurye Ata Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              {selectedShift?.start_time}-{selectedShift?.end_time} / {DAYS.find(d => d.key === selectedDay)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {getAvailableCouriersForShift(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Atanabilecek kurye yok</p>
            ) : (
              getAvailableCouriersForShift(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAssignCourier(courier.id)}
                  className="w-full flex items-center justify-between p-2 border border-border rounded hover:bg-slate-50 hover:border-primary transition-colors text-sm"
                  data-testid={`select-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{courier.plate}</p>
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">
              {DAYS.find(d => d.key === selectedDay)?.label} - İzin Ekle
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {getAvailableCouriersForLeave(selectedDay).length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">İzin eklenebilecek kurye yok</p>
            ) : (
              getAvailableCouriersForLeave(selectedDay).map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleAddLeave(courier.id)}
                  className="w-full flex items-center justify-between p-2 border border-border rounded hover:bg-orange-50 hover:border-orange-400 transition-colors text-sm"
                  data-testid={`select-leave-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{courier.plate}</p>
                  </div>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Toplu Kurye Atama Modal */}
      <Dialog open={showBulkAssignModal} onOpenChange={setShowBulkAssignModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Toplu Kurye Atama
            </DialogTitle>
          </DialogHeader>
          <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
            <strong>{selectedCells.length} vardiya</strong> seçildi. Aşağıdan bir kurye seçerek tüm vardiyalara atayın.
          </div>
          <div className="mb-2 text-xs text-muted-foreground">
            Seçili vardiyalar:
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedCells.map((cell, idx) => {
                const shift = shifts.find(s => s.id === cell.shiftId);
                const dayLabel = DAYS.find(d => d.key === cell.day)?.label;
                return (
                  <span key={idx} className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                    {shift?.start_time}-{shift?.end_time} / {dayLabel}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {bulkAssigning ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Kuryeler atanıyor...</p>
              </div>
            ) : couriers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Kurye bulunamadı</p>
            ) : (
              getAvailableCouriersForBulkAssign().map(courier => (
                <button
                  key={courier.id}
                  onClick={() => handleBulkAssign(courier.id)}
                  className={`w-full flex items-center justify-between p-2 border rounded transition-colors text-sm
                    ${courier.alreadyAssignedSomewhere 
                      ? 'border-orange-300 bg-orange-50 hover:bg-orange-100' 
                      : 'border-border hover:bg-green-50 hover:border-green-400'
                    }`}
                  data-testid={`bulk-select-courier-${courier.id}`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{courier.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{courier.plate}</p>
                    {courier.alreadyAssignedSomewhere && (
                      <p className="text-[9px] text-orange-600">Bazı vardiyalarda zaten atanmış</p>
                    )}
                  </div>
                  <Users className="w-4 h-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
