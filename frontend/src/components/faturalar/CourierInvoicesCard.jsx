import { Button } from "@/components/ui/button";
import { FileText, User, Download, Eye, Trash2 } from "lucide-react";

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function CourierInvoicesCard({ selectedCourier, invoices, onView, onDownload, onDelete }) {
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-slate-50">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">
            {selectedCourier ? `${selectedCourier.courier_name} - Faturalar` : 'Kurye Seçin'}
          </h3>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {!selectedCourier ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <User className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Faturalarını görmek için bir kurye seçin
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
            Bu kuryenin faturası yok
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{invoice.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(invoice.uploaded_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-sm font-mono text-red-600">
                      {invoice.transaction_amount ? formatMoney(invoice.transaction_amount) : '-'}
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
      </div>
    </div>
  );
}
