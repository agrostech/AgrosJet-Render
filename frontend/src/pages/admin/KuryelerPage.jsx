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
import { Search, UserPlus, UserCheck, UserX, Wallet, CreditCard, Banknote, Globe, UtensilsCrossed, Clock, Package, Coffee, LayoutGrid, List, Shield } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

import { useKuryeler } from "@/hooks/useKuryeler";
import { CourierTable } from "@/components/kuryeler/CourierTable";
import { CourierCards } from "@/components/kuryeler/CourierCards";
import { CourierEditModal } from "@/components/kuryeler/CourierEditModal";
import { CourierAddModal } from "@/components/kuryeler/CourierAddModal";
import { CourierDetailModal } from "@/components/kuryeler/CourierDetailModal";
import { CourierMergeModal } from "@/components/kuryeler/CourierMergeModal";
import CourierMatrixView from "@/components/admin/CourierMatrixView";

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
  const [viewMode, setViewMode] = useState("list"); // list, matrix
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
  const [hourlyRate, setHourlyRate] = useState("");
  const [tierPrices, setTierPrices] = useState(["", "", "", "", ""]);
  
  // Payment Methods Modal State
  const [showPaymentMethodsModal, setShowPaymentMethodsModal] = useState(false);
  const [allowedPaymentMethods, setAllowedPaymentMethods] = useState(["cash", "card", "online", "meal_card", "online_meal_card"]);
  
  // Max Packages Modal State
  const [showMaxPackagesModal, setShowMaxPackagesModal] = useState(false);
  const [maxPackages, setMaxPackages] = useState("5");
  
  // Break Limit Modal State
  const [showBreakLimitModal, setShowBreakLimitModal] = useState(false);
  const [breakLimit, setBreakLimit] = useState("30");
  
  // Permissions Modal State
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [courierPermissions, setCourierPermissions] = useState({ can_mark_not_ready: true });
  
  // Confirm Modal State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", description: "", onConfirm: () => {} });
  
  // Matrix refresh trigger - kurye eklenince/silinince matrix'i de yeniler
  const [matrixRefreshTrigger, setMatrixRefreshTrigger] = useState(0);

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
          setMatrixRefreshTrigger(prev => prev + 1);
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
          setMatrixRefreshTrigger(prev => prev + 1);
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
      setMatrixRefreshTrigger(prev => prev + 1);
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
      setHourlyRate(res.data.hourly_rate?.toString() || "");
      setTierPrices(res.data.tier_prices?.map(p => p?.toString() || "") || ["", "", "", "", ""]);
    } catch (err) {
      setPricingType("per_package");
      setPerPackagePrice("");
      setKmRanges(DEFAULT_KM_RANGES);
      setHourlyRate("");
      setTierPrices(["", "", "", "", ""]);
    }
    setShowPricingModal(true);
  };

  // Ücretlendirme kaydet
  const handleSavePricing = async () => {
    try {
      const payload = {
        pricing_type: pricingType,
        per_package_price: pricingType === "per_package" ? parseFloat(perPackagePrice) || 0 : null,
        km_ranges: pricingType === "per_km" ? kmRanges : null,
        tier_prices: pricingType === "tiered" ? tierPrices.map(p => parseFloat(p) || 0) : null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null
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

  // Kademe fiyatı güncelle
  const updateTierPrice = (index, value) => {
    const newPrices = [...tierPrices];
    newPrices[index] = value;
    setTierPrices(newPrices);
  };

  // Ödeme yöntemleri modalını aç
  const openPaymentMethodsModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/payment-methods`);
      setAllowedPaymentMethods(res.data.allowed_payment_methods || ["cash", "card", "online", "meal_card", "online_meal_card"]);
    } catch (err) {
      setAllowedPaymentMethods(["cash", "card", "online", "meal_card", "online_meal_card"]);
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
    // Yemek kartı için hem meal_card hem online_meal_card'ı birlikte toggle et
    if (method === "meal_card") {
      const hasMealCard = allowedPaymentMethods.includes("meal_card") || allowedPaymentMethods.includes("online_meal_card");
      if (hasMealCard) {
        // Kapat - her iki türü de kaldır
        const remaining = allowedPaymentMethods.filter(m => m !== "meal_card" && m !== "online_meal_card");
        if (remaining.length > 0) {
          setAllowedPaymentMethods(remaining);
        } else {
          toast.error("En az bir ödeme yöntemi açık olmalı");
        }
      } else {
        // Aç - her iki türü de ekle
        setAllowedPaymentMethods([...allowedPaymentMethods, "meal_card", "online_meal_card"]);
      }
      return;
    }

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

  // Maksimum paket modalını aç
  const openMaxPackagesModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/max-packages`);
      setMaxPackages(res.data.max_packages?.toString() || "5");
    } catch (err) {
      setMaxPackages("5");
    }
    setShowMaxPackagesModal(true);
  };

  // Maksimum paket kaydet
  const handleSaveMaxPackages = async () => {
    try {
      const value = parseInt(maxPackages) || 5;
      if (value < 1 || value > 20) {
        toast.error("Maksimum paket 1-20 arasında olmalı");
        return;
      }
      await axios.put(`${API}/couriers/${selectedCourier.id}/max-packages`, {
        max_packages: value
      });
      toast.success("Maksimum paket kapasitesi kaydedildi");
      setShowMaxPackagesModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    }
  };

  // Mola limiti modalını aç
  const openBreakLimitModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}`);
      setBreakLimit(res.data.daily_break_limit?.toString() || "30");
    } catch (err) {
      setBreakLimit("30");
    }
    setShowBreakLimitModal(true);
  };

  // Mola limiti kaydet
  const handleSaveBreakLimit = async () => {
    try {
      const value = parseInt(breakLimit) || 30;
      await axios.put(`${API}/couriers/${selectedCourier.id}/break-limit`, {
        daily_break_limit: value
      });
      toast.success(`Mola limiti güncellendi: ${value} dakika`);
      setShowBreakLimitModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    }
  };

  // Yetkiler modalını aç
  const openPermissionsModal = async (courier) => {
    setSelectedCourier(courier);
    try {
      const res = await axios.get(`${API}/couriers/${courier.id}/permissions`);
      setCourierPermissions(res.data.permissions || { can_mark_not_ready: true });
    } catch (err) {
      setCourierPermissions({ can_mark_not_ready: true });
    }
    setShowPermissionsModal(true);
  };

  // Yetkiler kaydet
  const handleSavePermissions = async () => {
    try {
      await axios.put(`${API}/couriers/${selectedCourier.id}/permissions`, {
        permissions: courierPermissions
      });
      toast.success("Yetkiler kaydedildi");
      setShowPermissionsModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Yetkiler kaydedilemedi");
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div data-testid="admin-kuryeler-page">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">Kuryeler</h2>
          <Button onClick={() => setShowAddModal(true)} className="hidden sm:flex font-semibold" data-testid="add-courier-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            Kurye Ekle
          </Button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="İsim veya plaka ara..." 
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-10 h-9 sm:h-10 border-2"
              data-testid="filter-couriers-input"
            />
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)} className="sm:hidden h-9 px-2.5" data-testid="add-courier-btn-mobile">
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Active/Inactive Tabs + View Mode Toggle */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors ${
              activeTab === "active" 
                ? "bg-primary text-white" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-secondary dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Aktif ({activeCouriers.length})
          </button>
          <button
            onClick={() => setActiveTab("inactive")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-colors ${
              activeTab === "inactive" 
                ? "bg-slate-700 text-white" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-secondary dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <UserX className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Pasif ({inactiveCouriers.length})
          </button>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex gap-0.5 sm:gap-1 bg-slate-100 dark:bg-secondary p-0.5 sm:p-1 rounded-lg">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
              viewMode === "list" 
                ? "bg-white dark:bg-slate-700 shadow text-primary dark:text-white" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Liste</span>
          </button>
          <button
            onClick={() => setViewMode("matrix")}
            className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
              viewMode === "matrix" 
                ? "bg-white dark:bg-slate-700 shadow text-primary dark:text-white" 
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Matris</span>
          </button>
        </div>
      </div>

      {/* Matrix View */}
      {viewMode === "matrix" ? (
        <CourierMatrixView 
          companyId={companyId} 
          refreshTrigger={matrixRefreshTrigger}
          onCourierClick={(courier) => { setSelectedCourier(courier); setShowDetailModal(true); }}
        />
      ) : (
        <>
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
            onMaxPackages={openMaxPackagesModal}
            onBreakLimit={openBreakLimitModal}
            onPermissions={openPermissionsModal}
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
        onMaxPackages={openMaxPackagesModal}
        onBreakLimit={openBreakLimitModal}
        onPermissions={openPermissionsModal}
      />
        </>
      )}

      {/* Modals */}
      <CourierAddModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSearch={searchCourier}
        onAdd={async (phone) => {
          await addCourier(phone);
          setMatrixRefreshTrigger(prev => prev + 1);
        }}
        onAddGhost={async (name) => {
          await addGhostCourier(name);
          setMatrixRefreshTrigger(prev => prev + 1);
        }}
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
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-orange-50 cursor-pointer border-orange-200">
                <RadioGroupItem value="tiered" id="courier_tiered" />
                <Label htmlFor="courier_tiered" className="cursor-pointer flex-1">
                  Kademeli Paket Başı
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

            {pricingType === "tiered" && (
              <div className="space-y-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <Label className="font-semibold">Kademe Fiyatları (₺)</Label>
                <p className="text-xs text-muted-foreground">
                  Kuryenin aktif paket sayısına göre yeni paket ücreti belirlenir.
                </p>
                {[1, 2, 3, 4, 5].map((tier, index) => (
                  <div key={tier} className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-green-100 text-green-700' :
                      index === 1 ? 'bg-blue-100 text-blue-700' :
                      index === 2 ? 'bg-yellow-100 text-yellow-700' :
                      index === 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {tier}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tierPrices[index]}
                      onChange={(e) => updateTierPrice(index, e.target.value)}
                      placeholder="0.00"
                      className="bg-white flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-14">
                      {tier}. paket
                    </span>
                  </div>
                ))}
                <p className="text-xs text-orange-600 mt-2">
                  5+ paket durumunda 5. kademe fiyatı uygulanır.
                </p>
              </div>
            )}

            {/* Saatlik Ücret - Her zaman görünür */}
            <div className="border-t pt-4 mt-4">
              <div className="space-y-2 p-4 bg-amber-50 rounded-lg">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Saatlik Ücret (₺)
                  <span className="text-xs text-muted-foreground font-normal">(Opsiyonel)</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="Tanımlı değil"
                  className="bg-white"
                />
                <p className="text-xs text-muted-foreground">
                  Tanımlıysa, paket kazancına ek olarak aktif çalışma saati × bu ücret hesaplanır.
                </p>
              </div>
            </div>
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

      {/* Payment Methods Modal */}
      <Dialog open={showPaymentMethodsModal} onOpenChange={setShowPaymentMethodsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Ödeme Yöntemleri - {selectedCourier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Bu kuryenin taşıyabileceği ödeme yöntemlerini seçin. Kapalı olan yöntemlerdeki siparişler bu kuryeye atanamaz.
            </p>
            
            {/* Nakit */}
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Nakit</p>
                  <p className="text-xs text-muted-foreground">Kapıda nakit ödeme</p>
                </div>
              </div>
              <Switch
                checked={allowedPaymentMethods.includes("cash")}
                onCheckedChange={() => togglePaymentMethod("cash")}
              />
            </div>

            {/* Kredi Kartı */}
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Kredi Kartı</p>
                  <p className="text-xs text-muted-foreground">Kapıda kart ile ödeme</p>
                </div>
              </div>
              <Switch
                checked={allowedPaymentMethods.includes("card")}
                onCheckedChange={() => togglePaymentMethod("card")}
              />
            </div>

            {/* Online */}
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">Online</p>
                  <p className="text-xs text-muted-foreground">Online ödeme yapılmış</p>
                </div>
              </div>
              <Switch
                checked={allowedPaymentMethods.includes("online")}
                onCheckedChange={() => togglePaymentMethod("online")}
              />
            </div>

            {/* Yemek Kartı */}
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">Yemek Kartı</p>
                  <p className="text-xs text-muted-foreground">Sodexo, Multinet, Ticket vb. (kapıda & online)</p>
                </div>
              </div>
              <Switch
                checked={allowedPaymentMethods.includes("meal_card") || allowedPaymentMethods.includes("online_meal_card")}
                onCheckedChange={() => togglePaymentMethod("meal_card")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentMethodsModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSavePaymentMethods}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Max Packages Modal */}
      <Dialog open={showMaxPackagesModal} onOpenChange={setShowMaxPackagesModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Maksimum Paket - {selectedCourier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Bu kuryenin aynı anda taşıyabileceği maksimum paket sayısını belirleyin.
              Otomatik atama sistemi bu değeri kullanır.
            </p>
            <div className="space-y-2">
              <Label>Maksimum Paket Sayısı</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={maxPackages}
                onChange={(e) => setMaxPackages(e.target.value)}
                placeholder="5"
              />
              <p className="text-xs text-muted-foreground">1-20 arası bir değer girin</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMaxPackagesModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveMaxPackages}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Break Limit Modal */}
      <Dialog open={showBreakLimitModal} onOpenChange={setShowBreakLimitModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-600" />
              Mola Ayarları - {selectedCourier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Bu kuryenin günlük mola kullanım limitini belirleyin.
            </p>
            <div className="space-y-2">
              <Label>Günlük Mola Limiti (dakika)</Label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 45, 60, 90, 120].map(val => (
                  <Button
                    key={val}
                    type="button"
                    variant={parseInt(breakLimit) === val ? "default" : "outline"}
                    className="h-10"
                    onClick={() => setBreakLimit(val.toString())}
                  >
                    {val >= 60 ? `${val/60} saat` : `${val} dk`}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBreakLimitModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveBreakLimit}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Yetkiler - {selectedCourier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Bu kuryenin kullanabileceği özellikleri yönetin.
            </p>
            
            <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Paket Hazır Değil</p>
                  <p className="text-xs text-muted-foreground">Kurye siparişi "hazır değil" olarak işaretleyebilir</p>
                </div>
              </div>
              <Switch
                checked={courierPermissions.can_mark_not_ready}
                onCheckedChange={(checked) => setCourierPermissions(prev => ({ ...prev, can_mark_not_ready: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSavePermissions}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
