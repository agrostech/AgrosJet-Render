import { useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Switch } from "@/components/ui/switch";
import { Search, UserPlus, UserCheck, UserX, Wallet, CreditCard, Banknote, Globe } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

import { useKuryeler } from "@/hooks/useKuryeler";
import { CourierTable } from "@/components/kuryeler/CourierTable";
import { CourierCards } from "@/components/kuryeler/CourierCards";
import { CourierEditModal } from "@/components/kuryeler/CourierEditModal";
import { CourierAddModal } from "@/components/kuryeler/CourierAddModal";
import { CourierDetailModal } from "@/components/kuryeler/CourierDetailModal";
import { CourierMergeModal } from "@/components/kuryeler/CourierMergeModal";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Varsayılan KM aralıkları
const DEFAULT_KM_RANGES = [
  { min_km: 0, max_km: 1, price: 0 },
  { min_km: 1, max_km: 2, price: 0 },
  { min_km: 2, max_km: 3, price: 0 },
  { min_km: 3, max_km: 4, price: 0 },
  { min_km: 4, max_km: 5, price: 0 },
  { min_km: 5, max_km: 6, price: 0 },
  { min_km: 6, max_km: 7, price: 0 },
  { min_km: 7, max_km: 8, price: 0 },
  { min_km: 8, max_km: 9, price: 0 },
  { min_km: 9, max_km: 10, price: 0 },
  { min_km: 10, max_km: null, price: 0 }  // 10+ km
];

export default function KuryelerPage({ companyId }) {
  const {
    activeCouriers,
    inactiveCouriers,
    loading,
    companyName,
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
  } = useKuryeler(companyId);

  const [activeTab, setActiveTab] = useState("active");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  
  // Pricing Modal State
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingType, setPricingType] = useState("per_package");
  const [perPackagePrice, setPerPackagePrice] = useState("");
  const [kmRanges, setKmRanges] = useState(DEFAULT_KM_RANGES);
  
  // Payment Methods Modal State
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState(["cash", "card", "online"]);
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });

  const couriers = activeTab === "active" ? activeCouriers : inactiveCouriers;
  
  const filteredCouriers = couriers.filter(c => {
    if (!filterQuery.trim()) return true;
    const query = filterQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const plate = (c.plate || '').toLowerCase();
    return name.includes(query) || plate.includes(query);
  });

  const openFinanceModal = (courier) => {
    // TODO: Yeni finans sistemi eklenecek
    setSelectedCourier(courier);
  };

  const handleRemove = async (courierId) => {
    setConfirmConfig({
      title: "Kurye Çıkarma",
      description: "Bu kuryeyi şirketten çıkarmak istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await removeCourier(courierId);
        } catch (err) {
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "İşlem başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleStartTermination = async (courierId) => {
    setConfirmConfig({
      title: "Fesih Süreci Başlatma",
      description: "Bu kurye için 15 günlük fesih sürecini başlatmak istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await startTermination(courierId);
        } catch (err) {
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "İşlem başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleCancelTermination = async (courierId) => {
    setConfirmConfig({
      title: "Fesih İptali",
      description: "Fesih sürecini iptal etmek istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await cancelTermination(courierId);
        } catch (err) {
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "İşlem başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleDeactivate = async (courierId) => {
    setConfirmConfig({
      title: "Kuryeyi Pasife Alma",
      description: "Bu kuryeyi pasife almak istediğinize emin misiniz?",
      onConfirm: async () => {
        try {
          await deactivateCourier(courierId);
        } catch (err) {
          if (!err.handled) {
            toast.error(err.response?.data?.detail || "İşlem başarısız");
          }
        }
        setConfirmOpen(false);
      }
    });
    setConfirmOpen(true);
  };

  const handleActivate = async (courierId) => {
    try {
      await activateCourier(courierId);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "İşlem başarısız");
      }
    }
  };

  // Ücretlendirme modalını aç
  const openPricingModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/pricing`);
      setPricingType(res.data.pricing_type || "per_package");
      setPerPackagePrice(res.data.per_package_price?.toString() || "");
      setKmRanges(res.data.km_ranges || DEFAULT_KM_RANGES);
    } catch (err) {
      setPricingType("per_package");
      setPerPackagePrice("");
      setKmRanges(DEFAULT_KM_RANGES);
    }
    setShowPricingModal(true);
  };

  // Ücretlendirme kaydet
  const handleSavePricing = async () => {
    try {
      const payload = {
        pricing_type: pricingType,
        per_package_price: pricingType === "per_package" ? parseFloat(perPackagePrice) || 0 : null,
        km_ranges: pricingType === "per_km" ? kmRanges : null
      };
      await axios.put(`${API}/couriers/${selectedCourier.id}/pricing`, payload);
      toast.success("Ücretlendirme kaydedildi");
      setShowPricingModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ücretlendirme kaydedilemedi");
    }
  };

  // KM aralığı fiyat güncelle
  const updateKmRangePrice = (index, price) => {
    const newRanges = [...kmRanges];
    newRanges[index].price = parseFloat(price) || 0;
    setKmRanges(newRanges);
  };

  // Ödeme yöntemleri modalını aç
  const openPaymentMethodsModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/payment-methods`);
      setAllowedPaymentMethods(res.data.allowed_payment_methods || ["cash", "card", "online"]);
    } catch (err) {
      setAllowedPaymentMethods(["cash", "card", "online"]);
    }
    setShowPaymentMethodsModal(true);
  };

  // Ödeme yöntemleri kaydet
  const handleSavePaymentMethods = async () => {
    try {
      await axios.put(`${API}/couriers/${selectedCourier.id}/payment-methods`, {
        allowed_payment_methods: allowedPaymentMethods
      });
      toast.success("Ödeme yöntemleri kaydedildi");
      setShowPaymentMethodsModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ödeme yöntemleri kaydedilemedi");
    }
  };

  // Ödeme yöntemi toggle
  const togglePaymentMethod = (method) => {
    if (allowedPaymentMethods.includes(method)) {
      // En az 1 yöntem açık kalmalı
      if (allowedPaymentMethods.length > 1) {
        setAllowedPaymentMethods(allowedPaymentMethods.filter(m => m !== method));
      } else {
        toast.error("En az bir ödeme yöntemi açık olmalı");
      }
    } else {
      setAllowedPaymentMethods([...allowedPaymentMethods, method]);
    }
  };

  const handleEdit = async (courierId, data) => {
    try {
      await updateCourier(courierId, data);
    } catch (err) {
      if (!err.handled) {
        toast.error(err.response?.data?.detail || "Güncelleme başarısız");
      }
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
        onMerge={(c) => { setSelectedCourier(c); setShowMergeModal(true); }}
        onPricing={openPricingModal}
        onPaymentMethods={openPaymentMethodsModal}
        onFinance={openFinanceModal}
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
        onMerge={(c) => { setSelectedCourier(c); setShowMergeModal(true); }}
        onPricing={openPricingModal}
        onPaymentMethods={openPaymentMethodsModal}
        onFinance={openFinanceModal}
      />

      {/* Modals */}
      <CourierAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSearch={searchCourier}
        onAdd={addCourier}
        onAddGhost={addGhostCourier}
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
        companyId={companyId}
        companyName={companyName}
      />

      <CourierMergeModal
        open={showMergeModal}
        onOpenChange={setShowMergeModal}
        ghostCourier={selectedCourier}
        onSearch={searchCourier}
        onMerge={mergeCouriers}
      />

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        onConfirm={confirmConfig.onConfirm}
        variant="warning"
      />

      {/* Pricing Modal */}
      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-xl">₺</span>
              Ücretlendirme - {selectedCourier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup value={pricingType} onValueChange={setPricingType}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="per_package" id="courier_per_package" />
                <Label htmlFor="courier_per_package" className="cursor-pointer flex-1">
                  Paket Başı
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="per_km" id="courier_per_km" />
                <Label htmlFor="courier_per_km" className="cursor-pointer flex-1">
                  KM Aralığı
                </Label>
              </div>
            </RadioGroup>

            {pricingType === "per_package" && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg">
                <Label>Paket Başı Fiyat (₺)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={perPackagePrice}
                  onChange={(e) => setPerPackagePrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white"
                />
              </div>
            )}

            {pricingType === "per_km" && (
              <div className="space-y-2 p-4 bg-purple-50 rounded-lg">
                <Label className="mb-3 block">KM Aralıkları (₺)</Label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {kmRanges.map((range, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-16">
                        {range.max_km === null ? `${range.min_km}+ km` : `${range.min_km}-${range.max_km} km`}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={range.price || ""}
                        onChange={(e) => updateKmRangePrice(idx, e.target.value)}
                        placeholder="0.00"
                        className="bg-white h-8 text-sm"
                      />
                      <span className="text-xs text-slate-500">₺</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPricingModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSavePricing}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
