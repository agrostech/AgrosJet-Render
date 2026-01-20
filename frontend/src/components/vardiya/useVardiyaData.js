import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const DAYS = [
  { key: "pazartesi", label: "Pzt", shortLabel: "Pt" },
  { key: "sali", label: "Sal", shortLabel: "Sa" },
  { key: "carsamba", label: "Çar", shortLabel: "Ça" },
  { key: "persembe", label: "Per", shortLabel: "Pe" },
  { key: "cuma", label: "Cum", shortLabel: "Cu" },
  { key: "cumartesi", label: "Cmt", shortLabel: "Ct" },
  { key: "pazar", label: "Paz", shortLabel: "Pa" },
];

export function useVardiyaData(companyId) {
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]);
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

  const fetchData = useCallback(async () => {
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
      if (!err.handled) {
        toast.error("Veriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchData();
  }, [companyId, fetchData]);

  const handleAddShift = async (newShift, onSuccess) => {
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
      onSuccess?.();
      fetchData();
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Vardiya eklenemedi");
      }
    }
  };

  const handleDeleteShift = async (shiftId, skipConfirm = false) => {
    if (!skipConfirm) {
      // Return a pending delete info for the component to handle confirmation
      return { needsConfirm: true, shiftId };
    }
    try {
      await axios.delete(`${API}/shifts/${shiftId}`);
      toast.success("Vardiya silindi");
      fetchData();
    } catch (err) {
      if (!err.handled) {
        toast.error("Vardiya silinemedi");
      }
    }
  };

  // Direct delete function for use after confirmation
  const confirmDeleteShift = async (shiftId) => {
    try {
      await axios.delete(`${API}/shifts/${shiftId}`);
      toast.success("Vardiya silindi");
      fetchData();
    } catch (err) {
      if (!err.handled) {
        toast.error("Vardiya silinemedi");
      }
    }
  };

  const handleAssignCourier = async (shiftId, courierId, day, onSuccess) => {
    try {
      await axios.post(`${API}/shifts/${shiftId}/assign`, {
        courier_id: courierId,
        day: day
      });
      toast.success("Kurye atandı");
      onSuccess?.();
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

  const handleAddLeave = async (courierId, day, onSuccess) => {
    try {
      await axios.post(`${API}/companies/${companyId}/leaves`, {
        courier_id: courierId,
        day: day
      });
      toast.success("İzin eklendi");
      onSuccess?.();
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

  const handleBulkAssign = async (courierId, onSuccess) => {
    if (selectedCells.length === 0) return;
    
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

    onSuccess?.();
    clearSelection();
    fetchData();

    if (successCount > 0) {
      toast.success(`${successCount} vardiyaya kurye atandı`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} vardiyaya atama başarısız (zaten atanmış olabilir)`);
    }
  };

  // Selection helpers
  const isCellSelected = (shiftId, day) => {
    return selectedCells.some(c => c.shiftId === shiftId && c.day === day);
  };

  const toggleCellSelection = (shiftId, day) => {
    setSelectedCells(prev => {
      const exists = prev.some(c => c.shiftId === shiftId && c.day === day);
      if (exists) {
        return prev.filter(c => !(c.shiftId === shiftId && c.day === day));
      } else {
        return [...prev, { shiftId, day }];
      }
    });
  };

  const clearSelection = () => {
    setSelectedCells([]);
  };

  // Data getters
  const getAssignmentsForCell = (shiftId, day) => {
    return assignments.filter(a => a.shift_id === shiftId && a.day === day);
  };

  const getLeavesForDay = (day) => {
    return leaves.filter(l => l.day === day);
  };

  const getAvailableCouriersForShift = (shiftId, day) => {
    const assignedIds = assignments
      .filter(a => a.shift_id === shiftId && a.day === day)
      .map(a => a.courier_id);
    return couriers.filter(c => !assignedIds.includes(c.id));
  };

  const getAvailableCouriersForLeave = (day) => {
    const onLeaveIds = leaves.filter(l => l.day === day).map(l => l.courier_id);
    return couriers.filter(c => !onLeaveIds.includes(c.id));
  };

  const getAvailableCouriersForBulkAssign = useCallback(() => {
    const assignedInAllCells = new Set();
    
    selectedCells.forEach(cell => {
      const cellAssignments = assignments.filter(
        a => a.shift_id === cell.shiftId && a.day === cell.day
      );
      cellAssignments.forEach(a => assignedInAllCells.add(a.courier_id));
    });

    return couriers.map(c => ({
      ...c,
      alreadyAssignedSomewhere: assignedInAllCells.has(c.id)
    }));
  }, [selectedCells, assignments, couriers]);

  return {
    // State
    shifts,
    assignments,
    leaves,
    couriers,
    loading,
    editMode,
    setEditMode,
    selectedCells,
    ctrlPressed,
    
    // Actions
    handleAddShift,
    handleDeleteShift,
    confirmDeleteShift,
    handleAssignCourier,
    handleRemoveAssignment,
    handleAddLeave,
    handleRemoveLeave,
    handleBulkAssign,
    
    // Selection
    isCellSelected,
    toggleCellSelection,
    clearSelection,
    
    // Getters
    getAssignmentsForCell,
    getLeavesForDay,
    getAvailableCouriersForShift,
    getAvailableCouriersForLeave,
    getAvailableCouriersForBulkAssign,
  };
}
