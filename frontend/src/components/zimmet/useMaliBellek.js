import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useMaliBellek(companyId, adminId, adminName, activeTab) {
  const [maliBellekData, setMaliBellekData] = useState([]);
  const [maliBellekLoading, setMaliBellekLoading] = useState(false);
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  });
  const [maliBellekAllLogs, setMaliBellekAllLogs] = useState([]);
  const [maliBellekSearch, setMaliBellekSearch] = useState("");
  const [maliBellekFilterCollected, setMaliBellekFilterCollected] = useState(false);
  const [maliBellekFilterNotCollected, setMaliBellekFilterNotCollected] = useState(false);

  // Month options (last 24 months)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 1; i <= 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  }, []);

  const fetchMaliBellek = useCallback(async () => {
    if (!companyId) return;
    setMaliBellekLoading(true);
    try {
      const res = await axios.get(`${API}/companies/${companyId}/mali-bellek?year_month=${selectedYearMonth}`);
      const sorted = (res.data.products || []).sort((a, b) => {
        const aCollected = a.mali_bellek?.is_collected ? 1 : 0;
        const bCollected = b.mali_bellek?.is_collected ? 1 : 0;
        if (bCollected !== aCollected) return bCollected - aCollected;
        return a.name.localeCompare(b.name, 'tr');
      });
      setMaliBellekData(sorted);
      
      const logsRes = await axios.get(`${API}/companies/${companyId}/mali-bellek-logs?year_month=${selectedYearMonth}`);
      setMaliBellekAllLogs(logsRes.data || []);
    } catch (err) {
      if (!err.handled) {
      toast.error("Mali bellek verileri yüklenemedi");
      }
    } finally {
      setMaliBellekLoading(false);
    }
  }, [companyId, selectedYearMonth]);

  const toggleMaliBellek = useCallback(async (productId) => {
    try {
      await axios.post(`${API}/mali-bellek/${productId}/toggle?year_month=${selectedYearMonth}`, {
        admin_id: adminId,
        admin_name: adminName
      });
      fetchMaliBellek();
    } catch (err) {
      if (!err.handled) {
      toast.error("İşlem başarısız");
      }
    }
  }, [selectedYearMonth, adminId, adminName, fetchMaliBellek]);

  // Filtered Mali Bellek data
  const filteredMaliBellekData = useMemo(() => {
    let result = [...maliBellekData];
    
    if (maliBellekSearch.trim()) {
      const q = maliBellekSearch.toLowerCase();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.pos_serial?.toLowerCase().includes(q) ||
        p.pos_terminal?.toLowerCase().includes(q) ||
        p.assigned_to_courier_name?.toLowerCase().includes(q)
      );
    }
    
    if (maliBellekFilterCollected || maliBellekFilterNotCollected) {
      result = result.filter(p => {
        if (maliBellekFilterCollected && p.mali_bellek?.is_collected) return true;
        if (maliBellekFilterNotCollected && !p.mali_bellek?.is_collected) return true;
        return false;
      });
    }
    
    return result;
  }, [maliBellekData, maliBellekSearch, maliBellekFilterCollected, maliBellekFilterNotCollected]);

  // Stats
  const collectedCount = useMemo(() => 
    maliBellekData.filter(p => p.mali_bellek?.is_collected).length, 
    [maliBellekData]
  );
  
  const notCollectedCount = useMemo(() => 
    maliBellekData.filter(p => !p.mali_bellek?.is_collected).length, 
    [maliBellekData]
  );

  // Fetch when tab is active
  useEffect(() => {
    if (activeTab === "mali_bellek" && companyId) {
      fetchMaliBellek();
    }
  }, [activeTab, selectedYearMonth, companyId, fetchMaliBellek]);

  return {
    maliBellekData,
    maliBellekLoading,
    selectedYearMonth,
    setSelectedYearMonth,
    maliBellekAllLogs,
    maliBellekSearch,
    setMaliBellekSearch,
    maliBellekFilterCollected,
    setMaliBellekFilterCollected,
    maliBellekFilterNotCollected,
    setMaliBellekFilterNotCollected,
    monthOptions,
    filteredMaliBellekData,
    collectedCount,
    notCollectedCount,
    toggleMaliBellek,
  };
}
