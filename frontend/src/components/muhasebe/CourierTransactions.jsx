import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Archive, ArchiveRestore, Clock, Search, Download, Pencil, Trash2, CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { formatMoney, formatDate } from "@/hooks/useAccountingTab";
import CourierObligationsBanner from "./CourierObligationsBanner";

export default function CourierTransactions({
  selectedEntity,
  showArchived,
  balance,
  loadingBalance,
  amount,
  setAmount,
  description,
  setDescription,
  isHakedis,
  setIsHakedis,
  addJetpuan,
  setAddJetpuan,
  submitting,
  useCustomDate,
  setUseCustomDate,
  txDate,
  setTxDate,
  searchQuery,
  setSearchQuery,
  filteredTransactions,
  totalCount,
  hasMore,
  loadingMore,
  totalRemainingInstallments,
  transactionRef,
  getDateDisplayText,
  getLocalDateTimeString,
  handlePayment,
  handleArchive,
  handleUnarchive,
  loadMore,
  exportPDF,
  onOpenEditModal,
  onDeleteTransaction,
  onOpenInstallmentListModal,
}) {
  if (!selectedEntity) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Kurye seçin</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center justify-between sm:justify-start sm:gap-4">
            <div className="min-w-0">
              <h3 className="font-heading font-bold truncate">{selectedEntity.name}</h3>
              <p className="text-xs text-muted-foreground font-mono">{selectedEntity.phone}</p>
            </div>
            <div className={`text-right px-3 py-1.5 rounded shrink-0 ${loadingBalance ? 'bg-slate-100' : balance > 0 ? 'bg-green-50' : balance < 0 ? 'bg-red-50' : 'bg-slate-100'}`}>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Bakiye</p>
              {loadingBalance ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />
              ) : (
                <p className={`text-sm sm:text-base font-bold font-mono ${balance > 0 ? 'text-green-600' : balance < 0 ? 'text-red-600' : ''}`}>
                  {balance === 0 ? '0 TL' : balance > 0 ? `${formatMoney(balance)}` : `-${formatMoney(balance)}`}
                </p>
              )}
            </div>
          </div>
          
          {!showArchived && (
            <div className="flex items-center gap-2 justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onOpenInstallmentListModal} 
                className="h-9 border-2 relative" 
                data-testid="installment-btn"
              >
                <CreditCard className="w-4 h-4" />
                <span className="ml-1.5 text-xs sm:hidden">Taksit</span>
                {totalRemainingInstallments > 0 && (
                  <span className="absolute -top-2 -right-2 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {totalRemainingInstallments}
                  </span>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleArchive(selectedEntity.id)} className="h-9 border-2" data-testid="archive-courier-btn">
                <Archive className="w-4 h-4" />
                <span className="ml-1.5 text-xs sm:hidden">Arşiv</span>
              </Button>
            </div>
          )}
          
          {/* Arşivden Çıkar butonu - sadece arşiv görünümünde */}
          {showArchived && (
            <div className="flex items-center gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => handleUnarchive(selectedEntity.id)} className="h-9 border-2 text-green-600 hover:bg-green-50" data-testid="unarchive-courier-btn">
                <ArchiveRestore className="w-4 h-4" />
                <span className="ml-1.5 text-xs sm:hidden">Çıkar</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Fatura Yükümlülüğü Uyarısı */}
      <CourierObligationsBanner courierId={selectedEntity?.id} />

      {/* Ödeme Formu */}
      {!showArchived && (
        <PaymentForm
          amount={amount}
          setAmount={setAmount}
          description={description}
          setDescription={setDescription}
          isHakedis={isHakedis}
          setIsHakedis={setIsHakedis}
          addJetpuan={addJetpuan}
          setAddJetpuan={setAddJetpuan}
          submitting={submitting}
          useCustomDate={useCustomDate}
          setUseCustomDate={setUseCustomDate}
          txDate={txDate}
          setTxDate={setTxDate}
          getDateDisplayText={getDateDisplayText}
          getLocalDateTimeString={getLocalDateTimeString}
          handlePayment={handlePayment}
        />
      )}

      {/* İşlem Geçmişi */}
      <TransactionHistory
        filteredTransactions={filteredTransactions}
        totalCount={totalCount}
        hasMore={hasMore}
        loadingMore={loadingMore}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        transactionRef={transactionRef}
        loadMore={loadMore}
        exportPDF={exportPDF}
        onOpenEditModal={onOpenEditModal}
        onDeleteTransaction={onDeleteTransaction}
      />
    </>
  );
}

function PaymentForm({
  amount,
  setAmount,
  description,
  setDescription,
  isHakedis,
  setIsHakedis,
  addJetpuan,
  setAddJetpuan,
  submitting,
  useCustomDate,
  setUseCustomDate,
  txDate,
  setTxDate,
  getDateDisplayText,
  getLocalDateTimeString,
  handlePayment,
}) {
  return (
    <div className="p-3 border-b-2 border-border bg-white flex-shrink-0">
      <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
        <div className="flex gap-2">
          <div className="flex-1 sm:w-24 sm:flex-none">
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
          <div className="flex-1 sm:w-32 sm:flex-none">
            <Label className="text-xs font-semibold mb-1 block">Açıklama</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 border-2"
              placeholder="İsteğe bağlı"
              data-testid="description-input"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 rounded h-10">
            <Checkbox
              id="hakedis"
              checked={isHakedis}
              onCheckedChange={setIsHakedis}
              data-testid="hakedis-checkbox"
            />
            <Label htmlFor="hakedis" className="text-xs font-medium cursor-pointer">Hakediş</Label>
          </div>
          
          {/* JetPuan checkbox - only visible when Hakediş is checked */}
          {isHakedis && (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 rounded h-10 border border-purple-200">
              <Checkbox
                id="addJetpuan"
                checked={addJetpuan}
                onCheckedChange={setAddJetpuan}
                data-testid="jetpuan-checkbox"
              />
              <Label htmlFor="addJetpuan" className="text-xs font-medium cursor-pointer text-purple-700">JetPuan Ekle</Label>
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!useCustomDate) setTxDate(getLocalDateTimeString());
              setUseCustomDate(!useCustomDate);
            }}
            className={`h-10 px-3 border-2 ${useCustomDate ? 'bg-orange-50 border-orange-300' : ''}`}
            title="Özel tarih seç"
            data-testid="custom-date-toggle"
          >
            <Clock className="w-4 h-4" />
            <span className="ml-1 text-xs">{getDateDisplayText()}</span>
          </Button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => handlePayment("in")} disabled={submitting} className="flex-1 sm:flex-none h-10 bg-red-600 hover:bg-red-700" data-testid="payment-in-btn">
            Alınan
          </Button>
          <Button onClick={() => handlePayment("out")} disabled={submitting} className="flex-1 sm:flex-none h-10 bg-green-600 hover:bg-green-700" data-testid="payment-out-btn">
            Verilen
          </Button>
        </div>
      </div>
      
      {useCustomDate && (
        <div className="mt-2">
          <Input
            type="datetime-local"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            className="h-9 border-2 text-sm w-full sm:w-auto"
            data-testid="custom-date-input"
          />
        </div>
      )}
    </div>
  );
}

function TransactionHistory({
  filteredTransactions,
  totalCount,
  hasMore,
  loadingMore,
  searchQuery,
  setSearchQuery,
  transactionRef,
  loadMore,
  exportPDF,
  onOpenEditModal,
  onDeleteTransaction,
}) {
  return (
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
      
      <div className="flex-1 overflow-y-auto" ref={transactionRef}>
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
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border hover:bg-slate-50">
                  <td className="p-2 text-xs font-mono whitespace-nowrap">{formatDate(tx.created_at)}</td>
                  <td className="p-2 text-xs">
                    <div className="flex items-center gap-1">
                      {tx.description}
                      {tx.is_hakedis && <span className="ml-1 px-1 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">Hakediş</span>}
                      {tx.is_hakedis && tx.invoice_verified && (
                        <CheckCircle2 className="w-5 h-5 text-green-600 ml-1 flex-shrink-0" title="Fatura onaylandı" />
                      )}
                      {tx.installment_product_id && <span className="ml-1 px-1 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded">Taksit</span>}
                    </div>
                  </td>
                  <td className={`p-2 text-xs font-mono text-right font-semibold ${tx.type === 'payment_out' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'payment_in' ? '-' : ''}{formatMoney(tx.amount)}
                  </td>
                  <td className="p-1">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => onOpenEditModal(tx)} className="h-6 w-6 p-0 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-tx-${tx.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDeleteTransaction(tx.id, tx)} className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600" data-testid={`delete-tx-${tx.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {hasMore && (
          <div className="p-3 text-center border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="h-8 text-xs" data-testid="load-more-btn">
              {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalCount - filteredTransactions.length} kaldı)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
