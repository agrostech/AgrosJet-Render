import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Download } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";

import { useFaturalar } from "@/hooks/useFaturalar";
import { MonthSelector } from "@/components/faturalar/MonthSelector";
import { MonthInvoicesCard } from "@/components/faturalar/MonthInvoicesCard";
import { MissingInvoicesCard } from "@/components/faturalar/MissingInvoicesCard";
import { CouriersListCard } from "@/components/faturalar/CouriersListCard";
import { CourierInvoicesCard } from "@/components/faturalar/CourierInvoicesCard";

export default function FaturalarTab({ companyId, adminId, adminName, isSuperAdmin }) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [courierInvoices, setCourierInvoices] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const {
    couriersSummary,
    monthInvoices,
    missingInvoices,
    loading,
    refetch,
    fetchCourierInvoices,
    downloadSingle,
    viewInvoice,
    viewingFile,
    closeViewer,
    deleteInvoice,
    downloadBulk,
    verifyInvoice,
    verifyInvoiceWithAmount,
    uploadInvoiceByAdmin,
    dismissMissingInvoice
  } = useFaturalar(companyId, selectedYear, selectedMonth);

  const [courierLoading, setCourierLoading] = useState(false);

  useEffect(() => {
    // Cleanup flag to prevent state updates after unmount or courier change
    let isCancelled = false;
    
    if (selectedCourier) {
      setCourierLoading(true);
      setCourierInvoices([]); // Clear immediately to prevent flicker
      
      fetchCourierInvoices(selectedCourier.courier_id).then((data) => {
        if (!isCancelled) {
          setCourierInvoices(data);
          setCourierLoading(false);
        }
      });
    } else {
      setCourierInvoices([]);
      setCourierLoading(false);
    }
    
    // Cleanup function - runs when courier changes or component unmounts
    return () => {
      isCancelled = true;
    };
  }, [selectedCourier, fetchCourierInvoices]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleToggleSelection = (invoiceId) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === monthInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(monthInvoices.map(inv => inv.id));
    }
  };

  const handleDownloadBulk = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("En az bir fatura seçin");
      return;
    }
    try {
      await downloadBulk(selectedInvoices, `Faturalar_${selectedMonth}.${selectedYear}.pdf`);
      setSelectedInvoices([]);
    } catch (err) {
      if (!err.handled) {
        toast.error("Faturalar indirilemedi");
      }
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    setPendingDeleteId(invoiceId);
    setConfirmOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteInvoice(pendingDeleteId);
      if (selectedCourier) {
        fetchCourierInvoices(selectedCourier.courier_id).then(setCourierInvoices);
      }
    } catch (err) {
      if (!err.handled) {
        toast.error("Fatura silinemedi");
      }
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
    }
  };

  const handleVerifyWithAmount = async (invoiceId, amount) => {
    try {
      return await verifyInvoiceWithAmount(invoiceId, amount, adminId, adminName);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Kontrol başarısız");
      }
      throw err;
    }
  };

  const handleUploadByAdmin = async (transactionId, courierId, courierName, file) => {
    try {
      await uploadInvoiceByAdmin(transactionId, courierId, courierName, adminId, adminName, file);
      if (selectedCourier) {
        fetchCourierInvoices(selectedCourier.courier_id).then(setCourierInvoices);
      }
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Yükleme başarısız");
      }
      throw err;
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4" data-testid="faturalar-tab">
      <MonthSelector
        year={selectedYear}
        month={selectedMonth}
        onPrev={handlePrevMonth}
        onNext={handleNextMonth}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthInvoicesCard
          invoices={monthInvoices}
          selectedInvoices={selectedInvoices}
          onToggleSelection={handleToggleSelection}
          onSelectAll={handleSelectAll}
          onDownloadBulk={handleDownloadBulk}
          onView={viewInvoice}
          onDownload={downloadSingle}
          onVerify={verifyInvoice}
          onVerifyWithAmount={handleVerifyWithAmount}
        />

        <MissingInvoicesCard 
          missingInvoices={missingInvoices} 
          isSuperAdmin={isSuperAdmin}
          onDismiss={dismissMissingInvoice}
        />

        <CouriersListCard
          couriers={couriersSummary}
          selectedCourier={selectedCourier}
          onSelect={setSelectedCourier}
        />

        <CourierInvoicesCard
          selectedCourier={selectedCourier}
          invoices={courierInvoices}
          loading={courierLoading}
          onView={viewInvoice}
          onDownload={downloadSingle}
          onDelete={handleDeleteInvoice}
          onUploadByAdmin={handleUploadByAdmin}
          missingInvoices={missingInvoices}
        />
      </div>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Fatura Silme"
        description="Bu faturayı silmek istediğinize emin misiniz?"
        onConfirm={confirmDeleteInvoice}
        variant="danger"
      />

      {/* PDF/Görsel Görüntüleme Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeViewer}>
          <div className="relative w-full max-w-4xl h-[90vh] mx-4 bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
              <p className="text-sm font-semibold truncate">{viewingFile.fileName}</p>
              <div className="flex items-center gap-2">
                <a href={viewingFile.url} download={viewingFile.fileName}>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    İndir
                  </Button>
                </a>
                <Button size="sm" variant="ghost" onClick={closeViewer} className="h-8 w-8 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto bg-slate-100">
              {viewingFile.contentType.startsWith('image/') ? (
                <img src={viewingFile.url} alt={viewingFile.fileName} className="max-w-full max-h-full m-auto" />
              ) : (
                <iframe src={viewingFile.url} title={viewingFile.fileName} className="w-full h-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
