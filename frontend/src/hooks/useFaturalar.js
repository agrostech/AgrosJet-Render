import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useFaturalar(companyId, year, month) {
  const [couriersSummary, setCouriersSummary] = useState([]);
  const [monthInvoices, setMonthInvoices] = useState([]);
  const [missingInvoices, setMissingInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCouriersSummary = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(
        `${API}/invoices/company/${companyId}/couriers-summary?year=${year}&month=${month}`
      );
      setCouriersSummary(res.data);
    } catch (err) {
      console.error("Kurye özeti yüklenemedi");
    }
  }, [companyId, year, month]);

  const fetchMonthInvoices = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(
        `${API}/invoices/company/${companyId}?year=${year}&month=${month}`
      );
      setMonthInvoices(res.data);
    } catch (err) {
      console.error("Aylık faturalar yüklenemedi");
    }
  }, [companyId, year, month]);

  const fetchMissingInvoices = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/invoices/company/${companyId}/missing`);
      setMissingInvoices(res.data);
    } catch (err) {
      console.error("Eksik faturalar yüklenemedi");
    }
  }, [companyId]);

  const fetchCourierInvoices = useCallback(async (courierId) => {
    try {
      const res = await axios.get(`${API}/invoices/courier/${courierId}`);
      return res.data;
    } catch (err) {
      console.error("Kurye faturaları yüklenemedi");
      return [];
    }
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchCouriersSummary(),
      fetchMonthInvoices(),
      fetchMissingInvoices()
    ]);
    setLoading(false);
  }, [fetchCouriersSummary, fetchMonthInvoices, fetchMissingInvoices]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Actions
  const downloadSingle = (invoiceId) => {
    window.open(`${API}/invoices/download/${invoiceId}`, '_blank');
  };

  const viewInvoice = (invoiceId) => {
    window.open(`${API}/invoices/view/${invoiceId}`, '_blank');
  };

  const deleteInvoice = async (invoiceId) => {
    try {
      await axios.delete(`${API}/invoices/admin/${invoiceId}`);
      toast.success("Fatura silindi");
      refetch();
    } catch (err) {
      console.error("Delete invoice error:", err);
      toast.error(err.response?.data?.detail || "Fatura silinemedi");
      throw err;
    }
  };

  const downloadBulk = async (invoiceIds, filename) => {
    toast.loading("PDF birleştiriliyor...", { id: "bulk-pdf" });
    try {
      const res = await axios.post(
        `${API}/invoices/download-bulk`,
        { invoice_ids: invoiceIds, company_id: companyId },
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename.replace('.zip', '.pdf'));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${invoiceIds.length} fatura birleştirildi`, { id: "bulk-pdf" });
    } catch (err) {
      toast.error("PDF birleştirme başarısız", { id: "bulk-pdf" });
      throw err;
    }
  };

  const verifyInvoice = async (invoiceId, currentStatus) => {
    if (currentStatus) {
      await axios.put(`${API}/invoices/${invoiceId}/unverify`);
      toast.success("Kontrol durumu kaldırıldı");
    } else {
      await axios.put(`${API}/invoices/${invoiceId}/verify`);
      toast.success("Fatura kontrol edildi");
    }
    fetchMonthInvoices();
  };

  const verifyInvoiceWithAmount = async (invoiceId, amount, adminId, adminName) => {
    const formData = new FormData();
    formData.append("invoice_amount", amount);
    formData.append("admin_id", adminId);
    formData.append("admin_name", adminName);
    
    const res = await axios.post(`${API}/invoices/${invoiceId}/verify-with-amount`, formData);
    
    if (res.data.has_shortfall) {
      toast.warning(`${res.data.shortfall.toLocaleString('tr-TR')} TL eksik fatura kaydı oluşturuldu`);
    } else {
      toast.success("Fatura kontrol edildi");
    }
    
    await refetch();
    return res.data;
  };

  const uploadInvoiceByAdmin = async (transactionId, courierId, courierName, adminId, adminName, file) => {
    const formData = new FormData();
    formData.append("transaction_id", transactionId);
    formData.append("courier_id", courierId);
    formData.append("courier_name", courierName);
    formData.append("company_id", companyId);
    formData.append("admin_id", adminId);
    formData.append("admin_name", adminName);
    formData.append("file", file);
    
    const res = await axios.post(`${API}/invoices/upload-by-admin`, formData);
    toast.success("Fatura başarıyla yüklendi");
    await refetch();
    return res.data;
  };

  const dismissMissingInvoice = async (transactionId) => {
    try {
      await axios.delete(`${API}/invoices/missing/${transactionId}`);
      toast.success("Eksik fatura kaydı silindi");
      await refetch();
    } catch (err) {
      console.error("Dismiss missing invoice error:", err);
      toast.error(err.response?.data?.detail || "İşlem başarısız");
      throw err;
    }
  };

  return {
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
    verifyInvoice,
    verifyInvoiceWithAmount,
    uploadInvoiceByAdmin,
    dismissMissingInvoice
  };
}
