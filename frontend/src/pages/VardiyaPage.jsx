import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { X, Clock, Pencil, Check, Users, Search, PointerIcon, AlertTriangle, RefreshCw, Settings, Coffee } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";
import {
  useVardiyaData,
  ShiftGrid,
  AddShiftModal,
  AssignCourierModal,
  AddLeaveModal,
  BulkAssignModal,
  VardiyaTakibiCard,
  VardiyaIhlalleriModal,
  BreakSettingsModal,
} from "@/components/vardiya";
import { StatusMovementsModal } from "@/components/vardiya/StatusMovementsModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function VardiyaPage({ companyId, isSuperAdmin }) {
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [showIhlallerModal, setShowIhlallerModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [showBreakSettingsModal, setShowBreakSettingsModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [courierFilter, setCourierFilter] = useState("");
  
  // Vardiya silme onay modalı
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteShiftId, setPendingDeleteShiftId] = useState(null);

  // Tolerans ayarı
  const [toleranceMinutes, setToleranceMinutes] = useState(5);
  const [showToleranceInput, setShowToleranceInput] = useState(false);
  const [tempTolerance, setTempTolerance] = useState(5);
  const [toleranceLoading, setToleranceLoading] = useState(true);

  const {
    shifts,
    assignments,
    leaves,
    couriers,
    loading,
    editMode,
    setEditMode,
    selectedCells,
    ctrlPressed,
    multiSelectMode,
    handleAddShift,
    confirmDeleteShift,
    handleAssignCourier,
    handleRemoveAssignment,
    handleAddLeave,
    handleRemoveLeave,
    handleBulkAssign,
    isCellSelected,
    toggleCellSelection,
    clearSelection,
    toggleMultiSelectMode,
    getAssignmentsForCell,
    getLeavesForDay,
    getAvailableCouriersForShift,
    getAvailableCouriersForLeave,
    getAvailableCouriersForBulkAssign,
    refetch,
  } = useVardiyaData(companyId);

  // Tolerans verisini çek
  const fetchTolerance = useCallback(async () => {
    if (!companyId) return;
    try {
      const toleranceRes = await axios.get(`${API}/companies/${companyId}/shift-tolerance`);
      setToleranceMinutes(toleranceRes.data.shift_tolerance_minutes || 5);
      setTempTolerance(toleranceRes.data.shift_tolerance_minutes || 5);
    } catch (err) {
      console.error("Tolerans yüklenemedi:", err);
    } finally {
      setToleranceLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchTolerance();
  }, [fetchTolerance]);

  // Vardiya yönetimi değişikliklerinde verileri güncelle
  const refreshAll = () => {
    refetch();
  };
  
  // Tolerans güncelleme
  const handleUpdateTolerance = async () => {
    if (tempTolerance < 0 || tempTolerance > 30) {
      toast.error("Tolerans 0-30 dakika arasında olmalı");
      return;
    }
    try {
      await axios.put(`${API}/companies/${companyId}/shift-tolerance`, {
        shift_tolerance_minutes: tempTolerance
      });
      setToleranceMinutes(tempTolerance);
      setShowToleranceInput(false);
      toast.success(`Tolerans ${tempTolerance} dakika olarak güncellendi`);
    } catch (err) {
      toast.error("Tolerans güncellenemedi");
    }
  };

  // Vardiya silme işlemi
  const handleDeleteShift = (shiftId) => {
    setPendingDeleteShiftId(shiftId);
    setShowDeleteConfirm(true);
  };

  const onConfirmDeleteShift = async () => {
    if (!pendingDeleteShiftId) return;
    await confirmDeleteShift(pendingDeleteShiftId);
    setShowDeleteConfirm(false);
    setPendingDeleteShiftId(null);
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

  const handleCellClick = (e, shiftId, day) => {
    if (!editMode) return;
    
    if (multiSelectMode || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleCellSelection(shiftId, day);
    } else {
      const shift = shifts.find(s => s.id === shiftId);
      openAssignModal(shift, day);
    }
  };

  const onAssignCourier = (courierId) => {
    handleAssignCourier(selectedShift.id, courierId, selectedDay, () => {
      setShowAssignModal(false);
    });
  };

  const onAddLeave = (courierId) => {
    handleAddLeave(courierId, selectedDay, () => {
      setShowLeaveModal(false);
    });
  };

  const onBulkAssign = async (courierId) => {
    setBulkAssigning(true);
    await handleBulkAssign(courierId, () => {
      setShowBulkAssignModal(false);
    });
    setBulkAssigning(false);
  };

  if (loading) return <PageLoading />;

  return (
    <div data-testid="admin-vardiya-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h2 className="font-heading text-xl font-bold tracking-tight">Vardiya Yönetimi</h2>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Tolerans Ayarı - Sadece Süper Admin */}
          {isSuperAdmin && (
            <div className="flex items-center gap-1 text-xs">
              {showToleranceInput ? (
                <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">
                  <span className="text-slate-500">Tolerans:</span>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={tempTolerance}
                    onChange={(e) => setTempTolerance(parseInt(e.target.value) || 0)}
                    className="w-14 h-6 text-xs px-1 border"
                    data-testid="tolerance-input"
                  />
                  <span className="text-slate-500">dk</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-1"
                    onClick={handleUpdateTolerance}
                  >
                    <Check className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-1"
                    onClick={() => { setShowToleranceInput(false); setTempTolerance(toleranceMinutes); }}
                  >
                    <X className="w-3 h-3 text-red-500" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs bg-slate-100 hover:bg-slate-200"
                  onClick={() => setShowToleranceInput(true)}
                  title="Vardiya giriş/çıkış toleransı"
                  data-testid="tolerance-btn"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Tolerans: ±{toleranceMinutes} dk
                </Button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowIhlallerModal(true)}
            className="font-semibold border"
            data-testid="show-violations-btn"
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            İhlaller
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMovementsModal(true)}
            className="font-semibold border"
            data-testid="show-movements-btn"
          >
            <Clock className="w-4 h-4 mr-1" />
            Hareketler
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBreakSettingsModal(true)}
            className="font-semibold border"
            data-testid="break-settings-btn"
          >
            <Coffee className="w-4 h-4 mr-1" />
            Mola Ayarları
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshAll}
            className="border-2 font-semibold"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Yenile
          </Button>
        </div>
      </div>

      {/* Vardiya Takibi Kartı - Hook'tan gelen verilerle */}
      <VardiyaTakibiCard
        shifts={shifts}
        assignments={assignments}
        leaves={leaves}
      />

      {/* Vardiya Yönetimi Kartı */}
      <div className="border-2 border-border bg-white p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-lg">Vardiya Yönetimi</h3>
              <p className="text-sm text-muted-foreground">Vardiya ve kurye atamaları</p>
            </div>
          </div>
          
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
            {editMode && (
              <Button
                onClick={toggleMultiSelectMode}
                size="sm"
                variant={multiSelectMode ? "default" : "outline"}
                className={`font-semibold md:hidden ${multiSelectMode ? "bg-purple-600 hover:bg-purple-700" : "border-2"}`}
                data-testid="multi-select-mode-btn"
              >
                <PointerIcon className="w-4 h-4 mr-1" />
                {multiSelectMode ? "Seçim Aktif" : "Çoklu Seçim"}
              </Button>
            )}
            <Button 
              onClick={() => { setEditMode(!editMode); clearSelection(); if (multiSelectMode) toggleMultiSelectMode(); }} 
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
        {editMode && selectedCells.length === 0 && !ctrlPressed && !multiSelectMode && (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[10px] sm:text-xs text-blue-700">
            <strong>İpucu:</strong> <span className="hidden md:inline">Ctrl tuşuna basılı tutarak birden fazla vardiya kutucuğu seçebilir, ardından toplu kurye atayabilirsiniz.</span>
            <span className="md:hidden">&quot;Çoklu Seçim&quot; butonuna basarak birden fazla vardiya seçebilir, ardından toplu kurye atayabilirsiniz.</span>
          </div>
        )}
        {editMode && (ctrlPressed || multiSelectMode) && (
          <div className="p-2 bg-green-50 border border-green-300 rounded text-[10px] sm:text-xs text-green-700 font-medium">
            <strong>Toplu Seçim Aktif</strong> - Seçili: {selectedCells.length} {selectedCells.length === 0 && <span className="text-green-600">(Vardiyalara dokunarak seçim yapın)</span>}
          </div>
        )}

        {/* Kurye Filtresi */}
        <div>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Kurye adı ile filtrele..."
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="pl-9 h-9 border-2 text-sm"
              data-testid="courier-filter-input"
            />
          </div>
          {courierFilter && (
            <div className="mt-1 text-xs text-muted-foreground">
              Filtrelenen: &quot;{courierFilter}&quot; içeren kuryeler gösteriliyor
            </div>
          )}
        </div>

        {/* Grid veya Boş State */}
        {shifts.length === 0 ? (
          <div className="border border-slate-200 rounded-lg p-8 bg-slate-50 text-center">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">Henüz vardiya eklenmemiş</p>
            <Button onClick={() => { setEditMode(true); setShowAddShiftModal(true); }} variant="outline" className="border-2">
              İlk Vardiyayı Ekle
            </Button>
          </div>
        ) : (
          <ShiftGrid
            shifts={shifts}
            editMode={editMode}
            ctrlPressed={ctrlPressed}
            multiSelectMode={multiSelectMode}
            isCellSelected={isCellSelected}
            getAssignmentsForCell={getAssignmentsForCell}
            getLeavesForDay={getLeavesForDay}
            onCellClick={handleCellClick}
            onDeleteShift={handleDeleteShift}
            onRemoveAssignment={(assignmentId) => { handleRemoveAssignment(assignmentId); }}
            onRemoveLeave={(leaveId) => { handleRemoveLeave(leaveId); }}
            onOpenAssignModal={openAssignModal}
            onOpenLeaveModal={openLeaveModal}
            courierFilter={courierFilter}
          />
        )}
      </div>

      {/* Modals */}
      <AddShiftModal
        open={showAddShiftModal}
        onOpenChange={setShowAddShiftModal}
        onSubmit={(data) => { handleAddShift(data); }}
      />

      <AssignCourierModal
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        shift={selectedShift}
        day={selectedDay}
        availableCouriers={selectedShift ? getAvailableCouriersForShift(selectedShift.id, selectedDay) : []}
        onAssign={onAssignCourier}
      />

      <AddLeaveModal
        open={showLeaveModal}
        onOpenChange={setShowLeaveModal}
        day={selectedDay}
        availableCouriers={getAvailableCouriersForLeave(selectedDay)}
        onAddLeave={onAddLeave}
      />

      <BulkAssignModal
        open={showBulkAssignModal}
        onOpenChange={setShowBulkAssignModal}
        selectedCells={selectedCells}
        shifts={shifts}
        couriers={getAvailableCouriersForBulkAssign()}
        bulkAssigning={bulkAssigning}
        onBulkAssign={onBulkAssign}
      />

      <VardiyaIhlalleriModal
        open={showIhlallerModal}
        onOpenChange={setShowIhlallerModal}
        companyId={companyId}
        isSuperAdmin={isSuperAdmin}
      />

      <StatusMovementsModal
        open={showMovementsModal}
        onOpenChange={setShowMovementsModal}
        companyId={companyId}
      />

      {/* Mola Ayarları Modalı */}
      <BreakSettingsModal
        open={showBreakSettingsModal}
        onOpenChange={setShowBreakSettingsModal}
        companyId={companyId}
        shifts={shifts}
      />

      {/* Vardiya Silme Onay Modalı */}
      <ConfirmModal
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Vardiya Silme"
        description="Bu vardiyayı silmek istediğinize emin misiniz? Vardiyaya atanmış tüm kuryeler de silinecektir."
        onConfirm={onConfirmDeleteShift}
        variant="danger"
      />
    </div>
  );
}
