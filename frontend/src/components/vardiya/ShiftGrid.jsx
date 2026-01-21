import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X, Trash2 } from "lucide-react";
import { DAYS } from "./useVardiyaData";

export default function ShiftGrid({
  shifts,
  editMode,
  ctrlPressed,
  isCellSelected,
  getAssignmentsForCell,
  getLeavesForDay,
  onCellClick,
  onDeleteShift,
  onRemoveAssignment,
  onRemoveLeave,
  onOpenAssignModal,
  onOpenLeaveModal,
  courierFilter = "",
}) {
  return (
    <div className="border-2 border-border bg-white overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="border-b-2 border-primary">
            <TableHead className="font-bold text-[10px] sm:text-xs min-w-[50px] sm:min-w-[70px] md:min-w-[90px] bg-slate-200 p-1 sm:p-2 border-r-2 border-slate-400">
              <span className="hidden sm:inline">Vardiya</span>
              <span className="sm:hidden">V</span>
            </TableHead>
            {DAYS.map((day, index) => (
              <TableHead 
                key={day.key} 
                className={`font-bold text-[10px] sm:text-xs min-w-[38px] sm:min-w-[70px] md:min-w-[100px] text-center p-1 sm:p-2 border-r border-slate-300 
                  ${index % 2 === 0 ? 'bg-blue-100 text-blue-800' : 'bg-amber-50 text-amber-800'}`}
              >
                <span className="hidden sm:inline">{day.label}</span>
                <span className="sm:hidden">{day.shortLabel}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shifts.map((shift, shiftIndex) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              shiftIndex={shiftIndex}
              editMode={editMode}
              ctrlPressed={ctrlPressed}
              isCellSelected={isCellSelected}
              getAssignmentsForCell={getAssignmentsForCell}
              onCellClick={onCellClick}
              onDeleteShift={onDeleteShift}
              onRemoveAssignment={onRemoveAssignment}
              onOpenAssignModal={onOpenAssignModal}
              courierFilter={courierFilter}
            />
          ))}
          
          {/* İzinliler Satırı */}
          <LeaveRow
            editMode={editMode}
            ctrlPressed={ctrlPressed}
            getLeavesForDay={getLeavesForDay}
            onRemoveLeave={onRemoveLeave}
            onOpenLeaveModal={onOpenLeaveModal}
            courierFilter={courierFilter}
          />
        </TableBody>
      </Table>
    </div>
  );
}

function ShiftRow({
  shift,
  shiftIndex,
  editMode,
  ctrlPressed,
  isCellSelected,
  getAssignmentsForCell,
  onCellClick,
  onDeleteShift,
  onRemoveAssignment,
  onOpenAssignModal,
}) {
  const isEvenRow = shiftIndex % 2 === 0;
  const rowBgClass = isEvenRow ? 'bg-slate-50' : 'bg-white';

  return (
    <TableRow className={`border-b border-border ${rowBgClass}`}>
      <TableCell className={`font-semibold p-1 sm:p-2 text-[9px] sm:text-xs border-r-2 border-slate-400 ${isEvenRow ? 'bg-slate-200' : 'bg-slate-100'}`}>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <span className="whitespace-nowrap text-[8px] sm:text-[10px] md:text-xs">
            <span className="hidden sm:inline">{shift.start_time}-{shift.end_time}</span>
            <span className="sm:hidden">{shift.start_time?.slice(0,5)}<br/>{shift.end_time?.slice(0,5)}</span>
          </span>
          {editMode && !ctrlPressed && (
            <button
              onClick={() => onDeleteShift(shift.id)}
              className="text-red-500 hover:text-red-700 ml-0.5 sm:ml-1"
              title="Vardiyayı Sil"
            >
              <Trash2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
          )}
        </div>
      </TableCell>
      {DAYS.map((day, dayIndex) => (
        <ShiftCell
          key={day.key}
          shift={shift}
          day={day}
          dayIndex={dayIndex}
          isEvenRow={isEvenRow}
          editMode={editMode}
          ctrlPressed={ctrlPressed}
          isSelected={isCellSelected(shift.id, day.key)}
          assignments={getAssignmentsForCell(shift.id, day.key)}
          onCellClick={onCellClick}
          onRemoveAssignment={onRemoveAssignment}
          onOpenAssignModal={onOpenAssignModal}
        />
      ))}
    </TableRow>
  );
}

function ShiftCell({
  shift,
  day,
  dayIndex,
  isEvenRow,
  editMode,
  ctrlPressed,
  isSelected,
  assignments,
  onCellClick,
  onRemoveAssignment,
  onOpenAssignModal,
}) {
  const isEvenColumn = dayIndex % 2 === 0;
  const courierCount = assignments.length;
  
  const cellBg = isSelected 
    ? 'bg-green-100' 
    : isEvenColumn 
      ? (isEvenRow ? 'bg-blue-100/80' : 'bg-blue-50/60')
      : (isEvenRow ? 'bg-amber-100/60' : 'bg-amber-50/40');

  return (
    <TableCell 
      className={`p-0.5 sm:p-1 align-top border-r border-slate-300 transition-all
        ${cellBg}
        ${isSelected ? 'ring-2 ring-green-500 ring-inset' : ''}
        ${editMode ? 'cursor-pointer hover:bg-blue-200' : ''}
        ${ctrlPressed && editMode ? 'hover:ring-2 hover:ring-green-400 hover:ring-inset' : ''}
      `}
      onClick={(e) => onCellClick(e, shift.id, day.key)}
    >
      <div className="min-h-[24px] sm:min-h-[32px]">
        {/* Seçim göstergesi */}
        {isSelected && (
          <div className="flex justify-end mb-0.5">
            <span className="text-[6px] sm:text-[8px] bg-green-500 text-white px-0.5 sm:px-1 rounded">✓</span>
          </div>
        )}
        {courierCount === 0 ? (
          editMode && !isSelected && !ctrlPressed && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenAssignModal(shift, day.key); }}
              className="w-full text-[8px] sm:text-[9px] text-muted-foreground hover:text-primary hover:bg-slate-100 py-0.5 rounded border border-dashed border-slate-300"
              data-testid={`assign-${shift.id}-${day.key}`}
            >
              +
            </button>
          )
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
              <span className={`text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded ${courierCount > 0 ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                <span className="hidden sm:inline">{courierCount} kişi</span>
                <span className="sm:hidden">{courierCount}</span>
              </span>
            </div>
            <div className="max-h-[40px] sm:max-h-[60px] overflow-y-auto space-y-0.5 scrollbar-thin">
              {assignments.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-blue-50/80 px-0.5 sm:px-1 py-0.5 rounded text-[7px] sm:text-[9px] group">
                  <span className="font-medium truncate max-w-[30px] sm:max-w-none" title={a.courier_name}>{a.courier_name}</span>
                  {editMode && !ctrlPressed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveAssignment(a.id); }}
                      className="text-red-500 hover:text-red-700 ml-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {editMode && !isSelected && !ctrlPressed && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenAssignModal(shift, day.key); }}
                className="w-full text-[8px] sm:text-[9px] text-muted-foreground hover:text-primary hover:bg-slate-100 py-0.5 rounded border border-dashed border-slate-300 mt-0.5"
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
}

function LeaveRow({
  editMode,
  ctrlPressed,
  getLeavesForDay,
  onRemoveLeave,
  onOpenLeaveModal,
}) {
  return (
    <TableRow className="border-t-2 border-orange-300 bg-orange-50/50">
      <TableCell className="font-semibold p-1 sm:p-2 text-[9px] sm:text-xs text-orange-700 bg-orange-200 border-r-2 border-orange-400">
        <span className="hidden sm:inline">İzinliler</span>
        <span className="sm:hidden">İzin</span>
      </TableCell>
      {DAYS.map((day, dayIndex) => {
        const dayLeaves = getLeavesForDay(day.key);
        const isEvenColumn = dayIndex % 2 === 0;
        return (
          <TableCell 
            key={day.key} 
            className={`p-0.5 sm:p-1 align-top border-r border-orange-200 ${isEvenColumn ? 'bg-orange-100/60' : 'bg-orange-50/60'}`}
          >
            <div className="min-h-[24px] sm:min-h-[32px] space-y-0.5">
              {dayLeaves.map(l => (
                <div key={l.id} className="flex items-center justify-between bg-orange-200 px-0.5 sm:px-1.5 py-0.5 rounded text-[7px] sm:text-[10px] group">
                  <span className="font-medium truncate max-w-[30px] sm:max-w-none">{l.courier_name}</span>
                  {editMode && !ctrlPressed && (
                    <button
                      onClick={() => onRemoveLeave(l.id)}
                      className="text-red-500 hover:text-red-700 ml-0.5 sm:ml-1"
                    >
                      <X className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {editMode && !ctrlPressed && (
                <button
                  onClick={() => onOpenLeaveModal(day.key)}
                  className="w-full text-[8px] sm:text-[9px] text-orange-600 hover:bg-orange-100 py-0.5 rounded border border-dashed border-orange-300"
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
  );
}
