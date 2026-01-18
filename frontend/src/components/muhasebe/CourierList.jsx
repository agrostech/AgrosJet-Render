import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Archive, ArchiveRestore, Search } from "lucide-react";
import { formatCurrency, getBalanceLabel } from "@/hooks/useAccountingTab";

export default function CourierList({
  displayList,
  showArchived,
  setShowArchived,
  selectedEntity,
  totalBalance,
  balancesMap,
  listSearchQuery,
  setListSearchQuery,
  onSelect,
}) {
  const listRef = useRef(null);

  const filteredDisplayList = displayList.filter(c => {
    if (!listSearchQuery.trim()) return true;
    return c.name.toLowerCase().includes(listSearchQuery.toLowerCase());
  });

  return (
    <div className="w-full lg:w-80 flex-shrink-0 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
      <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading font-bold text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Kuryeler ({filteredDisplayList.length})
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowArchived(!showArchived)}
            className={`text-xs h-7 px-2 ${showArchived ? 'bg-orange-100 text-orange-700' : ''}`}
            data-testid="toggle-archived-couriers"
          >
            {showArchived ? <ArchiveRestore className="w-3 h-3 mr-1" /> : <Archive className="w-3 h-3 mr-1" />}
            {showArchived ? "Aktif" : "Arşiv"}
          </Button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Kurye ara..."
            value={listSearchQuery}
            onChange={(e) => setListSearchQuery(e.target.value)}
            className="pl-10 h-9 border-2"
            data-testid="search-couriers-list"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Toplam: <span className={totalBalance > 0 ? 'text-red-600 font-semibold' : totalBalance < 0 ? 'text-green-600 font-semibold' : ''}>
            {totalBalance === 0 ? '0 TL' : totalBalance > 0 ? `-${formatCurrency(totalBalance)}` : formatCurrency(totalBalance)}
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        {filteredDisplayList.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            {listSearchQuery ? "Arama sonucu bulunamadı" : showArchived ? "Arşivlenmiş kurye yok" : "Kurye bulunamadı"}
          </p>
        ) : (
          filteredDisplayList.map((c) => {
            const bal = balancesMap[c.id];
            const balLabel = getBalanceLabel(bal);
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                className={`p-3 border-b border-border cursor-pointer transition-colors ${selectedEntity?.id === c.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"}`}
                data-testid={`courier-item-${c.id}`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  {balLabel && (
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${balLabel.color}`}>
                      {balLabel.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
