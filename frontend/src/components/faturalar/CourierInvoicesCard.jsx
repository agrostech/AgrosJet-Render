import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, User, Download, Eye, Trash2, Loader2, Upload, Ghost, AlertTriangle } from "lucide-react";

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function CourierInvoicesCard({ selectedCourier, invoices, loading, onView, onDownload, onDelete, onUploadByAdmin, missingInvoices = [] }) {
  const [uploadingFor, setUploadingFor] = useState(null);
  const fileInputRef = useRef(null);
  const [pendingUpload, setPendingUpload] = useState(null);

  // Get missing invoices for selected courier (only if ghost courier)
  const courierMissingInvoices = selectedCourier?.is_ghost 
    ? missingInvoices.filter(inv => inv.courier_id === selectedCourier.courier_id || inv.entity_id === selectedCourier.courier_id)
    : [];

  const handleUploadClick = (transaction) => {
    setPendingUpload(transaction);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload || !selectedCourier) return;

    setUploadingFor(pendingUpload.id);
    try {
      await onUploadByAdmin(
        pendingUpload.id,
        selectedCourier.courier_id,
        selectedCourier.courier_name,
        file
      );
    } finally {
      setUploadingFor(null);
      setPendingUpload(null);
      e.target.value = "";
    }
  };

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">
            {selectedCourier ? `${selectedCourier.courier_name} - Faturalar` : 'Kurye Seçin'}
          </h3>
          {selectedCourier?.is_ghost && (
            <Ghost className="w-4 h-4 text-purple-500" title="Hayalet Kurye" />
          )}
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {!selectedCourier ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <User className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Faturalarını görmek için bir kurye seçin
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-12 h-12 mx-auto mb-2 animate-spin opacity-30" />
            Yükleniyor...
          </div>
        ) : (
          <>
            {/* Missing invoices for ghost couriers */}
            {courierMissingInvoices.length > 0 && (
              <div className="border-b-2 border-amber-200 bg-amber-50">
                <div className="p-2 border-b border-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Eksik Faturalar ({courierMissingInvoices.length})</span>
                </div>
                <div className="divide-y divide-amber-200">
                  {courierMissingInvoices.map((tx) => (
                    <div key={tx.id} className="p-3 hover:bg-amber-100/50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {tx.description}
                            {tx.is_shortfall && (
                              <span className="ml-2 px-1.5 py-0.5 bg-amber-200 text-amber-800 text-[10px] rounded font-medium">
                                Eksik
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(tx.created_at)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-sm font-mono text-red-600">
                            {formatMoney(tx.amount)}
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleUploadClick(tx)}
                          disabled={uploadingFor === tx.id}
                          className="h-8 text-xs gap-1 flex-shrink-0 border-amber-300 hover:bg-amber-100"
                        >
                          <Upload className="w-3 h-3" />
                          {uploadingFor === tx.id ? "..." : "Yükle"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded invoices */}
            {invoices.length === 0 && courierMissingInvoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                Bu kuryenin faturası yok
              </div>
            ) : invoices.length > 0 && (
              <div className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="p-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{invoice.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(invoice.uploaded_at)}
                          {invoice.uploaded_by_admin && (
                            <span className="ml-2 text-purple-600">(Admin yükledi)</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-sm font-mono text-red-600">
                          {invoice.is_payout_invoice && invoice.verified_amount
                            ? formatMoney(invoice.verified_amount)
                            : invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => onView(invoice.id)} className="h-8 w-8 p-0" title="Görüntüle">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDownload(invoice.id)} className="h-8 w-8 p-0" title="İndir">
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDelete(invoice.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" title="Sil">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Hidden file input - accept removed for mobile compatibility */}
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
