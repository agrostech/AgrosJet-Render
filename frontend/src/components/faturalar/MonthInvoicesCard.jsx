import { Button } from "@/components/ui/button";
import { Archive, Download, Check, Eye, CheckCircle, Circle } from "lucide-react";

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
  onVerify
}) {
  return (
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
                        <p className="font-medium text-sm">{invoice.courier_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(invoice.uploaded_at)}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-sm font-mono text-red-600 flex-shrink-0">
                      {invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
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
                      onClick={(e) => { e.stopPropagation(); onVerify(invoice.id, invoice.verified); }}
                      className={`h-7 px-2 ${invoice.verified ? 'text-green-600 border-green-300 bg-green-50' : ''}`}
                    >
                      {invoice.verified ? <CheckCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
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
                      <p className="font-medium text-sm truncate">{invoice.courier_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {invoice.file_name} • {formatDate(invoice.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-sm font-mono text-red-600">
                      {invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
                    </p>
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
                      onClick={(e) => { e.stopPropagation(); onVerify(invoice.id, invoice.verified); }}
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
  );
}
