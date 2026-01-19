import { Search, FileCheck, History, Calendar, XCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function MaliBellekTab({
  maliBellekLoading,
  selectedYearMonth,
  setSelectedYearMonth,
  monthOptions,
  maliBellekSearch,
  setMaliBellekSearch,
  maliBellekFilterCollected,
  setMaliBellekFilterCollected,
  maliBellekFilterNotCollected,
  setMaliBellekFilterNotCollected,
  filteredMaliBellekData,
  collectedCount,
  notCollectedCount,
  maliBellekAllLogs,
  toggleMaliBellek,
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Left Panel - POS List */}
      <div className="w-full lg:w-1/2 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="p-2 sm:p-3 border-b-2 border-border bg-slate-50 shrink-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
              <Select value={selectedYearMonth} onValueChange={setSelectedYearMonth}>
                <SelectTrigger className="w-28 sm:w-40 h-8 sm:h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Ay Seçin" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs ml-auto">
              <div className="flex items-center gap-1">
                <Checkbox 
                  id="maliBellekFilterCollected" 
                  checked={maliBellekFilterCollected} 
                  onCheckedChange={setMaliBellekFilterCollected}
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
                <Label htmlFor="maliBellekFilterCollected" className="text-green-600 font-medium cursor-pointer">
                  <span className="hidden sm:inline">{collectedCount} </span>Alındı
                </Label>
              </div>
              <div className="flex items-center gap-1">
                <Checkbox 
                  id="maliBellekFilterNotCollected" 
                  checked={maliBellekFilterNotCollected} 
                  onCheckedChange={setMaliBellekFilterNotCollected}
                  className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                />
                <Label htmlFor="maliBellekFilterNotCollected" className="text-orange-600 font-medium cursor-pointer">
                  <span className="hidden sm:inline">{notCollectedCount} </span>Alınmadı
                </Label>
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            <Input 
              placeholder="Ara..." 
              value={maliBellekSearch}
              onChange={(e) => setMaliBellekSearch(e.target.value)}
              className="pl-8 sm:pl-10 h-8 sm:h-10 text-xs sm:text-sm border-2"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {maliBellekLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Yükleniyor...</div>
          ) : filteredMaliBellekData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileCheck className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-sm">{maliBellekSearch ? "Arama sonucu bulunamadı" : "POS cihazı bulunamadı"}</p>
              {!maliBellekSearch && <p className="text-xs">Önce Ürünler sekmesinden POS cihazı ekleyin</p>}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredMaliBellekData.map((product) => (
                <div key={product.id} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{product.name}</p>
                      {product.assigned_to_courier_name && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded truncate max-w-[100px]">
                          {product.assigned_to_courier_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {product.pos_serial && <span className="font-mono">SN: {product.pos_serial}</span>}
                      {product.pos_terminal && <span className="font-mono">TRM: {product.pos_terminal}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleMaliBellek(product.id)}
                    className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      product.mali_bellek?.is_collected
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    }`}
                  >
                    {product.mali_bellek?.is_collected ? (
                      <><CheckCircle2 className="w-4 h-4" /> Alındı</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Alınmadı</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Monthly Logs */}
      <div className="w-full lg:w-1/2 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="p-3 border-b-2 border-border bg-slate-50 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <History className="w-4 h-4" /> İşlem Geçmişi
            </h3>
            <span className="text-xs text-muted-foreground">{maliBellekAllLogs.length} kayıt</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {maliBellekAllLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <History className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-sm">Bu dönem için işlem kaydı yok</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {maliBellekAllLogs.map((log) => (
                <div key={log.id} className="p-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`px-2 py-1 rounded text-xs font-medium shrink-0 ${
                        log.action === 'collected' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {log.action === 'collected' ? 'Alındı' : 'Kaldırıldı'}
                      </span>
                      <span className="text-sm truncate">{log.product_name}</span>
                    </div>
                    <div className="text-right shrink-0 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString('tr-TR', { 
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                    <span className="font-mono">
                      {log.pos_serial && `SN: ${log.pos_serial}`}
                      {log.pos_serial && log.pos_terminal && ' | '}
                      {log.pos_terminal && `TRM: ${log.pos_terminal}`}
                    </span>
                    <span>{log.admin_name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
