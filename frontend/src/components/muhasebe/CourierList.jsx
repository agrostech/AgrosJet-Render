import { useRef, useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Archive, ArchiveRestore, Search, FileWarning } from "lucide-react";
import { formatCurrency, getBalanceLabel } from "@/hooks/useAccountingTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  companyId,
}) {
  const listRef = useRef(null);
  const [pendingIds, setPendingIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/courier-invoice-obligations/pending-courier-ids/${companyId}`);
        if (!cancelled) setPendingIds(new Set(res.data.courier_ids || []));
      } catch {
        if (!cancelled) setPendingIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const filteredDisplayList = displayList.filter(c => {
    if (!listSearchQuery.trim()) return true;
    return c.name.toLowerCase().includes(listSearchQuery.toLowerCase());
  });

  // Pozitif ve negatif bakiyeleri ayrı hesapla
  const { positiveTotal, negativeTotal } = Object.values(balancesMap || {}).reduce(
    (acc, bal) => {
      if (bal > 0) acc.positiveTotal += bal;
      else if (bal < 0) acc.negativeTotal += bal;
      return acc;
    },
    { positiveTotal: 0, negativeTotal: 0 }
  );

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="Kurye ara..."
            value={listSearchQuery}
            onChange={(e) => setListSearchQuery(e.target.value)}
            className="pl-9 h-8 border border-slate-200 rounded-lg text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            data-testid="search-couriers-list"
          />
        </div>
        <div className="text-xs flex items-center gap-2">
          <span className="text-muted-foreground">Toplam:</span>
          {negativeTotal !== 0 && (
            <span className="text-red-600 font-semibold font-mono">
              {formatCurrency(negativeTotal)}
            </span>
          )}
          {positiveTotal !== 0 && (
            <span className="text-green-600 font-semibold font-mono">
              {formatCurrency(positiveTotal)}
            </span>
          )}
          {negativeTotal === 0 && positiveTotal === 0 && (
            <span className="text-muted-foreground">0 TL</span>
          )}
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    {pendingIds.has(c.id) && (
                      <FileWarning
                        className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
                        data-testid={`courier-pending-invoice-${c.id}`}
                        aria-label="Eksik veya onaylanmamış faturası var"
                      >
                        <title>Eksik veya onaylanmamış faturası var</title>
                      </FileWarning>
                    )}
                  </div>
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
