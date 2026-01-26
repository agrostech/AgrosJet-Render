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
    await axios.delete(`${API}/invoices/admin/${invoiceId}`);
    toast.success("Fatura silindi");
    refetch();
  };

  const downloadBulk = async (invoiceIds, filename) => {
    const res = await axios.post(
      `${API}/invoices/download-bulk`,
      invoiceIds,
      { responseType: 'blob' }
    );
    
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    toast.success(`${invoiceIds.length} fatura indirildi`);
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
    verifyInvoice
  };
}
