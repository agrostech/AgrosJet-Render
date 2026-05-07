import { Button } from "@/components/ui/button";
import { Upload, FileText, Trash2, Send, AlertTriangle } from "lucide-react";

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const canDeleteInvoice = (invoice) => {
  if (!invoice?.uploaded_at) return false;
  // Payout request faturaları silinemez (talep iptal akışı üzerinden silinir)
  if (invoice?.is_payout_invoice) return false;
  const uploadedAt = new Date(invoice.uploaded_at);
  const now = new Date();
  const hoursPassed = (now - uploadedAt) / (1000 * 60 * 60);
  return hoursPassed <= 24;
};

export function TransactionTable({ 
  transactions, 
  invoices, 
  companyInfo,
  uploadingFor,
  onUploadClick,
  onUploadShortfallClick,
  onDownloadInvoice,
  onDeleteInvoice,
  onOpenInvoiceMessage
}) {
  return (
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-3 font-semibold">Tarih</th>
            <th className="text-left p-3 font-semibold">Açıklama</th>
            <th className="text-right p-3 font-semibold">Tutar</th>
            <th className="text-center p-3 font-semibold w-32">Fatura</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map((tx) => (
            <TransactionRow 
              key={tx.id}
              tx={tx}
              invoices={invoices[tx.id] || []}
              companyInfo={companyInfo}
              uploadingFor={uploadingFor}
              onUploadClick={onUploadClick}
              onUploadShortfallClick={onUploadShortfallClick}
              onDownloadInvoice={onDownloadInvoice}
              onDeleteInvoice={onDeleteInvoice}
              onOpenInvoiceMessage={onOpenInvoiceMessage}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionRow({ tx, invoices = [], companyInfo, uploadingFor, onUploadClick, onUploadShortfallClick, onDownloadInvoice, onDeleteInvoice, onOpenInvoiceMessage }) {
  // invoices is now an array
  const hasInvoice = invoices && invoices.length > 0;
  const firstInvoice = hasInvoice ? invoices[0] : null;
  const showUploadButton = tx.is_hakedis && !hasInvoice;
  const hasShortfall = tx.has_shortfall && tx.shortfall_amount > 0 && !tx.pending_shortfall_invoice;
  const hasPendingShortfallInvoice = tx.pending_shortfall_invoice;
  
  return (
    <tr className={`hover:bg-slate-50 ${hasShortfall ? 'bg-amber-50/50' : ''} ${hasPendingShortfallInvoice ? 'bg-blue-50/50' : ''}`}>
      <td className="p-3 font-mono text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
      <td className="p-3">
        <div>
          {tx.description}
          {tx.is_hakedis && (
            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
              Hakediş
            </span>
          )}
          {hasShortfall && (
            <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">
              {formatMoney(tx.shortfall_amount)} Eksik
            </span>
          )}
          {hasPendingShortfallInvoice && (
            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
              Kontrol Bekliyor
            </span>
          )}
          {tx.installment_product_id && (
            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
              Taksit
            </span>
          )}
        </div>
      </td>
      <td className={`p-3 text-right font-mono font-semibold ${
        tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'
      }`}>
        {tx.type === 'payment_out' ? '-' : ''}{formatMoney(tx.amount)}
      </td>
      <td className="p-3 text-center">
        <div className="flex items-center justify-center gap-1">
          {showUploadButton && companyInfo && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenInvoiceMessage(tx.amount)}
              className="h-7 text-xs gap-1"
              title="Fatura Talep Et"
            >
              <Send className="w-3 h-3" />
              Talep
            </Button>
          )}
          {showUploadButton ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUploadClick(tx.id)}
              disabled={uploadingFor === tx.id}
              className="h-7 text-xs gap-1"
            >
              <Upload className="w-3 h-3" />
              {uploadingFor === tx.id ? "..." : "Yükle"}
            </Button>
          ) : hasInvoice ? (
            <>
              {/* Show all invoices for this transaction */}
              {invoices.map((inv, idx) => (
                <div key={inv.id} className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDownloadInvoice(inv.id)}
                    className={`h-7 w-7 p-0 ${inv.is_shortfall_invoice ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                    title={inv.is_shortfall_invoice ? `Eksik Fatura ${idx + 1}` : `Fatura ${idx + 1}`}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                  {canDeleteInvoice(inv) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDeleteInvoice(inv.id)}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      title="Sil (24 saat içinde)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {/* Shortfall invoice upload button */}
              {hasShortfall && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUploadShortfallClick(tx.id)}
                  disabled={uploadingFor === `shortfall_${tx.id}`}
                  className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  title="Eksik fatura yükle"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {uploadingFor === `shortfall_${tx.id}` ? "..." : "Eksik Yükle"}
                </Button>
              )}
            </>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TransactionMobileList({ 
  transactions, 
  invoices, 
  companyInfo,
  uploadingFor,
  onUploadClick,
  onUploadShortfallClick,
  onDownloadInvoice,
  onDeleteInvoice,
  onOpenInvoiceMessage
}) {
  return (
    <div className="sm:hidden divide-y divide-border">
      {transactions.map((tx) => (
        <TransactionMobileItem
          key={tx.id}
          tx={tx}
          invoices={invoices[tx.id] || []}
          companyInfo={companyInfo}
          uploadingFor={uploadingFor}
          onUploadClick={onUploadClick}
          onUploadShortfallClick={onUploadShortfallClick}
          onDownloadInvoice={onDownloadInvoice}
          onDeleteInvoice={onDeleteInvoice}
          onOpenInvoiceMessage={onOpenInvoiceMessage}
        />
      ))}
    </div>
  );
}

function TransactionMobileItem({ tx, invoices = [], companyInfo, uploadingFor, onUploadClick, onUploadShortfallClick, onDownloadInvoice, onDeleteInvoice, onOpenInvoiceMessage }) {
  const hasInvoice = invoices && invoices.length > 0;
  const showUploadButton = tx.is_hakedis && !hasInvoice;
  const hasShortfall = tx.has_shortfall && tx.shortfall_amount > 0 && !tx.pending_shortfall_invoice;
  const hasPendingShortfallInvoice = tx.pending_shortfall_invoice;
  
  return (
    <div className={`p-3 hover:bg-slate-50 ${hasShortfall ? 'bg-amber-50/50' : ''} ${hasPendingShortfallInvoice ? 'bg-blue-50/50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground">
              {formatDate(tx.created_at)}
            </span>
            {tx.is_hakedis && (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                Hakediş
              </span>
            )}
            {hasShortfall && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">
                {formatMoney(tx.shortfall_amount)} Eksik
              </span>
            )}
            {hasPendingShortfallInvoice && (
              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                Kontrol Bekliyor
              </span>
            )}
            {tx.installment_product_id && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                Taksit
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5 line-clamp-2">{tx.description || '-'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`font-mono font-semibold text-sm ${
            tx.type === 'payment_in' ? 'text-green-600' : 'text-red-600'
          }`}>
            {tx.type === 'payment_out' ? '-' : ''}{formatMoney(tx.amount)}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1 flex-wrap">
            {showUploadButton && companyInfo && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenInvoiceMessage(tx.amount)}
                className="h-6 text-[10px] gap-1 px-2"
                title="Fatura Talep Et"
              >
                <Send className="w-3 h-3" />
                Talep
              </Button>
            )}
            {showUploadButton ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onUploadClick(tx.id)}
                disabled={uploadingFor === tx.id}
                className="h-6 text-[10px] gap-1 px-2"
              >
                <Upload className="w-3 h-3" />
                Fatura
              </Button>
            ) : hasInvoice ? (
              <div className="flex items-center justify-end gap-1 flex-wrap">
                {/* Show all invoices */}
                {invoices.map((inv, idx) => (
                  <div key={inv.id} className="flex items-center gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDownloadInvoice(inv.id)}
                      className={`h-6 w-6 p-0 ${inv.is_shortfall_invoice ? 'text-amber-600' : 'text-green-600'}`}
                      title={inv.is_shortfall_invoice ? 'Eksik Fatura' : `Fatura ${idx + 1}`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                    {canDeleteInvoice(inv) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteInvoice(inv.id)}
                        className="h-6 w-6 p-0 text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {/* Shortfall upload button for mobile */}
                {hasShortfall && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onUploadShortfallClick(tx.id)}
                    disabled={uploadingFor === `shortfall_${tx.id}`}
                    className="h-6 text-[10px] gap-1 px-2 border-amber-300 text-amber-700"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Eksik
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
