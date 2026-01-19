import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";

import { useFaturalar } from "@/hooks/useFaturalar";
import { MonthSelector } from "@/components/faturalar/MonthSelector";
import { MonthInvoicesCard } from "@/components/faturalar/MonthInvoicesCard";
import { MissingInvoicesCard } from "@/components/faturalar/MissingInvoicesCard";
import { CouriersListCard } from "@/components/faturalar/CouriersListCard";
import { CourierInvoicesCard } from "@/components/faturalar/CourierInvoicesCard";

export default function FaturalarTab({ companyId }) {
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
    deleteInvoice,
    downloadBulk,
    verifyInvoice
  } = useFaturalar(companyId, selectedYear, selectedMonth);

  useEffect(() => {
    if (selectedCourier) {
      fetchCourierInvoices(selectedCourier.courier_id).then(setCourierInvoices);
    } else {
      setCourierInvoices([]);
    }
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
      await downloadBulk(selectedInvoices, `Faturalar_${selectedMonth}.${selectedYear}.zip`);
      setSelectedInvoices([]);
    } catch (err) {
      toast.error("Faturalar indirilemedi");
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
      toast.error("Fatura silinemedi");
    } finally {
      setConfirmOpen(false);
      setPendingDeleteId(null);
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
        />

        <MissingInvoicesCard missingInvoices={missingInvoices} />

        <CouriersListCard
          couriers={couriersSummary}
          selectedCourier={selectedCourier}
          onSelect={setSelectedCourier}
        />

        <CourierInvoicesCard
          selectedCourier={selectedCourier}
          invoices={courierInvoices}
          onView={viewInvoice}
          onDownload={downloadSingle}
          onDelete={handleDeleteInvoice}
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
    </div>
  );
}
