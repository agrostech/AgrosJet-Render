import { useState, useMemo } from "react";
import { AlertCircle, Check, Filter, MessageCircle, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function MissingInvoicesCard({ missingInvoices, isSuperAdmin, onDismiss }) {
  const [selectedCourier, setSelectedCourier] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // Get unique couriers who have missing invoices
  const couriersWithMissing = useMemo(() => {
    const courierMap = {};
    missingInvoices.forEach(tx => {
      if (!courierMap[tx.courier_id]) {
        courierMap[tx.courier_id] = {
          courier_id: tx.courier_id,
          courier_name: tx.courier_name,
          phone: tx.phone || "",
          total_amount: 0,
          count: 0
        };
      }
      // Use display_amount for shortfall, amount for no_invoice
      const displayAmount = tx.display_amount || tx.amount;
      courierMap[tx.courier_id].total_amount += Math.abs(displayAmount);
      courierMap[tx.courier_id].count += 1;
    });
    return Object.values(courierMap).sort((a, b) => (a.courier_name || '').localeCompare(b.courier_name || '', 'tr'));
  }, [missingInvoices]);

  // Filter invoices by selected courier
  const filteredInvoices = useMemo(() => {
    if (!selectedCourier) return missingInvoices;
    return missingInvoices.filter(tx => tx.courier_id === selectedCourier);
  }, [missingInvoices, selectedCourier]);

  // Get selected courier's data for WhatsApp
  const selectedCourierData = useMemo(() => {
    return couriersWithMissing.find(c => c.courier_id === selectedCourier);
  }, [couriersWithMissing, selectedCourier]);

  const handleWhatsAppReminder = () => {
    if (!selectedCourierData || !selectedCourierData.phone) return;
    
    // Build message
    const invoicesList = filteredInvoices.map(tx => {
      const displayAmount = tx.display_amount || tx.amount;
      const typeLabel = tx.missing_type === 'shortfall' ? ' (Eksik Fatura)' : '';
      return `• ${formatDate(tx.created_at)} - ${tx.description}${typeLabel}: ${formatMoney(displayAmount)}`;
    }).join('\n');
    
    const message = `Merhaba ${selectedCourierData.courier_name},

Eksik faturalarınız bulunmaktadır:

${invoicesList}

Toplam: ${formatMoney(selectedCourierData.total_amount)}

Lütfen en kısa sürede faturalarınızı yükleyiniz.`;
    
    // Clean phone number and open WhatsApp
    let phone = selectedCourierData.phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '90' + phone.substring(1);
    if (!phone.startsWith('90')) phone = '90' + phone;
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h3 className="font-semibold text-sm text-red-700">Eksik Faturalar</h3>
            <span className="text-xs text-red-500">({filteredInvoices.length})</span>
          </div>
        </div>
        
        {/* Courier Filter */}
        {couriersWithMissing.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="flex-1 h-9 text-sm border border-red-200 rounded px-2 bg-white min-w-0"
                data-testid="missing-invoices-courier-filter"
              >
                <option value="">Tüm Kuryeler</option>
                {couriersWithMissing.map(courier => (
                  <option key={courier.courier_id} value={courier.courier_id}>
                    {courier.courier_name} ({courier.count} eksik)
                  </option>
                ))}
              </select>
            </div>
            {selectedCourier && selectedCourierData?.phone && (
              <Button
                size="sm"
                onClick={handleWhatsAppReminder}
                className="w-full h-9 bg-green-600 hover:bg-green-700 text-sm"
                data-testid="whatsapp-reminder-btn"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp ile Hatırlat
              </Button>
            )}
          </div>
        )}
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-green-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            {selectedCourier ? "Bu kurye için eksik fatura yok" : "Tüm hakedişler için fatura yüklenmiş"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredInvoices.map((tx) => {
              const displayAmount = tx.display_amount || tx.amount;
              const isShortfall = tx.missing_type === 'shortfall';
              
              return (
                <div key={tx.id} className={`p-3 hover:bg-red-50/50 ${isShortfall ? 'bg-amber-50/30' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{tx.courier_name}</p>
                        {isShortfall && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium flex-shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            Eksik Fatura
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.description} • {formatDate(tx.created_at)}
                      </p>
                      {isShortfall && (
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          Hakediş: {formatMoney(tx.amount)} → Eksik: {formatMoney(displayAmount)}
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-semibold font-mono flex-shrink-0 ${isShortfall ? 'text-amber-600' : 'text-red-600'}`}>
                      {formatMoney(displayAmount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Summary when courier is selected */}
      {selectedCourier && selectedCourierData && filteredInvoices.length > 0 && (
        <div className="p-3 border-t border-border bg-red-50/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-red-700 font-medium">Toplam Eksik:</span>
            <span className="font-bold text-red-600">{formatMoney(selectedCourierData.total_amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
