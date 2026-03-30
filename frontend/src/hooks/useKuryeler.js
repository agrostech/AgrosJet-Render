import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useKuryeler(companyId) {
  const [activeCouriers, setActiveCouriers] = useState([]);
  const [inactiveCouriers, setInactiveCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  const fetchCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        axios.get(`${API}/companies/${companyId}/couriers`),
        axios.get(`${API}/companies/${companyId}/couriers/inactive`)
      ]);
      
      setActiveCouriers(activeRes.data.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr')));
      setInactiveCouriers(inactiveRes.data.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr')));
    } catch (err) {
      if (!err.handled) {
        toast.error("Kuryeler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchCompanyName = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}`);
      setCompanyName(res.data.name);
    } catch (err) {
      console.error("Şirket bilgisi alınamadı");
    }
  }, [companyId]);

  useEffect(() => {
    fetchCouriers();
    fetchCompanyName();
  }, [fetchCouriers, fetchCompanyName]);

  // Actions
  const searchCourier = async (phone) => {
    const res = await axios.get(`${API}/couriers/search?phone=${phone}`);
    return res.data;
  };

  const addCourier = async (phone) => {
    await axios.post(`${API}/companies/${companyId}/couriers`, { phone });
    toast.success("Kurye şirkete eklendi");
    await fetchCouriers();
  };

  const addGhostCourier = async (name) => {
    await axios.post(`${API}/companies/${companyId}/couriers/ghost`, { name });
    toast.success("Hayalet kurye oluşturuldu");
    await fetchCouriers();
  };

  const mergeCouriers = async (ghostCourierId, realCourierId) => {
    const res = await axios.post(`${API}/couriers/merge`, {
      ghost_courier_id: ghostCourierId,
      real_courier_id: realCourierId
    });
    toast.success(res.data.message);
    fetchCouriers();
  };

  const updateCourier = async (courierId, data) => {
    const res = await axios.put(`${API}/couriers/${courierId}`, data);
    if (res.data.password_changed) {
      toast.success("Kurye güncellendi. Şifre değiştiği için oturumu kapatıldı.");
    } else {
      toast.success("Kurye güncellendi");
    }
    fetchCouriers();
  };

  const removeCourier = async (courierId) => {
    // Check balance first
    try {
      const balanceRes = await axios.get(`${API}/transactions/courier/${courierId}`);
      const balance = balanceRes.data.balance;
      
      if (balance !== 0) {
        const balanceText = balance > 0 
          ? `Bu kuryeye ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance))} borcunuz var.`
          : `Bu kuryeden ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Math.abs(balance))} alacağınız var.`;
        
        toast.error(`Kurye silinemez! ${balanceText} Önce bakiyeyi sıfırlayın.`);
        return false;
      }
    } catch (err) { /* ignore */ }
    
    await axios.delete(`${API}/companies/${companyId}/couriers/${courierId}`);
    toast.success("Kurye şirketten çıkarıldı");
    fetchCouriers();
    return true;
  };

  const startTermination = async (courierId) => {
    await axios.post(`${API}/companies/${companyId}/couriers/${courierId}/start-termination`);
    toast.success("Fesih süreci başlatıldı");
    fetchCouriers();
  };

  const cancelTermination = async (courierId) => {
    await axios.post(`${API}/companies/${companyId}/couriers/${courierId}/cancel-termination`);
    toast.success("Fesih süreci iptal edildi");
    fetchCouriers();
  };

  const deactivateCourier = async (courierId) => {
    await axios.put(`${API}/companies/${companyId}/couriers/${courierId}/deactivate`);
    toast.success("Kurye pasife alındı");
    fetchCouriers();
  };

  const activateCourier = async (courierId) => {
    await axios.put(`${API}/companies/${companyId}/couriers/${courierId}/activate`);
    toast.success("Kurye aktife alındı");
    fetchCouriers();
  };

  return {
    activeCouriers,
    inactiveCouriers,
    loading,
    companyName,
    refetch: fetchCouriers,
    searchCourier,
    addCourier,
    addGhostCourier,
    mergeCouriers,
    updateCourier,
    removeCourier,
    startTermination,
    cancelTermination,
    deactivateCourier,
    activateCourier
  };
}
