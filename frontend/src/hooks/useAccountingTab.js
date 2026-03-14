import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RobotoRegular } from "@/utils/robotoFont";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Utility functions
export const getLocalDateTimeString = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

export const isApproximatelyNow = (dateStr) => {
  if (!dateStr) return true;
  const inputDate = new Date(dateStr);
  const now = new Date();
  const diff = Math.abs(now.getTime() - inputDate.getTime());
  return diff < 2 * 60 * 1000;
};

export const formatMoney = (amt) => 
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Math.abs(amt)) + ' TL';

export const formatCurrency = (amt) => {
  const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Math.abs(amt));
  return `${formatted} TL`;
};

export const formatDate = (dateStr) => 
  new Date(dateStr).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const getBalanceLabel = (bal) => {
  if (bal === 0 || bal === undefined) return null;
  if (bal > 0) return { text: `${formatCurrency(bal)}`, color: 'text-green-600 bg-green-50' };
  return { text: `-${formatCurrency(bal)}`, color: 'text-red-600 bg-red-50' };
};

/**
 * Custom hook for accounting tab operations
 * @param {Object} config - Configuration object
 * @param {string} config.entityType - 'courier', 'business', or 'vendor'
 * @param {string} config.companyId - Company ID
 * @param {string} config.adminId - Admin ID for logging
 * @param {string} config.adminName - Admin name for logging
 * @param {string} config.companyLogo - Company logo URL for PDF
 * @param {string} config.companyName - Company name for PDF
 * @param {Function} config.onSelect - Callback when entity is selected
 */
export function useAccountingTab({
  entityType,
  companyId,
  adminId,
  adminName,
  companyLogo,
  companyName,
  onSelect
}) {
  // Entity list state
  const [entities, setEntities] = useState([]);
  const [archivedEntities, setArchivedEntities] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  // Transaction state
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [balance, setBalance] = useState(0);
  
  // Ref for tracking current transactions length (for loadMore)
  const transactionsRef = useRef([]);

  // Balance maps
  const [entityBalances, setEntityBalances] = useState({});
  const [archivedBalances, setArchivedBalances] = useState({});

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isHakedis, setIsHakedis] = useState(false);
  const [addJetpuan, setAddJetpuan] = useState(true); // JetPuan eklensin mi?
  const [submitting, setSubmitting] = useState(false);
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [txDate, setTxDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // API endpoints based on entity type
  const endpoints = useMemo(() => ({
    courier: {
      list: `/companies/${companyId}/couriers`,
      transactions: (id) => `/transactions/courier/${id}`,
      archive: (id) => `/companies/${companyId}/couriers/${id}/archive`,
      unarchive: (id) => `/companies/${companyId}/couriers/${id}/unarchive`,
      delete: null, // Couriers can't be deleted from accounting
    },
    business: {
      list: `/companies/${companyId}/businesses`,
      transactions: (id) => `/transactions/business/${id}`,
      archive: (id) => `/businesses/${id}/archive`,
      unarchive: (id) => `/businesses/${id}/unarchive`,
      delete: (id) => `/businesses/${id}`,
    },
    restaurant: {
      list: `/companies/${companyId}/accounting-restaurants`,
      transactions: (id) => `/transactions/restaurant/${id}`,
      archive: (id) => `/accounting-restaurants/${id}/archive`,
      unarchive: (id) => `/accounting-restaurants/${id}/unarchive`,
      delete: null, // Restaurants managed from admin panel
    },
    vendor: {
      list: `/companies/${companyId}/vendors`,
      transactions: (id) => `/transactions/vendor/${id}`,
      archive: (id) => `/vendors/${id}/archive`,
      unarchive: (id) => `/vendors/${id}/unarchive`,
      delete: (id) => `/vendors/${id}`,
    },
  }), [companyId]);

  const endpoint = endpoints[entityType];

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const query = searchQuery.toLowerCase().trim();
    return transactions.filter(tx =>
      tx.description?.toLowerCase().includes(query) ||
      new Date(tx.created_at).toLocaleDateString('tr-TR').includes(query)
    );
  }, [transactions, searchQuery]);

  // Total balance
  const totalBalance = useMemo(() => {
    const balances = showArchived ? archivedBalances : entityBalances;
    return Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
  }, [showArchived, entityBalances, archivedBalances]);

  // Display list and balances
  const displayList = showArchived ? archivedEntities : entities;
  const balancesMap = showArchived ? archivedBalances : entityBalances;

  // Fetch entity balance
  const fetchEntityBalance = useCallback(async (id, isArchived = false) => {
    try {
      const res = await axios.get(`${API}${endpoint.transactions(id)}?limit=1`);
      if (isArchived) {
        setArchivedBalances(prev => ({ ...prev, [id]: res.data.balance }));
      } else {
        setEntityBalances(prev => ({ ...prev, [id]: res.data.balance }));
      }
    } catch (err) { /* ignore */ }
  }, [endpoint]);

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}${endpoint.list}`);
      let data = res.data;
      
      // Kuryeler için: is_admin_linked olanları filtrele (Cariler'de gösterilecek)
      if (entityType === 'courier') {
        data = data.filter(c => !c.is_admin_linked);
      }
      
      // Alfabetik sıralama
      const sortedData = data.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', 'tr')
      );
      setEntities(sortedData);
      if (sortedData.length > 0 && !selectedEntity) {
        setSelectedEntity(sortedData[0]);
      }
      // Tüm bakiyeleri paralel olarak çek
      const balancePromises = sortedData.map(e => 
        axios.get(`${API}${endpoint.transactions(e.id)}?limit=1`)
          .then(res => ({ id: e.id, balance: res.data.balance }))
          .catch(() => ({ id: e.id, balance: 0 }))
      );
      const balances = await Promise.all(balancePromises);
      const balanceMap = {};
      balances.forEach(b => { balanceMap[b.id] = b.balance; });
      setEntityBalances(balanceMap);
    } catch (err) {
      if (!err.handled) {
        toast.error("Veriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, [endpoint, selectedEntity]);

  // Fetch archived entities
  const fetchArchivedEntities = useCallback(async () => {
    try {
      const res = await axios.get(`${API}${endpoint.list}?include_archived=true`);
      const archived = res.data.filter(e => e.is_archived);
      // Alfabetik sıralama
      const sortedArchived = archived.sort((a, b) => 
        (a.name || '').localeCompare(b.name || '', 'tr')
      );
      setArchivedEntities(sortedArchived);
      // Tüm arşiv bakiyelerini paralel olarak çek
      const balancePromises = sortedArchived.map(e => 
        axios.get(`${API}${endpoint.transactions(e.id)}?limit=1`)
          .then(res => ({ id: e.id, balance: res.data.balance }))
          .catch(() => ({ id: e.id, balance: 0 }))
      );
      const balances = await Promise.all(balancePromises);
      const balanceMap = {};
      balances.forEach(b => { balanceMap[b.id] = b.balance; });
      setArchivedBalances(balanceMap);
    } catch (err) { /* ignore */ }
  }, [endpoint]);

  // Fetch transactions
  const fetchTransactions = useCallback(async (entityId, append = false, currentLength = 0) => {
    try {
      const skip = append ? currentLength : 0;
      const res = await axios.get(`${API}${endpoint.transactions(entityId)}?skip=${skip}&limit=10`);
      if (append) {
        setTransactions(prev => {
          const newTx = [...prev, ...res.data.transactions];
          transactionsRef.current = newTx;
          return newTx;
        });
      } else {
        setTransactions(res.data.transactions);
        transactionsRef.current = res.data.transactions;
      }
      setBalance(res.data.balance);
      setTotalCount(res.data.total_count);
      setHasMore(res.data.has_more);
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlemler yüklenemedi");
      }
    }
  }, [endpoint]);

  // Load more transactions - ref kullanarak güncel length'i al
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !selectedEntity) return;
    setLoadingMore(true);
    try {
      const currentLength = transactionsRef.current.length;
      await fetchTransactions(selectedEntity.id, true, currentLength);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, selectedEntity, fetchTransactions]);

  // Select entity
  const handleSelect = useCallback((entity) => {
    setSelectedEntity(entity);
    if (onSelect) onSelect();
  }, [onSelect]);

  // Handle payment
  const handlePayment = useCallback(async (type) => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Geçerli bir tutar girin");
      return;
    }
    if (!selectedEntity) return;

    setSubmitting(true);
    try {
      const payload = {
        entity_type: entityType,
        entity_id: selectedEntity.id,
        company_id: companyId,
        type: type === "in" ? "payment_in" : "payment_out",
        amount: parseFloat(amount),
        description: description || (type === "in" ? "Alınan" : "Verilen"),
        // Hakediş sadece kuryeler için ve sadece "Alınan" (payment_in/kırmızı buton) ile çalışır
        is_hakedis: type === "in" && entityType === "courier" ? isHakedis : false,
        // JetPuan eklensin mi? (sadece hakediş işlemlerinde geçerli)
        add_jetpuan: type === "in" && entityType === "courier" && isHakedis ? addJetpuan : false,
        admin_id: adminId,
        admin_name: adminName
      };
      if (useCustomDate && txDate) {
        payload.custom_date = txDate;
      }
      await axios.post(`${API}/transactions`, payload);
      toast.success(type === "in" ? "Alınan kaydedildi" : "Verilen kaydedildi");
      
      // Reset form
      setAmount("");
      setDescription("");
      setIsHakedis(false);
      setAddJetpuan(true);
      setUseCustomDate(false);
      setTxDate("");
      
      // Refresh data
      fetchTransactions(selectedEntity.id);
      fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem başarısız");
      }
    } finally {
      setSubmitting(false);
    }
  }, [amount, selectedEntity, entityType, companyId, description, isHakedis, addJetpuan, adminId, adminName, useCustomDate, txDate, fetchTransactions, fetchEntityBalance]);

  // Delete transaction
  const handleDeleteTransaction = useCallback(async (txId, skipConfirm = false) => {
    if (!skipConfirm) {
      return { needsConfirm: true, txId };
    }
    if (!selectedEntity) return;

    try {
      await axios.delete(`${API}/transactions/${txId}`, {
        data: { admin_id: adminId, admin_name: adminName }
      });
      toast.success("İşlem silindi");
      fetchTransactions(selectedEntity.id);
      fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
    } catch (err) {
      if (!err.handled) {
        toast.error("İşlem silinemedi");
      }
    }
  }, [selectedEntity, adminId, adminName, fetchTransactions, fetchEntityBalance]);

  const confirmDeleteTransaction = useCallback(async (txId) => {
    if (!selectedEntity) return;
    try {
      await axios.delete(`${API}/transactions/${txId}`, {
        data: { admin_id: adminId, admin_name: adminName }
      });
      toast.success("İşlem silindi");
      fetchTransactions(selectedEntity.id);
      fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
    } catch (err) {
      // Yetki hatası zaten axiosConfig'de gösterildi
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error("İşlem silinemedi");
        }
      }
    }
  }, [selectedEntity, adminId, adminName, fetchTransactions, fetchEntityBalance]);

  // Update transaction
  const handleUpdateTransaction = useCallback(async (txId, updates) => {
    if (!selectedEntity) return;

    try {
      await axios.put(`${API}/transactions/${txId}`, {
        ...updates,
        admin_id: adminId,
        admin_name: adminName
      });
      toast.success("İşlem güncellendi");
      fetchTransactions(selectedEntity.id);
      fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
      return true;
    } catch (err) {
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error(err.response?.data?.detail || "İşlem güncellenemedi");
        }
      }
      return false;
    }
  }, [selectedEntity, adminId, adminName, fetchTransactions, fetchEntityBalance]);

  // Archive entity
  const handleArchive = useCallback(async (id, skipConfirm = false) => {
    if (!skipConfirm) {
      return { needsConfirm: true, id, action: 'archive' };
    }
    try {
      await axios.put(`${API}${endpoint.archive(id)}`);
      toast.success("Arşivlendi");
      if (selectedEntity?.id === id) setSelectedEntity(null);
      fetchEntities();
      fetchArchivedEntities();
    } catch (err) {
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error("Arşivleme başarısız");
        }
      }
    }
  }, [endpoint, selectedEntity, fetchEntities, fetchArchivedEntities]);

  const confirmArchive = useCallback(async (id) => {
    try {
      await axios.put(`${API}${endpoint.archive(id)}`);
      toast.success("Arşivlendi");
      if (selectedEntity?.id === id) setSelectedEntity(null);
      fetchEntities();
      fetchArchivedEntities();
    } catch (err) {
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error("Arşivleme başarısız");
        }
      }
    }
  }, [endpoint, selectedEntity, fetchEntities, fetchArchivedEntities]);

  // Unarchive entity
  const handleUnarchive = useCallback(async (id) => {
    try {
      await axios.put(`${API}${endpoint.unarchive(id)}`);
      toast.success("Arşivden çıkarıldı");
      fetchEntities();
      fetchArchivedEntities();
    } catch (err) {
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error("İşlem başarısız");
        }
      }
    }
  }, [endpoint, fetchEntities, fetchArchivedEntities]);

  // Delete entity (only for business/vendor)
  const handleDelete = useCallback(async (id, skipConfirm = false) => {
    if (!endpoint.delete) return;
    if (!skipConfirm) {
      return { needsConfirm: true, id, action: 'delete' };
    }
    try {
      await axios.delete(`${API}${endpoint.delete(id)}`);
      toast.success("Silindi");
      if (selectedEntity?.id === id) setSelectedEntity(null);
      fetchEntities();
      fetchArchivedEntities();
    } catch (err) {
      if (!err.permissionError) {
        if (!err.handled) {
          toast.error("Silinemedi");
        }
      }
    }
  }, [endpoint, selectedEntity, fetchEntities, fetchArchivedEntities]);

  const confirmDelete = useCallback(async (id) => {
    if (!endpoint.delete) return;
    try {
      await axios.delete(`${API}${endpoint.delete(id)}`);
      toast.success("Silindi");
      if (selectedEntity?.id === id) setSelectedEntity(null);
      fetchEntities();
      fetchArchivedEntities();
    } catch (err) {
      if (!err.handled) {
        toast.error("Silinemedi");
      }
    }
  }, [endpoint, selectedEntity, fetchEntities, fetchArchivedEntities]);

  // Export PDF
  const exportPDF = useCallback(async () => {
    if (!selectedEntity || transactions.length === 0) {
      toast.error("İndirilecek işlem bulunamadı");
      return;
    }

    const entityLabels = {
      courier: "Kurye",
      business: "İşletme",
      vendor: "Cari"
    };

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Add Roboto font
    doc.addFileToVFS("Roboto-Regular.ttf", RobotoRegular);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto");

    // Header
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 32, pageWidth - 14, 32);

    // Logo
    if (companyLogo && companyLogo.trim() !== '') {
      try {
        // Relative path ise backend URL'yi başına ekle, tam URL ise proxy kullan
        let logoUrl;
        if (companyLogo.startsWith('/')) {
          logoUrl = `${process.env.REACT_APP_BACKEND_URL}${companyLogo}`;
        } else {
          logoUrl = `${API}/proxy-image?url=${encodeURIComponent(companyLogo)}`;
        }
        const response = await fetch(logoUrl);
        if (response.ok) {
          const blob = await response.blob();
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          const logoSize = 25;
          doc.addImage(dataUrl, 'PNG', pageWidth - logoSize - 14, 4, logoSize, logoSize);
        }
      } catch (e) {
        console.log("Logo yüklenemedi:", e);
      }
    }

    doc.setTextColor(51, 51, 51);
    doc.setFontSize(18);
    doc.text("İşlem Geçmişi Raporu", 14, 15);
    doc.setFontSize(11);
    doc.text(`${entityLabels[entityType]}: ${selectedEntity.name}`, 14, 26);

    // Summary box
    doc.setFillColor(250, 250, 250);
    doc.rect(14, 38, pageWidth - 28, 14, 'F');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);

    const cName = companyName || 'Şirket';
    let balanceText;
    if (balance === 0) {
      balanceText = '0,00 TL';
    } else if (balance > 0) {
      balanceText = `${formatMoney(balance)} (${cName} Alacaklı)`;
    } else {
      balanceText = `${formatMoney(balance)} (${cName} Borçlu)`;
    }

    doc.text(`Rapor: ${new Date().toLocaleDateString('tr-TR')}  |  Toplam İşlem: ${transactions.length}  |  Bakiye: ${balanceText}`, 20, 46);

    // Table
    const tableData = transactions.map(tx => [
      new Date(tx.created_at).toLocaleDateString('tr-TR') + ' ' + new Date(tx.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      (tx.description || '').substring(0, 40) + (tx.is_hakedis ? ' (Hakediş)' : ''),
      (tx.type === 'payment_out' ? '-' : '') + formatMoney(tx.amount)
    ]);

    autoTable(doc, {
      startY: 58,
      head: [['Tarih', 'Açıklama', 'Tutar']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [70, 130, 180], textColor: 255, font: 'Roboto', fontStyle: 'normal' },
      columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 35, halign: 'right' } },
      styles: { fontSize: 9, font: 'Roboto', fontStyle: 'normal' },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          if (data.cell.raw.startsWith('-')) data.cell.styles.textColor = [200, 0, 0];
          else data.cell.styles.textColor = [0, 128, 0];
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("© 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosTech.", pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
    }

    const safeName = selectedEntity.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '_');
    const formattedBalance = formatMoney(balance).replace(' TL', '').replace(',', '.').replace(/\s/g, '');
    doc.save(`${safeName}.${formattedBalance}TL.pdf`);
    toast.success("PDF indirildi");
  }, [selectedEntity, transactions, entityType, companyLogo, companyName, balance]);

  // Get date display text
  const getDateDisplayText = useCallback(() => {
    if (!useCustomDate) return "Şimdi";
    if (isApproximatelyNow(txDate)) return "Şimdi";
    return new Date(txDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }, [useCustomDate, txDate]);

  // Balance label uses shared utility

  // Initial fetch
  useEffect(() => {
    if (companyId) {
      fetchEntities();
      fetchArchivedEntities();
    }
  }, [companyId, fetchEntities, fetchArchivedEntities]);

  // Fetch transactions when entity changes
  useEffect(() => {
    if (selectedEntity) {
      fetchTransactions(selectedEntity.id);
      setAmount("");
      setDescription("");
      setIsHakedis(false);
      setSearchQuery("");
      setUseCustomDate(false);
      setTxDate("");
    }
  }, [selectedEntity, fetchTransactions]);

  return {
    // Entity list
    entities,
    archivedEntities,
    displayList,
    showArchived,
    setShowArchived,
    selectedEntity,
    loading,
    
    // Transactions
    transactions,
    filteredTransactions,
    totalCount,
    hasMore,
    loadingMore,
    balance,
    
    // Balances
    entityBalances,
    archivedBalances,
    balancesMap,
    totalBalance,
    
    // Form state
    amount,
    setAmount,
    description,
    setDescription,
    isHakedis,
    setIsHakedis,
    addJetpuan,
    setAddJetpuan,
    submitting,
    useCustomDate,
    setUseCustomDate,
    txDate,
    setTxDate,
    searchQuery,
    setSearchQuery,
    
    // Actions
    handleSelect,
    handlePayment,
    handleDeleteTransaction,
    confirmDeleteTransaction,
    handleUpdateTransaction,
    handleArchive,
    confirmArchive,
    handleUnarchive,
    handleDelete,
    confirmDelete,
    loadMore,
    exportPDF,
    fetchEntities,
    fetchArchivedEntities,
    fetchTransactions,
    fetchEntityBalance,
    
    // Utilities
    getDateDisplayText,
    getBalanceLabel,
    
    // Config
    canDelete: !!endpoint.delete,
    canHakedis: entityType === "courier",
  };
}
