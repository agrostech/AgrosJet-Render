import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Minus, User, Trash2, Archive, ArchiveRestore, Search, Download, Clock } from "lucide-react";
import { 
  useAccountingTab, 
  formatMoney, 
  formatCurrency, 
  formatDate, 
  getLocalDateTimeString 
} from "@/hooks/useAccountingTab";

export default function KuryelerTab({ companyId, adminId, adminName, companyLogo, companyName, transactionRef, onSelect }) {
  const listRef = useRef(null);
  
  const {
    displayList,
    showArchived,
    setShowArchived,
    selectedEntity,
    loading,
    filteredTransactions,
    totalCount,
    hasMore,
    loadingMore,
    balance,
    balancesMap,
    totalBalance,
    amount,
    setAmount,
    description,
    setDescription,
    isHakedis,
    setIsHakedis,
    submitting,
    useCustomDate,
    setUseCustomDate,
    txDate,
    setTxDate,
    searchQuery,
    setSearchQuery,
    handleSelect,
    handlePayment,
    handleDeleteTransaction,
    handleArchive,
    loadMore,
    exportPDF,
    getDateDisplayText,
    getBalanceLabel,
  } = useAccountingTab({
    entityType: "courier",
    companyId,
    adminId,
    adminName,
    companyLogo,
    companyName,
    onSelect,
  });

  if (loading) return <p className="p-4">Yükleniyor...</p>;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full" ref={transactionRef}>
      {/* Sol Panel - Kurye Listesi */}
      <div className="w-full lg:w-72 flex-shrink-0 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-bold text-sm flex items-center gap-2">
              <User className="w-4 h-4" />
              Kuryeler ({displayList.length})
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
          <div className="text-xs text-muted-foreground">
            Toplam: <span className={totalBalance > 0 ? 'text-red-600 font-semibold' : totalBalance < 0 ? 'text-green-600 font-semibold' : ''}>
              {totalBalance === 0 ? '0 TL' : totalBalance > 0 ? `-${formatCurrency(totalBalance)}` : formatCurrency(totalBalance)}
            </span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto" ref={listRef}>
          {displayList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {showArchived ? "Arşivlenmiş kurye yok" : "Kurye bulunamadı"}
            </p>
          ) : (
            displayList.map((c) => {
              const bal = balancesMap[c.id];
              const balLabel = getBalanceLabel(bal);
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c)}
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
                  <p className="text-xs text-muted-foreground font-mono">{c.phone}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sağ Panel - İşlemler */}
      <div className="flex-1 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        {selectedEntity ? (
          <>
            {/* Header */}
            <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold">{selectedEntity.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{selectedEntity.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-right px-3 py-1.5 rounded ${balance > 0 ? 'bg-red-50' : balance < 0 ? 'bg-green-50' : 'bg-slate-100'}`}>
                    <p className="text-xs text-muted-foreground">Bakiye</p>
                    <p className={`font-bold font-mono ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : ''}`}>
                      {balance === 0 ? '0 TL' : balance > 0 ? `-${formatMoney(balance)}` : formatMoney(balance)}
                    </p>
                  </div>
                  {!showArchived && (
                    <Button variant="outline" size="sm" onClick={() => handleArchive(selectedEntity.id)} className="h-9 border-2" data-testid="archive-courier-btn">
                      <Archive className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Ödeme Formu */}
            {!showArchived && (
              <div className="p-3 border-b-2 border-border bg-white flex-shrink-0">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs font-semibold mb-1 block">Tutar</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      className="h-10 border-2 font-mono"
                      placeholder="0.00"
                      data-testid="amount-input"
                    />
                  </div>
                  <div className="flex-[2] min-w-[150px]">
                    <Label className="text-xs font-semibold mb-1 block">Açıklama</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-10 border-2"
                      placeholder="İsteğe bağlı"
                      data-testid="description-input"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded h-10">
                      <Checkbox
                        id="hakedis"
                        checked={isHakedis}
                        onCheckedChange={setIsHakedis}
                        data-testid="hakedis-checkbox"
                      />
                      <Label htmlFor="hakedis" className="text-xs font-medium cursor-pointer">Hakediş</Label>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!useCustomDate) setTxDate(getLocalDateTimeString());
                        setUseCustomDate(!useCustomDate);
                      }}
                      className={`h-10 px-2 border-2 ${useCustomDate ? 'bg-orange-50 border-orange-300' : ''}`}
                      title="Özel tarih seç"
                      data-testid="custom-date-toggle"
                    >
                      <Clock className="w-4 h-4" />
                      <span className="ml-1 text-xs">{getDateDisplayText()}</span>
                    </Button>
                  </div>
                  <Button onClick={() => handlePayment("in")} disabled={submitting} className="h-10 bg-red-600 hover:bg-red-700" data-testid="payment-out-btn">
                    <Minus className="w-4 h-4 mr-1" />
                    Verilen
                  </Button>
                  <Button onClick={() => handlePayment("out")} disabled={submitting} className="h-10 bg-green-600 hover:bg-green-700" data-testid="payment-in-btn">
                    <Plus className="w-4 h-4 mr-1" />
                    Alınan
                  </Button>
                </div>
                {useCustomDate && (
                  <div className="mt-2">
                    <Input
                      type="datetime-local"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="h-9 border-2 text-sm w-auto"
                      data-testid="custom-date-input"
                    />
                  </div>
                )}
              </div>
            )}

            {/* İşlem Geçmişi */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-2 border-b border-border bg-slate-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">İşlem Geçmişi ({totalCount})</span>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ara..."
                      className="h-7 pl-7 text-xs w-32 border"
                      data-testid="search-transactions"
                    />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={exportPDF} className="h-7 text-xs border" data-testid="export-pdf-btn">
                  <Download className="w-3 h-3 mr-1" />
                  PDF
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {filteredTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {searchQuery ? "Arama sonucu bulunamadı" : "İşlem bulunamadı"}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold text-xs">Tarih</th>
                        <th className="text-left p-2 font-semibold text-xs">Açıklama</th>
                        <th className="text-right p-2 font-semibold text-xs">Tutar</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-border hover:bg-slate-50">
                          <td className="p-2 text-xs font-mono whitespace-nowrap">{formatDate(tx.created_at)}</td>
                          <td className="p-2 text-xs">
                            {tx.description}
                            {tx.is_hakedis && <span className="ml-1 px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">Hakediş</span>}
                          </td>
                          <td className={`p-2 text-xs font-mono text-right font-semibold ${tx.type === 'payment_out' ? 'text-red-600' : 'text-green-600'}`}>
                            {tx.type === 'payment_out' ? '-' : ''}{formatMoney(tx.amount)}
                          </td>
                          <td className="p-1">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteTransaction(tx.id)} className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600" data-testid={`delete-tx-${tx.id}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                
                {hasMore && (
                  <div className="p-3 text-center">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="text-xs" data-testid="load-more-btn">
                      {loadingMore ? "Yükleniyor..." : "Daha Fazla Yükle"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Kurye seçin</p>
          </div>
        )}
      </div>
    </div>
  );
}
