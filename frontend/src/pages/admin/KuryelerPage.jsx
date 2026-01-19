import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, UserPlus, UserCheck, UserX } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

import { useKuryeler } from "@/hooks/useKuryeler";
import { CourierTable } from "@/components/kuryeler/CourierTable";
import { CourierCards } from "@/components/kuryeler/CourierCards";
import { CourierEditModal } from "@/components/kuryeler/CourierEditModal";
import { CourierAddModal } from "@/components/kuryeler/CourierAddModal";
import { CourierDetailModal } from "@/components/kuryeler/CourierDetailModal";

export default function KuryelerPage({ companyId }) {
  const {
    activeCouriers,
    inactiveCouriers,
    loading,
    companyName,
    searchCourier,
    addCourier,
    updateCourier,
    removeCourier,
    startTermination,
    cancelTermination,
    deactivateCourier,
    activateCourier
  } = useKuryeler(companyId);

  const [activeTab, setActiveTab] = useState("active");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const couriers = activeTab === "active" ? activeCouriers : inactiveCouriers;
  
  const filteredCouriers = couriers.filter(c => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const plate = (c.plate || '').toLowerCase();
    return name.includes(query) || plate.includes(query);
  });

  const handleRemove = async (courierId) => {
    if (!window.confirm("Bu kuryeyi şirketten çıkarmak istediğinize emin misiniz?")) return;
    try {
      await removeCourier(courierId);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleStartTermination = async (courierId) => {
    if (!window.confirm("Bu kurye için 15 günlük fesih sürecini başlatmak istediğinize emin misiniz?")) return;
    try {
      await startTermination(courierId);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleCancelTermination = async (courierId) => {
    if (!window.confirm("Fesih sürecini iptal etmek istediğinize emin misiniz?")) return;
    try {
      await cancelTermination(courierId);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleDeactivate = async (courierId) => {
    if (!window.confirm("Bu kuryeyi pasife almak istediğinize emin misiniz?")) return;
    try {
      await deactivateCourier(courierId);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleActivate = async (courierId) => {
    try {
      await activateCourier(courierId);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  const handleEdit = async (courierId, data) => {
    try {
      await updateCourier(courierId, data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Güncelleme başarısız");
      throw err;
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div data-testid="admin-kuryeler-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Kuryeler</h2>
        <div className="flex gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="İsim veya plaka ara..." 
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-10 h-10 border-2"
              data-testid="filter-couriers-input"
            />
          </div>
          <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-courier-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            Kurye Ekle
          </Button>
        </div>
      </div>

      {/* Active/Inactive Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "active" 
              ? "bg-primary text-white" 
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          Aktif ({activeCouriers.length})
        </button>
        <button
          onClick={() => setActiveTab("inactive")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
            activeTab === "inactive" 
              ? "bg-slate-700 text-white" 
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <UserX className="w-4 h-4" />
          Pasif ({inactiveCouriers.length})
        </button>
      </div>

      {/* Desktop Table */}
      <CourierTable
        couriers={filteredCouriers}
        activeTab={activeTab}
        filterQuery={filterQuery}
        onDetail={(c) => { setSelectedCourier(c); setShowDetailModal(true); }}
        onEdit={(c) => { setSelectedCourier(c); setShowEditModal(true); }}
        onRemove={handleRemove}
        onStartTermination={handleStartTermination}
        onCancelTermination={handleCancelTermination}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
      />

      {/* Mobile Cards */}
      <CourierCards
        couriers={filteredCouriers}
        activeTab={activeTab}
        filterQuery={filterQuery}
        onDetail={(c) => { setSelectedCourier(c); setShowDetailModal(true); }}
        onEdit={(c) => { setSelectedCourier(c); setShowEditModal(true); }}
        onRemove={handleRemove}
        onStartTermination={handleStartTermination}
        onCancelTermination={handleCancelTermination}
        onDeactivate={handleDeactivate}
        onActivate={handleActivate}
      />

      {/* Modals */}
      <CourierAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSearch={searchCourier}
        onAdd={addCourier}
      />

      <CourierEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        courier={selectedCourier}
        onSave={handleEdit}
      />

      <CourierDetailModal
        open={showDetailModal}
        onOpenChange={setShowDetailModal}
        courier={selectedCourier}
        companyName={companyName}
      />
    </div>
  );
}
