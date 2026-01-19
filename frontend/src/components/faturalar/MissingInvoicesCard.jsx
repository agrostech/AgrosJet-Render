import { AlertCircle, Check } from "lucide-react";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function MissingInvoicesCard({ missingInvoices }) {
  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-red-50">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-sm text-red-700">Eksik Faturalar</h3>
          <span className="text-xs text-red-500">({missingInvoices.length})</span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {missingInvoices.length === 0 ? (
          <div className="p-8 text-center text-green-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            Tüm hakedişler için fatura yüklenmiş
          </div>
        ) : (
          <div className="divide-y divide-border">
            {missingInvoices.map((tx) => (
              <div key={tx.id} className="p-3 hover:bg-red-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{tx.courier_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.description} • {formatDate(tx.created_at)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-red-600">
                    {formatMoney(tx.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
