import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Archive, Download, Check, Eye, CheckCircle, Circle, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function MonthInvoicesCard({ 
  invoices, 
  selectedInvoices, 
  onToggleSelection, 
  onSelectAll, 
  onDownloadBulk,
  onView,
  onDownload,
  onVerify,
  onVerifyWithAmount
}) {
  const [verifyModal, setVerifyModal] = useState({ open: false, invoice: null });
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [shortfallResult, setShortfallResult] = useState(null);

  const handleOpenVerifyModal = (invoice) => {
    setVerifyModal({ open: true, invoice });
    setInvoiceAmount("");
    setShortfallResult(null);
  };

  const handleVerifyWithAmount = async () => {
    if (!invoiceAmount || parseFloat(invoiceAmount) <= 0) return;
    
    setVerifying(true);
    try {
      const result = await onVerifyWithAmount(verifyModal.invoice.id, parseFloat(invoiceAmount));
      if (result.has_shortfall) {
        setShortfallResult(result);
      } else {
        setVerifyModal({ open: false, invoice: null });
        setShortfallResult(null);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleCloseModal = () => {
    setVerifyModal({ open: false, invoice: null });
    setInvoiceAmount("");
    setShortfallResult(null);
  };

  return (
    <>
      <div className="border-2 border-border bg-white">
        <div className="p-3 border-b-2 border-border bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Ay Faturaları</h3>
              <span className="text-xs text-muted-foreground">({invoices.length})</span>
            </div>
            {invoices.length > 0 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={onSelectAll} className="h-8 text-xs flex-1 sm:flex-none">
                  {selectedInvoices.length === invoices.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                </Button>
                {selectedInvoices.length > 0 && (
                  <Button size="sm" onClick={onDownloadBulk} className="h-8 text-xs gap-1 flex-1 sm:flex-none">
                    <Download className="w-3 h-3" />
                    İndir ({selectedInvoices.length})
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Archive className="w-12 h-12 mx-auto mb-2 opacity-20" />
              Bu ayda yüklenen fatura yok
            </div>
          ) : (
            <div className="divide-y divide-border">
              {invoices.map((invoice) => (
                <div 
                  key={invoice.id} 
                  className={`p-3 hover:bg-slate-50 ${
                    selectedInvoices.includes(invoice.id) ? 'bg-primary/5' : ''
                  } ${invoice.verified ? 'bg-green-50/50' : ''}`}
                >
                  {/* Mobile Layout */}
                  <div className="sm:hidden">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div 
                        className="flex items-start gap-2 flex-1 cursor-pointer min-w-0"
                        onClick={() => onToggleSelection(invoice.id)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          selectedInvoices.includes(invoice.id) 
                            ? 'bg-primary border-primary text-white' 
                            : 'border-slate-300'
                        }`}>
                          {selectedInvoices.includes(invoice.id) && <Check className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm">{invoice.courier_name}</p>
                            {invoice.is_shortfall_invoice && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded font-medium">
                                Eksik Fatura
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {formatDate(invoice.uploaded_at)}
                          </p>
                        </div>
                      </div>
                      <p className={`font-semibold text-sm font-mono flex-shrink-0 ${invoice.is_shortfall_invoice ? 'text-amber-600' : 'text-red-600'}`}>
                        {invoice.is_shortfall_invoice && invoice.shortfall_amount 
                          ? formatMoney(invoice.shortfall_amount)
                          : invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
                      </p>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onView(invoice.id); }} className="h-7 text-xs gap-1 px-2">
                        <Eye className="w-3 h-3" />
                        Görüntüle
                      </Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onDownload(invoice.id); }} className="h-7 text-xs gap-1 px-2">
                        <Download className="w-3 h-3" />
                        İndir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleOpenVerifyModal(invoice); }}
                        className={`h-8 px-2.5 ${invoice.verified ? 'text-green-600 border-green-300 bg-green-50' : ''}`}
                      >
                        {invoice.verified ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center justify-between gap-2">
                    <div 
                      className="flex items-center gap-2 flex-1 cursor-pointer"
                      onClick={() => onToggleSelection(invoice.id)}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedInvoices.includes(invoice.id) 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-slate-300'
                      }`}>
                        {selectedInvoices.includes(invoice.id) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm truncate">{invoice.courier_name}</p>
                          {invoice.is_shortfall_invoice && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded font-medium flex-shrink-0">
                              Eksik Fatura
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.file_name} • {formatDate(invoice.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <p className={`font-semibold text-sm font-mono ${invoice.is_shortfall_invoice ? 'text-amber-600' : 'text-red-600'}`}>
                        {invoice.is_shortfall_invoice && invoice.shortfall_amount 
                          ? formatMoney(invoice.shortfall_amount)
                          : invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
                      </p>
                      {invoice.verified && invoice.verified_amount && (
                        <p className="text-xs text-green-600">
                          Onaylanan: {formatMoney(invoice.verified_amount)}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onView(invoice.id); }} className="h-8 w-8 p-0" title="Görüntüle">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onDownload(invoice.id); }} className="h-8 w-8 p-0" title="İndir">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); handleOpenVerifyModal(invoice); }}
                        className={`h-8 w-8 p-0 ${invoice.verified ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-green-600'}`}
                        title={invoice.verified ? "Kontrol edildi" : "Kontrol et"}
                      >
                        {invoice.verified ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Verify Modal */}
      <Dialog open={verifyModal.open} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              Fatura Kontrol
            </DialogTitle>
          </DialogHeader>
          
          {verifyModal.invoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="font-semibold">{verifyModal.invoice.courier_name}</p>
                <p className="text-sm text-muted-foreground">{verifyModal.invoice.file_name}</p>
                <p className="text-lg font-bold font-mono text-red-600 mt-2">
                  Hakediş: {verifyModal.invoice.transaction_amount ? formatMoney(verifyModal.invoice.transaction_amount) : '-'}
                </p>
              </div>

              {!shortfallResult ? (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fatura Tutarı (TL)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      className="h-12 text-lg font-mono"
                      autoFocus
                    />
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseModal}>İptal</Button>
                    <Button 
                      onClick={handleVerifyWithAmount} 
                      disabled={verifying || !invoiceAmount}
                      className="gap-2"
                    >
                      <Check className="w-4 h-4" />
                      {verifying ? "Kontrol ediliyor..." : "Kontrol Et"}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-700 mb-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-semibold">Eksik Fatura Tespit Edildi</span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p>Hakediş Tutarı: <span className="font-mono font-semibold">{formatMoney(shortfallResult.expected_amount)}</span></p>
                      <p>Fatura Tutarı: <span className="font-mono font-semibold">{formatMoney(shortfallResult.invoice_amount)}</span></p>
                      <p className="text-amber-800 font-semibold">
                        Eksik Tutar: <span className="font-mono">{formatMoney(shortfallResult.shortfall)}</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Kuryenin eksik faturayı yüklemesi için yeni bir hakediş kaydı oluşturuldu. 
                    Kurye kendi panelinden bu eksik faturayı görecek ve yükleyebilecek.
                  </p>

                  <DialogFooter>
                    <Button onClick={handleCloseModal} className="w-full">Tamam</Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
