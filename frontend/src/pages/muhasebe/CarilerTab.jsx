import { PageLoading } from "@/components/ui/loading-spinner";
import { useState, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Plus, Minus, Wallet, Trash2, Archive, ArchiveRestore, Search, Download, Clock, Pencil, ArrowLeft, Loader2 } from "lucide-react";
import { 
  useAccountingTab, 
  formatMoney, 
  formatCurrency, 
  formatDate, 
  getLocalDateTimeString 
} from "@/hooks/useAccountingTab";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CarilerTab({ companyId, adminId, adminName, companyLogo, companyName, transactionRef, onSelect }) {
  const listRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", address: "" });
  
  // Mobil görünüm state'i
  const [mobileDetailView, setMobileDetailView] = useState(false);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {}, variant: "default" });

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
    submitting,
    useCustomDate,
    setUseCustomDate,
    txDate,
    setTxDate,
    searchQuery,
    setSearchQuery,
    handleSelect,
    handlePayment,
    handleDeleteTransaction,
    handleUpdateTransaction,
    handleArchive,
    handleDelete,
    handleUnarchive,
    loadMore,
    exportPDF,
    fetchEntities,
    fetchArchivedEntities,
    getDateDisplayText,
    getBalanceLabel,
  } = useAccountingTab({
    entityType: "vendor",
    companyId,
    adminId,
    adminName,
    companyLogo,
    companyName,
    onSelect,
  });

  const [editingTx, setEditingTx] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", description: "" });
  const [editLoading, setEditLoading] = useState(false);

  const openEditModal = (tx) => {
    setEditingTx(tx);
    setEditForm({ amount: tx.amount.toString(), description: tx.description || "" });
  };

  const handleEditSubmit = async () => {
    if (!editingTx) return;
    setEditLoading(true);
    const success = await handleUpdateTransaction(editingTx.id, {
      amount: parseFloat(editForm.amount),
      description: editForm.description
    });
    setEditLoading(false);
    if (success) setEditingTx(null);
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/companies/${companyId}/vendors`, newVendor);
      toast.success("Cari eklendi");
      setShowAddModal(false);
      setNewVendor({ name: "", phone: "", address: "" });
      fetchEntities();
    } catch (err) {
      if (!err.handled) {
        toast.error("Ekleme başarısız");
      }
    }
  };

  // Arama filtresi - useState hook'lar en üstte olmalı
  const [listSearchQuery, setListSearchQuery] = useState("");
  
  const filteredDisplayList = displayList.filter(v => {
    if (!listSearchQuery.trim()) return true;
    return v.name.toLowerCase().includes(listSearchQuery.toLowerCase());
  });

  // Pozitif ve negatif bakiyeleri ayrı hesapla
  const { positiveTotal, negativeTotal } = Object.values(balancesMap || {}).reduce(
    (acc, bal) => {
      if (bal > 0) acc.positiveTotal += bal;
      else if (bal < 0) acc.negativeTotal += bal;
      return acc;
    },
    { positiveTotal: 0, negativeTotal: 0 }
  );

  // Mobil için cari seçme - detay görünümüne geç
  const handleMobileSelect = (entity) => {
    handleSelect(entity);
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
      {/* Sol Panel - Cari Listesi (mobilde detay görünümünde gizle) */}
      <div className={`w-full lg:w-80 flex-shrink-0 border-2 border-border bg-white flex flex-col ${mobileDetailView ? 'hidden' : 'flex'} lg:flex`} style={{ height: 'calc(100vh - 220px)' }}>
        <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-bold text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Cariler ({filteredDisplayList.length})
            </span>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowArchived(!showArchived)}
                className={`text-xs h-7 px-2 ${showArchived ? 'bg-orange-100 text-orange-700' : ''}`}
                data-testid="toggle-archived-vendors"
              >
                {showArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
              </Button>
              {!showArchived && (
                <Button variant="ghost" size="sm" onClick={() => setShowAddModal(true)} className="text-xs h-7 px-2" data-testid="add-vendor-btn">
                  <Plus className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input
              placeholder="Cari ara..."
              value={listSearchQuery}
              onChange={(e) => setListSearchQuery(e.target.value)}
              className="pl-9 h-8 border border-slate-200 rounded-lg text-sm placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              data-testid="search-vendors-list"
            />
          </div>
          <div className="text-xs flex items-center gap-2">
            <span className="text-muted-foreground">Toplam:</span>
            {negativeTotal !== 0 && (
              <span className="text-red-600 font-semibold font-mono">
                {formatCurrency(negativeTotal)}
              </span>
            )}
            {positiveTotal !== 0 && (
              <span className="text-green-600 font-semibold font-mono">
                {formatCurrency(positiveTotal)}
              </span>
            )}
            {negativeTotal === 0 && positiveTotal === 0 && (
              <span className="text-muted-foreground">0 TL</span>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto" ref={listRef}>
          {filteredDisplayList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {listSearchQuery ? "Arama sonucu bulunamadı" : showArchived ? "Arşivlenmiş cari yok" : "Cari bulunamadı"}
            </p>
          ) : (
            filteredDisplayList.map((v) => {
              const bal = balancesMap[v.id];
              const balLabel = getBalanceLabel(bal);
              return (
                <div
                  key={v.id}
                  onClick={() => handleMobileSelect(v)}
                  className={`p-3 border-b border-border cursor-pointer transition-colors ${selectedEntity?.id === v.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"} ${v.is_admin_courier ? "bg-blue-50/50" : ""}`}
                  data-testid={`vendor-item-${v.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-semibold text-sm truncate">{v.name}</p>
                      {v.is_admin_courier && (
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded shrink-0">
                          {v.role === 'superadmin' ? 'S.Admin' : 'Yönetici'}
                        </span>
                      )}
                    </div>
                    {balLabel && (
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${balLabel.color}`}>
                        {balLabel.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sağ Panel - İşlemler (mobilde sadece detay görünümünde göster) */}
      <div ref={transactionRef} className={`flex-1 border-2 border-border bg-white flex flex-col ${mobileDetailView ? 'flex' : 'hidden lg:flex'}`} style={{ height: 'calc(100vh - 220px)' }}>
        {selectedEntity ? (
          <>
            {/* Mobil Geri Butonu */}
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
            {/* Header */}
            <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
              {/* Mobilde: İsim ve bakiye üstte, butonlar altta */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                {/* Üst satır: İsim ve Bakiye */}
                <div className="flex items-center justify-between sm:justify-start sm:gap-4">
                  <div className="min-w-0">
                    <h3 className="font-heading font-bold truncate">{selectedEntity.name}</h3>
                    {selectedEntity.phone && <p className="text-xs text-muted-foreground font-mono">{selectedEntity.phone}</p>}
                  </div>
                  <div className={`text-right px-3 py-1.5 rounded shrink-0 ${loadingBalance ? 'bg-slate-100' : balance > 0 ? 'bg-green-50' : balance < 0 ? 'bg-red-50' : 'bg-slate-100'}`}>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Bakiye</p>
                    {loadingBalance ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />
                    ) : (
                      <p className={`text-sm sm:text-base font-bold font-mono ${balance > 0 ? 'text-green-600' : balance < 0 ? 'text-red-600' : ''}`}>
                        {balance === 0 ? '0 TL' : balance > 0 ? `${formatMoney(balance)}` : `-${formatMoney(balance)}`}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Alt satır (mobilde) / Sağ taraf (masaüstünde): Butonlar */}
                {!showArchived && !selectedEntity.is_admin_courier && (
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => {
                      setConfirmConfig({
                        title: "Arşivle",
                        description: `"${selectedEntity.name}" carisini arşivlemek istediğinize emin misiniz?`,
                        variant: "default",
                        onConfirm: () => handleArchive(selectedEntity.id, true)
                      });
                      setConfirmOpen(true);
                    }} className="h-9 border-2" data-testid="archive-vendor-btn">
                      <Archive className="w-4 h-4" />
                      <span className="ml-1.5 text-xs sm:hidden">Arşiv</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setConfirmConfig({
                        title: "Sil",
                        description: `"${selectedEntity.name}" carisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                        variant: "danger",
                        onConfirm: () => handleDelete(selectedEntity.id, true)
                      });
                      setConfirmOpen(true);
                    }} className="h-9 border-2 hover:bg-red-50 hover:text-red-600" data-testid="delete-vendor-btn">
                      <Trash2 className="w-4 h-4" />
                      <span className="ml-1.5 text-xs sm:hidden">Sil</span>
                    </Button>
                  </div>
                )}
                
                {/* Arşivden Çıkar butonu - sadece arşiv görünümünde */}
                {showArchived && (
                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => {
                      setConfirmConfig({
                        title: "Arşivden Çıkar",
                        description: `"${selectedEntity.name}" carisini arşivden çıkarmak istediğinize emin misiniz?`,
                        variant: "default",
                        onConfirm: () => handleUnarchive(selectedEntity.id)
                      });
                      setConfirmOpen(true);
                    }} className="h-9 border-2 text-green-600 hover:bg-green-50" data-testid="unarchive-vendor-btn">
                      <ArchiveRestore className="w-4 h-4" />
                      <span className="ml-1.5 text-xs sm:hidden">Çıkar</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Ödeme Formu */}
            {!showArchived && (
              <div className="p-3 border-b-2 border-border bg-white flex-shrink-0">
                {/* Mobilde alt alta, masaüstünde yan yana */}
                <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
                  {/* Tutar ve Açıklama - mobilde tam genişlik */}
                  <div className="flex gap-2">
                    <div className="flex-1 sm:w-24 sm:flex-none">
                      <Label className="text-xs font-semibold mb-1 block">Tutar</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        className="h-10 border-2 font-mono"
                        placeholder="0.00"
                        data-testid="amount-input"
                      />
                    </div>
                    <div className="flex-1 sm:w-32 sm:flex-none">
                      <Label className="text-xs font-semibold mb-1 block">Açıklama</Label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="h-10 border-2"
                        placeholder="İsteğe bağlı"
                        data-testid="description-input"
                      />
                    </div>
                  </div>
                  
                  {/* Tarih butonu */}
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!useCustomDate) setTxDate(getLocalDateTimeString());
                        setUseCustomDate(!useCustomDate);
                      }}
                      className={`h-10 px-3 border-2 ${useCustomDate ? 'bg-orange-50 border-orange-300' : ''}`}
                      title="Özel tarih seç"
                      data-testid="custom-date-toggle"
                    >
                      <Clock className="w-4 h-4" />
                      <span className="ml-1 text-xs">{getDateDisplayText()}</span>
                    </Button>
                  </div>
                  
                  {/* Butonlar - mobilde tam genişlik ve yan yana */}
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={() => handlePayment("in")} disabled={submitting} className="flex-1 sm:flex-none h-10 bg-red-600 hover:bg-red-700" data-testid="payment-in-btn">
                      Alınan
                    </Button>
                    <Button onClick={() => handlePayment("out")} disabled={submitting} className="flex-1 sm:flex-none h-10 bg-green-600 hover:bg-green-700" data-testid="payment-out-btn">
                      Verilen
                    </Button>
                  </div>
                </div>
                
                {useCustomDate && (
                  <div className="mt-2">
                    <Input
                      type="datetime-local"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="h-9 border-2 text-sm w-full sm:w-auto"
                      data-testid="custom-date-input"
                    />
                  </div>
                )}
              </div>
            )}

            {/* İşlem Geçmişi */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-2 border-b border-border bg-slate-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">İşlem Geçmişi ({totalCount})</span>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ara..."
                      className="h-7 pl-7 text-xs w-32 border"
                      data-testid="search-transactions"
                    />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={exportPDF} className="h-7 text-xs border" data-testid="export-pdf-btn">
                  <Download className="w-3 h-3 mr-1" />
                  PDF
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {filteredTransactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {searchQuery ? "Arama sonucu bulunamadı" : "İşlem bulunamadı"}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-semibold text-xs">Tarih</th>
                        <th className="text-left p-2 font-semibold text-xs">Açıklama</th>
                        <th className="text-right p-2 font-semibold text-xs">Tutar</th>
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-border hover:bg-slate-50">
                          <td className="p-2 text-xs font-mono whitespace-nowrap">{formatDate(tx.created_at)}</td>
                          <td className="p-2 text-xs">{tx.description}</td>
                          <td className={`p-2 text-xs font-mono text-right font-semibold ${tx.type === 'payment_out' ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.type === 'payment_in' ? '-' : ''}{formatMoney(tx.amount)}
                          </td>
                          <td className="p-1">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => openEditModal(tx)} className="h-6 w-6 p-0 hover:bg-blue-50 hover:text-blue-600" data-testid={`edit-tx-${tx.id}`}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setConfirmConfig({
                                  title: "İşlemi Sil",
                                  description: "Bu işlemi silmek istediğinize emin misiniz?",
                                  variant: "danger",
                                  onConfirm: () => handleDeleteTransaction(tx.id, true)
                                });
                                setConfirmOpen(true);
                              }} className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-600" data-testid={`delete-tx-${tx.id}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                
                {hasMore && (
                  <div className="p-3 text-center border-t border-slate-100">
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} className="h-8 text-xs" data-testid="load-more-btn">
                      {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalCount - filteredTransactions.length} kaldı)`}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Cari seçin</p>
          </div>
        )}
      </div>

      {/* Cari Ekle Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Yeni Cari</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddVendor} className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Cari Adı</Label>
              <Input 
                value={newVendor.name} 
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} 
                className="mt-1 h-11 border-2" 
                required 
                data-testid="new-vendor-name"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Telefon</Label>
              <Input 
                value={newVendor.phone} 
                onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })} 
                className="mt-1 h-11 border-2 font-mono" 
                data-testid="new-vendor-phone"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold">Adres</Label>
              <Input 
                value={newVendor.address} 
                onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })} 
                className="mt-1 h-11 border-2" 
                data-testid="new-vendor-address"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" data-testid="submit-new-vendor">Ekle</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* İşlem Düzenleme Modal */}
      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              İşlem Düzenle
            </DialogTitle>
          </DialogHeader>
          {editingTx && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded border">
                <p className="text-xs text-muted-foreground">Tarih</p>
                <p className="font-mono text-sm">{formatDate(editingTx.created_at)}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Tutar (TL)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  className="mt-1 h-11 border-2 font-mono"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Açıklama</Label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 h-11 border-2"
                />
              </div>
              <Button onClick={handleEditSubmit} className="w-full h-11 font-semibold" disabled={editLoading}>
                {editLoading ? "Güncelleniyor..." : "Kaydet"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={() => {
          confirmConfig.onConfirm();
          setConfirmOpen(false);
        }}
        variant={confirmConfig.variant}
      />
    </div>
  );
}
