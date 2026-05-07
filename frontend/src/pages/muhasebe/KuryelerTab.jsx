import { useRef, useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { PageLoading } from "@/components/ui/loading-spinner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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
    loadingBalance,
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
    handleUnarchive,
    loadMore,
    exportPDF,
    fetchTransactions,
    fetchEntityBalance,
    getDateDisplayText,
    addJetpuan,
    setAddJetpuan,
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
  
  // Mobil görünüm state'i
  const [mobileDetailView, setMobileDetailView] = useState(false);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  // Taksitli Ürün State'leri
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [installmentProducts, setInstallmentProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ 
    name: "", 
    installment_type: "fixed",
    installment_amount: "", 
    installment_count: "",
    total_amount: "",
    withdrawal_percent: ""
  });
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
    
    const inst_type = newProduct.installment_type || "fixed";
    
    // Validation
    if (!newProduct.name) {
      toast.error("Ürün adı zorunlu");
      return;
    }
    
    let payload = {
      courier_id: selectedEntity.id,
      company_id: companyId,
      name: newProduct.name,
      installment_type: inst_type,
      admin_id: adminId,
      admin_name: adminName,
      installment_amount: 0,
      installment_count: 0
    };
    
    if (inst_type === "fixed") {
      const amount = parseFloat(newProduct.installment_amount);
      const count = parseInt(newProduct.installment_count);
      if (amount <= 0 || count <= 0 || isNaN(amount) || isNaN(count)) {
        toast.error("Tutar ve sayı zorunlu (>0)");
        return;
      }
      payload.installment_amount = amount;
      payload.installment_count = count;
    } else {
      const total = parseFloat(newProduct.total_amount);
      const percent = parseFloat(newProduct.withdrawal_percent);
      if (total <= 0 || percent <= 0 || percent > 100 || isNaN(total) || isNaN(percent)) {
        toast.error("Toplam borç ve yüzde (1-100) zorunlu");
        return;
      }
      payload.total_amount = total;
      payload.withdrawal_percent = percent;
    }

    setAddingProduct(true);
    try {
      await axios.post(`${API}/couriers/${selectedEntity.id}/installment-products`, payload);
      toast.success("Taksitli ürün eklendi");
      setNewProduct({ 
        name: "", installment_type: "fixed",
        installment_amount: "", installment_count: "",
        total_amount: "", withdrawal_percent: ""
      });
      setShowInstallmentModal(false);
      fetchInstallmentProducts(selectedEntity.id);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Ürün eklenemedi");
      }
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
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Taksit alınamadı");
      }
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
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "Ürün silinemedi");
          }
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
          if (!err.handled) {
            toast.error("İşlem silinemedi");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // Handle Archive with confirm modal
  const handleArchiveWithConfirm = (entityId) => {
    const entity = displayList.find(e => e.id === entityId);
    setConfirmConfig({
      title: "Kurye Arşivle",
      description: `"${entity?.name || 'Bu kurye'}" kuryesini arşivlemek istediğinize emin misiniz?`,
      onConfirm: async () => {
        await handleArchive(entityId, true);
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  // Handle Unarchive with confirm modal
  const handleUnarchiveWithConfirm = (entityId) => {
    const entity = displayList.find(e => e.id === entityId);
    setConfirmConfig({
      title: "Kurye Arşivden Çıkar",
      description: `"${entity?.name || 'Bu kurye'}" kuryesini arşivden çıkarmak istediğinize emin misiniz?`,
      onConfirm: async () => {
        await handleUnarchive(entityId);
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

  // Mobil için kurye seçme - detay görünümüne geç
  const handleMobileSelect = (entity) => {
    handleSelect(entity);
    // Mobilde detay görünümüne geç
    if (window.innerWidth < 1024) {
      setMobileDetailView(true);
    }
  };

  // Mobil geri butonu
  const handleMobileBack = () => {
    setMobileDetailView(false);
  };

  if (loading) return <PageLoading />;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Sol Panel - Kurye Listesi (mobilde detay görünümünde gizle) */}
      <div className={`${mobileDetailView ? 'hidden' : 'block'} lg:block`}>
        <CourierList
          displayList={displayList}
          showArchived={showArchived}
          setShowArchived={setShowArchived}
          selectedEntity={selectedEntity}
          totalBalance={totalBalance}
          balancesMap={balancesMap}
          listSearchQuery={listSearchQuery}
          setListSearchQuery={setListSearchQuery}
          onSelect={handleMobileSelect}
        />
      </div>

      {/* Sağ Panel - İşlemler (mobilde sadece detay görünümünde göster) */}
      <div ref={transactionRef} className={`flex-1 border-2 border-border bg-white flex flex-col ${mobileDetailView ? 'block' : 'hidden lg:flex'}`} style={{ height: 'calc(100vh - 220px)' }}>
        {/* Mobil Geri Butonu */}
        {selectedEntity && (
          <div className="lg:hidden p-2 border-b-2 border-border bg-slate-100">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMobileBack}
              className="h-8 text-sm font-medium"
              data-testid="mobile-back-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Listeye Dön
            </Button>
          </div>
        )}
        <CourierTransactions
          selectedEntity={selectedEntity}
          showArchived={showArchived}
          balance={balance}
          loadingBalance={loadingBalance}
          amount={amount}
          setAmount={setAmount}
          description={description}
          setDescription={setDescription}
          isHakedis={isHakedis}
          setIsHakedis={setIsHakedis}
          addJetpuan={addJetpuan}
          setAddJetpuan={setAddJetpuan}
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
          handleArchive={handleArchiveWithConfirm}
          handleUnarchive={handleUnarchiveWithConfirm}
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

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        variant="danger"
      />
    </div>
  );
}
