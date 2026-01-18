import { Search, History, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getActionLabel, getActionColor } from "./zimmetHelpers";

export function LogsTab({
  logs,
  filteredLogs,
  totalLogs,
  hasMoreLogs,
  searchQuery,
  setSearchQuery,
  logFilterAssigned,
  setLogFilterAssigned,
  logFilterReturned,
  setLogFilterReturned,
  logFilterDefective,
  setLogFilterDefective,
  logFilterDefectiveRemoved,
  setLogFilterDefectiveRemoved,
  logFilterLost,
  setLogFilterLost,
  logFilterLostRemoved,
  setLogFilterLostRemoved,
  logFilterDeleted,
  setLogFilterDeleted,
  loadMoreLogs,
}) {
  return (
    <div className="border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
      <div className="p-3 border-b-2 border-border bg-slate-50 shrink-0 space-y-2">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Ürün, kurye veya admin ara..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 border-2"
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {filteredLogs.length}/{totalLogs}
          </span>
        </div>
        {/* Filter checkboxes - grid on mobile */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterAssigned" checked={logFilterAssigned} onCheckedChange={setLogFilterAssigned} className="h-4 w-4" />
            <Label htmlFor="logFilterAssigned" className="text-blue-600 cursor-pointer">Zimmetlendi</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterReturned" checked={logFilterReturned} onCheckedChange={setLogFilterReturned} className="h-4 w-4" />
            <Label htmlFor="logFilterReturned" className="text-orange-600 cursor-pointer">Geri Alındı</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterDefective" checked={logFilterDefective} onCheckedChange={setLogFilterDefective} className="h-4 w-4" />
            <Label htmlFor="logFilterDefective" className="text-yellow-600 cursor-pointer">Arızalı</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterDefectiveRemoved" checked={logFilterDefectiveRemoved} onCheckedChange={setLogFilterDefectiveRemoved} className="h-4 w-4" />
            <Label htmlFor="logFilterDefectiveRemoved" className="text-green-600 cursor-pointer">Arıza Kaldır</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterLost" checked={logFilterLost} onCheckedChange={setLogFilterLost} className="h-4 w-4" />
            <Label htmlFor="logFilterLost" className="text-red-600 cursor-pointer">Kayıp</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterLostRemoved" checked={logFilterLostRemoved} onCheckedChange={setLogFilterLostRemoved} className="h-4 w-4" />
            <Label htmlFor="logFilterLostRemoved" className="text-teal-600 cursor-pointer">Kayıp Kaldır</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="logFilterDeleted" checked={logFilterDeleted} onCheckedChange={setLogFilterDeleted} className="h-4 w-4" />
            <Label htmlFor="logFilterDeleted" className="text-slate-600 cursor-pointer">Silindi</Label>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <History className="w-12 h-12 mb-2 opacity-30" />
            <p>Hareket kaydı bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-3 sm:p-4 hover:bg-slate-50">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                    <span className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${getActionColor(log.action, log.details)}`}>
                      {getActionLabel(log.action, log.details)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{log.product_name}</p>
                      {log.courier_name && (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <User className="w-3 h-3" /> {log.courier_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0 text-xs text-muted-foreground">
                    <p>
                      {new Date(log.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-slate-500">{log.admin_name}</p>
                  </div>
                </div>
                {/* Details */}
                <div className="mt-2 text-xs text-slate-500 font-mono flex flex-wrap gap-x-2">
                  {log.details?.product_type && <span>Tip: {log.details.product_type}</span>}
                  {log.details?.serial_number && <span>SN: {log.details.serial_number}</span>}
                  {log.details?.pos_serial && <span>SN: {log.details.pos_serial}</span>}
                  {log.details?.pos_terminal && <span>TRM: {log.details.pos_terminal}</span>}
                  {log.details?.changes && <span className="text-slate-600">{log.details.changes}</span>}
                  {log.details?.notes && <span className="italic text-slate-600">&quot;{log.details.notes}&quot;</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {hasMoreLogs && (
          <div className="p-4 text-center">
            <Button variant="outline" onClick={loadMoreLogs} className="h-10">
              Daha Fazla Yükle ({totalLogs - logs.length} kaldı)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
