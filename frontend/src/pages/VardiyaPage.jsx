import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Clock, Pencil, Check, Users, Search, PointerIcon } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";
import {
  useVardiyaData,
  ShiftGrid,
  AddShiftModal,
  AssignCourierModal,
  AddLeaveModal,
  BulkAssignModal,
} from "@/components/vardiya";

export default function VardiyaPage({ companyId }) {
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [courierFilter, setCourierFilter] = useState("");

  const {
    shifts,
    couriers,
    loading,
    editMode,
    setEditMode,
    selectedCells,
    ctrlPressed,
    multiSelectMode,
    handleAddShift,
    handleDeleteShift,
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
  } = useVardiyaData(companyId);

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
    
    // Çoklu seçim modu aktifse veya CTRL tuşu basılıysa
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
    <div data-testid="admin-vardiya-page">
      {/* Header */}
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
          {/* Mobilde Çoklu Seçim Modu Butonu */}
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
        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-[10px] sm:text-xs text-blue-700">
          <strong>İpucu:</strong> <span className="hidden md:inline">Ctrl tuşuna basılı tutarak birden fazla vardiya kutucuğu seçebilir, ardından toplu kurye atayabilirsiniz.</span>
          <span className="md:hidden">&quot;Çoklu Seçim&quot; butonuna basarak birden fazla vardiya seçebilir, ardından toplu kurye atayabilirsiniz.</span>
        </div>
      )}
      {editMode && (ctrlPressed || multiSelectMode) && (
        <div className="mb-3 p-2 bg-green-50 border border-green-300 rounded text-[10px] sm:text-xs text-green-700 font-medium">
          <strong>Toplu Seçim Aktif</strong> - Seçili: {selectedCells.length} {selectedCells.length === 0 && <span className="text-green-600">(Vardiyalara dokunarak seçim yapın)</span>}
        </div>
      )}

      {/* Kurye Filtresi */}
      <div className="mb-3">
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
        <div className="border-2 border-border p-8 bg-white text-center">
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
          onRemoveAssignment={handleRemoveAssignment}
          onRemoveLeave={handleRemoveLeave}
          onOpenAssignModal={openAssignModal}
          onOpenLeaveModal={openLeaveModal}
          courierFilter={courierFilter}
        />
      )}

      {/* Modals */}
      <AddShiftModal
        open={showAddShiftModal}
        onOpenChange={setShowAddShiftModal}
        onSubmit={handleAddShift}
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
    </div>
  );
}
