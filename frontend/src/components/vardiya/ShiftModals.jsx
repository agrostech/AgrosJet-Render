import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserPlus, Users } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DAYS } from "./useVardiyaData";

// Vardiya Ekle Modal
export function AddShiftModal({ open, onOpenChange, onSubmit }) {
  const [newShift, setNewShift] = useState({ start_time: "", end_time: "" });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(newShift, () => {
      setNewShift({ start_time: "", end_time: "" });
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Yeni Vardiya</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
  );
}

// Kuryeleri alfabetik sırala
const sortCouriersAlphabetically = (courierList) => {
  if (!courierList || courierList.length === 0) return [];
  return [...courierList].sort((a, b) => {
    const nameA = (a.name || '').toLocaleLowerCase('tr');
    const nameB = (b.name || '').toLocaleLowerCase('tr');
    return nameA.localeCompare(nameB, 'tr');
  });
};

// Kurye Ata Modal
export function AssignCourierModal({ open, onOpenChange, shift, day, availableCouriers, onAssign }) {
  const dayLabel = DAYS.find(d => d.key === day)?.label;
  const sortedCouriers = sortCouriersAlphabetically(availableCouriers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">
            {shift?.start_time}-{shift?.end_time} / {dayLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {sortedCouriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">Atanabilecek kurye yok</p>
          ) : (
            sortedCouriers.map(courier => (
              <button
                key={courier.id}
                onClick={() => onAssign(courier.id)}
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
  );
}

// İzin Ekle Modal
export function AddLeaveModal({ open, onOpenChange, day, availableCouriers, onAddLeave }) {
  const dayLabel = DAYS.find(d => d.key === day)?.label;
  const sortedCouriers = sortCouriersAlphabetically(availableCouriers);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">
            {dayLabel} - İzin Ekle
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {sortedCouriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">İzin eklenebilecek kurye yok</p>
          ) : (
            sortedCouriers.map(courier => (
              <button
                key={courier.id}
                onClick={() => onAddLeave(courier.id)}
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
  );
}

// Toplu Kurye Atama Modal
export function BulkAssignModal({ 
  open, 
  onOpenChange, 
  selectedCells, 
  shifts, 
  couriers, 
  bulkAssigning, 
  onBulkAssign 
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <LoadingSpinner size="default" text="Kuryeler atanıyor..." />
            </div>
          ) : couriers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4 text-sm">Kurye bulunamadı</p>
          ) : (
            couriers.map(courier => (
              <button
                key={courier.id}
                onClick={() => onBulkAssign(courier.id)}
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
  );
}
