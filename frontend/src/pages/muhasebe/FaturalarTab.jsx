import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PdfViewerModal } from "@/components/ui/pdf-viewer-modal";

import { useFaturalar } from "@/hooks/useFaturalar";
import { MonthSelector } from "@/components/faturalar/MonthSelector";
import { MonthInvoicesCard } from "@/components/faturalar/MonthInvoicesCard";
import { MissingInvoicesCard } from "@/components/faturalar/MissingInvoicesCard";
import CourierObligationsCard from "@/components/faturalar/CourierObligationsCard";
import UpcomingObligationsCard from "@/components/faturalar/UpcomingObligationsCard";
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

      {/* 1. satır: Aylık Faturalar (full width) */}
      <div className="grid grid-cols-1 gap-4">
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
      </div>

      {/* Yaklaşan Kurye Faturaları (haftalık otomatik üretim önizlemesi) */}
      <UpcomingObligationsCard companyId={companyId} />

      {/* Yeni Haftalık Fatura Yükümlülükleri (decoupled obligations sistemi) */}
      <CourierObligationsCard />

      {/* Eksik Faturalar (her zaman görünür, geri açıldı) */}
      <MissingInvoicesCard
        missingInvoices={missingInvoices}
        isSuperAdmin={isSuperAdmin}
        onDismiss={dismissMissingInvoice}
      />

      {/* 2. satır: Kuryeler + Kurye Faturaları (yan yana) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
      <PdfViewerModal file={viewingFile} onClose={closeViewer} />
    </div>
  );
}
