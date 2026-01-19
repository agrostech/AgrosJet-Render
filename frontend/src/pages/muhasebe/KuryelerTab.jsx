import { useRef, useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { 
  useAccountingTab, 
  getLocalDateTimeString 
} from "@/hooks/useAccountingTab";
import {
  CourierList,
  CourierTransactions,
  EditTransactionModal,
  AddInstallmentModal,
  InstallmentListModal,
} from "@/components/muhasebe";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function KuryelerTab({ companyId, adminId, adminName, companyLogo, companyName, transactionRef, onSelect }) {
  const listRef = useRef(null);
  
  const {
    displayList,
    showArchived,
    setShowArchived,
    selectedEntity,
    loading,
    filteredTransactions,
    totalCount,
    hasMore,
    loadingMore,
    balance,
    balancesMap,
    totalBalance,
    amount,
    setAmount,
    description,
    setDescription,
    isHakedis,
    setIsHakedis,
    submitting,
    useCustomDate,
    setUseCustomDate,
    txDate,
    setTxDate,
    searchQuery,
    setSearchQuery,
    handleSelect,
    handlePayment,
    handleUpdateTransaction,
    handleArchive,
    loadMore,
    exportPDF,
    fetchTransactions,
    fetchEntityBalance,
    getDateDisplayText,
  } = useAccountingTab({
    entityType: "courier",
    companyId,
    adminId,
    adminName,
    companyLogo,
    companyName,
    onSelect,
  });

  // State'ler
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [editingTx, setEditingTx] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", description: "", is_hakedis: false });
  const [editLoading, setEditLoading] = useState(false);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  // Taksitli Ürün State'leri
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [installmentProducts, setInstallmentProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: "", installment_amount: "", installment_count: "" });
  const [addingProduct, setAddingProduct] = useState(false);
  const [payingInstallment, setPayingInstallment] = useState(null);
  const [installmentDate, setInstallmentDate] = useState("");
  const [useInstallmentCustomDate, setUseInstallmentCustomDate] = useState(false);
  const [showInstallmentListModal, setShowInstallmentListModal] = useState(false);

  // Toplam kalan taksit sayısı
  const totalRemainingInstallments = installmentProducts.reduce(
    (sum, p) => sum + p.remaining_installments, 0
  );

  // Taksitli ürünleri getir
  const fetchInstallmentProducts = async (courierId) => {
    try {
      const res = await axios.get(`${API}/couriers/${courierId}/installment-products?include_completed=false`);
      setInstallmentProducts(res.data);
    } catch (err) {
      console.error("Taksitli ürünler yüklenemedi", err);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      fetchInstallmentProducts(selectedEntity.id);
    } else {
      setInstallmentProducts([]);
    }
  }, [selectedEntity]);

  // Taksitli ürün ekle
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!selectedEntity) return;
    
    const amount = parseFloat(newProduct.installment_amount);
    const count = parseInt(newProduct.installment_count);
    
    if (!newProduct.name || amount <= 0 || count <= 0) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    setAddingProduct(true);
    try {
      await axios.post(`${API}/couriers/${selectedEntity.id}/installment-products`, {
        courier_id: selectedEntity.id,
        company_id: companyId,
        name: newProduct.name,
        installment_amount: amount,
        installment_count: count,
        admin_id: adminId,
        admin_name: adminName
      });
      toast.success("Taksitli ürün eklendi");
      setNewProduct({ name: "", installment_amount: "", installment_count: "" });
      setShowInstallmentModal(false);
      fetchInstallmentProducts(selectedEntity.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ürün eklenemedi");
    } finally {
      setAddingProduct(false);
    }
  };

  // Taksit öde
  const handlePayInstallment = async (product) => {
    setPayingInstallment(product.id);
    try {
      const payload = {
        admin_id: adminId,
        admin_name: adminName
      };
      if (useInstallmentCustomDate && installmentDate) {
        payload.custom_date = new Date(installmentDate).toISOString();
      }
      
      const res = await axios.post(`${API}/installment-products/${product.id}/pay`, payload);
      toast.success(res.data.message);
      fetchInstallmentProducts(selectedEntity.id);
      if (selectedEntity) {
        fetchTransactions(selectedEntity.id);
        fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
      }
      setInstallmentDate("");
      setUseInstallmentCustomDate(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Taksit alınamadı");
    } finally {
      setPayingInstallment(null);
    }
  };

  // Taksitli ürün sil
  const handleDeleteProduct = async (product) => {
    setConfirmConfig({
      title: "Ürün Silme",
      description: `"${product.name}" ürününü silmek istediğinize emin misiniz?`,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/installment-products/${product.id}?admin_id=${adminId}&admin_name=${encodeURIComponent(adminName)}`);
          toast.success("Ürün silindi");
          fetchInstallmentProducts(selectedEntity.id);
        } catch (err) {
          toast.error(err.response?.data?.detail || "Ürün silinemedi");
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // İşlem sil (taksit geri ekle)
  const handleDeleteTransactionWithRestore = async (txId, tx) => {
    setConfirmConfig({
      title: "İşlem Silme",
      description: "Bu işlemi silmek istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/transactions/${txId}/with-installment-restore`, {
            data: { admin_id: adminId, admin_name: adminName }
          });
          toast.success(tx?.installment_product_id ? "İşlem silindi, taksit geri eklendi" : "İşlem silindi");
          
          if (selectedEntity) {
            fetchTransactions(selectedEntity.id);
            fetchEntityBalance(selectedEntity.id, selectedEntity.is_archived);
            fetchInstallmentProducts(selectedEntity.id);
          }
        } catch (err) {
          toast.error("İşlem silinemedi");
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // Edit modal
  const openEditModal = (tx) => {
    setEditingTx(tx);
    setEditForm({
      amount: tx.amount.toString(),
      description: tx.description || "",
      is_hakedis: tx.is_hakedis || false
    });
  };

  const handleEditSubmit = async () => {
    if (!editingTx) return;
    setEditLoading(true);
    const success = await handleUpdateTransaction(editingTx.id, {
      amount: parseFloat(editForm.amount),
      description: editForm.description,
      is_hakedis: editForm.is_hakedis
    });
    setEditLoading(false);
    if (success) {
      setEditingTx(null);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Sol Panel - Kurye Listesi */}
      <CourierList
        displayList={displayList}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        selectedEntity={selectedEntity}
        totalBalance={totalBalance}
        balancesMap={balancesMap}
        listSearchQuery={listSearchQuery}
        setListSearchQuery={setListSearchQuery}
        onSelect={handleSelect}
      />

      {/* Sağ Panel - İşlemler */}
      <div ref={transactionRef} className="flex-1 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <CourierTransactions
          selectedEntity={selectedEntity}
          showArchived={showArchived}
          balance={balance}
          amount={amount}
          setAmount={setAmount}
          description={description}
          setDescription={setDescription}
          isHakedis={isHakedis}
          setIsHakedis={setIsHakedis}
          submitting={submitting}
          useCustomDate={useCustomDate}
          setUseCustomDate={setUseCustomDate}
          txDate={txDate}
          setTxDate={setTxDate}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredTransactions={filteredTransactions}
          totalCount={totalCount}
          hasMore={hasMore}
          loadingMore={loadingMore}
          totalRemainingInstallments={totalRemainingInstallments}
          transactionRef={transactionRef}
          getDateDisplayText={getDateDisplayText}
          getLocalDateTimeString={getLocalDateTimeString}
          handlePayment={handlePayment}
          handleArchive={handleArchive}
          loadMore={loadMore}
          exportPDF={exportPDF}
          onOpenEditModal={openEditModal}
          onDeleteTransaction={handleDeleteTransactionWithRestore}
          onOpenInstallmentListModal={() => setShowInstallmentListModal(true)}
        />
      </div>

      {/* Modals */}
      <EditTransactionModal
        editingTx={editingTx}
        setEditingTx={setEditingTx}
        editForm={editForm}
        setEditForm={setEditForm}
        editLoading={editLoading}
        onSubmit={handleEditSubmit}
      />

      <AddInstallmentModal
        open={showInstallmentModal}
        onOpenChange={setShowInstallmentModal}
        newProduct={newProduct}
        setNewProduct={setNewProduct}
        addingProduct={addingProduct}
        onSubmit={handleAddProduct}
      />

      <InstallmentListModal
        open={showInstallmentListModal}
        onOpenChange={setShowInstallmentListModal}
        installmentProducts={installmentProducts}
        totalRemainingInstallments={totalRemainingInstallments}
        payingInstallment={payingInstallment}
        useInstallmentCustomDate={useInstallmentCustomDate}
        setUseInstallmentCustomDate={setUseInstallmentCustomDate}
        installmentDate={installmentDate}
        setInstallmentDate={setInstallmentDate}
        onPayInstallment={handlePayInstallment}
        onDeleteProduct={handleDeleteProduct}
        onOpenAddModal={() => {
          setShowInstallmentListModal(false);
          setShowInstallmentModal(true);
        }}
      />
    </div>
  );
}
