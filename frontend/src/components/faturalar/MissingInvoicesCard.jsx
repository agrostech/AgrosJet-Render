import { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { AlertCircle, Check, Filter, MessageCircle, AlertTriangle, Trash2, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const formatMoney = (amount) => {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(amount)) + ' TL';
};

export function MissingInvoicesCard({ missingInvoices, isSuperAdmin, onDismiss, companyId }) {
  const [selectedCourier, setSelectedCourier] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [pendingObligations, setPendingObligations] = useState([]);

  // Tüm zaman pending obligations çek (zaman filtresinden bağımsız)
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/courier-invoice-obligations/pending-list/${companyId}`);
        if (!cancelled) setPendingObligations(res.data.items || []);
      } catch {
        if (!cancelled) setPendingObligations([]);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, missingInvoices.length]);

  // Pending obligations'ı normalize edip aynı listeye ekle
  const allInvoices = useMemo(() => {
    const pend = pendingObligations.map((o) => ({
      id: o.id,
      _source: "obligation",
      courier_id: o.courier_id,
      courier_name: o.courier_name,
      phone: "",
      amount: o.expected_amount,
      display_amount: o.expected_amount,
      created_at: o.created_at,
      description: `${o.week_start} → ${o.week_end} haftası`,
      missing_type: o.is_manual ? "manual" : "weekly",
    }));
    const old = (missingInvoices || []).map((x) => ({ ...x, _source: "transaction" }));
    return [...pend, ...old];
  }, [pendingObligations, missingInvoices]);

  // Get unique couriers
  const couriersWithMissing = useMemo(() => {
    const courierMap = {};
    allInvoices.forEach(tx => {
      if (!courierMap[tx.courier_id]) {
        courierMap[tx.courier_id] = {
          courier_id: tx.courier_id,
          courier_name: tx.courier_name,
          phone: tx.phone || "",
          total_amount: 0,
          count: 0
        };
      }
      const displayAmount = tx.display_amount || tx.amount;
      courierMap[tx.courier_id].total_amount += Math.abs(displayAmount);
      courierMap[tx.courier_id].count += 1;
    });
    return Object.values(courierMap).sort((a, b) => (a.courier_name || '').localeCompare(b.courier_name || '', 'tr'));
  }, [allInvoices]);

  // Filter
  const filteredInvoices = useMemo(() => {
    if (!selectedCourier) return allInvoices;
    return allInvoices.filter(tx => tx.courier_id === selectedCourier);
  }, [allInvoices, selectedCourier]);

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
    setShowReminderModal(false);
  };

  const openReminderModal = () => {
    if (!selectedCourier) return;
    setShowReminderModal(true);
  };

  return (
    <>
    <div className="border-2 border-border bg-white">
      <div className="p-3 border-b-2 border-border bg-amber-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-sm text-amber-800">Bekleyen Faturalar</h3>
            <span className="text-xs text-amber-600">({filteredInvoices.length})</span>
          </div>
          
          {/* WhatsApp reminder button - only when a courier is selected */}
          {selectedCourier && selectedCourierData && (
            <Button
              size="sm"
              variant="outline"
              onClick={openReminderModal}
              className="h-8 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Hatırlat
            </Button>
          )}
        </div>
        
        {/* Courier Filter */}
        {couriersWithMissing.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="flex-1 h-9 text-sm border border-amber-200 rounded px-2 bg-white min-w-0"
                data-testid="missing-invoices-courier-filter"
              >
                <option value="">Tüm Kuryeler</option>
                {couriersWithMissing.map(courier => (
                  <option key={courier.courier_id} value={courier.courier_id}>
                    {courier.courier_name} ({courier.count} bekleyen)
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-emerald-600 text-sm">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            {selectedCourier ? "Bu kurye için bekleyen fatura yok" : "Bekleyen fatura yok"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredInvoices.map((tx) => {
              const displayAmount = tx.display_amount || tx.amount;
              const isShortfall = tx.missing_type === 'shortfall';
              const isObligation = tx._source === 'obligation';
              const isDeleting = deletingId === tx.id;
              
              const handleDeleteClick = () => {
                setPendingDelete(tx);
                setConfirmOpen(true);
              };
              
              return (
                <div key={tx.id} className={`p-3 hover:bg-amber-50/50 ${isShortfall ? 'bg-amber-50/30' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{tx.courier_name}</p>
                        {isObligation && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            Bekliyor
                          </span>
                        )}
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-semibold font-mono ${isObligation ? 'text-blue-600' : isShortfall ? 'text-amber-600' : 'text-red-600'}`}>
                        {formatMoney(displayAmount)}
                      </span>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeleteClick}
                          disabled={isDeleting}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                          title="Kaydı Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
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

      {/* Silme Onay Modal */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingDelete?._source === "obligation" ? "Faturayı Sil" : "Eksik Fatura Kaydını Sil"}
        description={pendingDelete
          ? pendingDelete._source === "obligation"
            ? `${pendingDelete.courier_name} - ${formatMoney(pendingDelete.amount)} (${pendingDelete.description}) silinecek. Bu işlem geri alınamaz.`
            : `${pendingDelete.courier_name} - ${pendingDelete.description} için eksik fatura kaydını silmek istediğinizden emin misiniz?`
          : ""}
        confirmText="Sil"
        cancelText="İptal"
        variant="destructive"
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeletingId(pendingDelete.id);
          try {
            if (pendingDelete._source === "obligation") {
              await axios.delete(`${API}/courier-invoice-obligations/${pendingDelete.id}`);
              setPendingObligations((prev) => prev.filter((p) => p.id !== pendingDelete.id));
            } else if (onDismiss) {
              await onDismiss(pendingDelete.id);
            }
          } finally {
            setDeletingId(null);
            setConfirmOpen(false);
            setPendingDelete(null);
          }
        }}
      />
    </div>

    {/* WhatsApp Reminder Modal */}
    <Dialog open={showReminderModal} onOpenChange={setShowReminderModal}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            WhatsApp ile Hatırlat
          </DialogTitle>
        </DialogHeader>
        
        {selectedCourierData && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg">
              <p className="font-semibold">{selectedCourierData.courier_name}</p>
              <p className="text-sm text-red-600 font-mono mt-1">
                Toplam Eksik: {formatMoney(selectedCourierData.total_amount)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedCourierData.count} adet eksik fatura
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-2">Kurye Bilgileri</h4>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{selectedCourierData.courier_name}</p>
                    {selectedCourierData.phone ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedCourierData.phone}
                      </p>
                    ) : (
                      <p className="text-xs text-red-500">Telefon numarası yok</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleWhatsAppReminder}
                    disabled={!selectedCourierData.phone}
                    className="h-8 gap-1 bg-green-600 hover:bg-green-700"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Hatırlat
                  </Button>
                </div>
              </div>
              
              {!selectedCourierData.phone && (
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
                  Bu kuryenin telefon numarası tanımlı değil. Kurye bilgilerinden telefon ekleyebilirsiniz.
                </p>
              )}
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowReminderModal(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
