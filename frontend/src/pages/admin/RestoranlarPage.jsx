import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, Search, Edit2, Trash2, Archive, ArchiveRestore, 
  MapPin, Eye, EyeOff, Store, RefreshCw, Navigation, CheckCircle2, XCircle, Wallet, UserX, UserPlus, Users, Clock, Shield, Banknote, Receipt, FileText,
  LayoutGrid, List
} from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";
import RestaurantPermissionsModal from "@/components/admin/RestaurantPermissionsModal";
import IntegrationLogsModal from "@/components/admin/IntegrationLogsModal";
import CollectionSettingsModal from "@/components/admin/CollectionSettingsModal";
import RestaurantGroupsModal from "@/components/admin/RestaurantGroupsModal";
import RestaurantMatrixView from "@/components/admin/RestaurantMatrixView";

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

export default function RestoranlarPage({ companyId }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active"); // active, archived
  const [viewMode, setViewMode] = useState("list"); // list, matrix
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showPreparationModal, setShowPreparationModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showInvoiceSettingsModal, setShowInvoiceSettingsModal] = useState(false);
  const [showIntegrationLogs, setShowIntegrationLogs] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  
  // Invoice settings state
  const [invoiceSettings, setInvoiceSettings] = useState({
    cash: false,
    credit_card: false,
    online: false,
    meal_card: false,
    online_meal_card: false,
    percentage: 10,        // Yüzdelik dilim: 1, 10, 20
    percentage_name: "Yeme-İçme"  // Yüzdelik isim
  });
  const [loadingInvoiceSettings, setLoadingInvoiceSettings] = useState(false);
  
  // Blocked couriers state
  const [blockedCouriers, setBlockedCouriers] = useState([]);
  const [allCouriers, setAllCouriers] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [selectedCourierToBlock, setSelectedCourierToBlock] = useState("");
  
  // Restaurant users state
  const [restaurantUsers, setRestaurantUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: "", password: "", name: "", phone: "" });
  
  // Preparation time state
  const [preparationData, setPreparationData] = useState({
    standard_time: 15,
    product_times: {}
  });
  const [restaurantProducts, setRestaurantProducts] = useState([]);
  const [loadingPreparation, setLoadingPreparation] = useState(false);
  
  // Pricing state
  const [pricingType, setPricingType] = useState("per_package");
  const [perPackagePrice, setPerPackagePrice] = useState("");
  const [kmRanges, setKmRanges] = useState(DEFAULT_KM_RANGES);
  const [kdvRate, setKdvRate] = useState("");
  const [posCommissionRate, setPosCommissionRate] = useState("");
  
  // Map refs for location picker
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    latitude: "",
    longitude: "",
    preparation_time: 15,
    adisyo_api_key: "",
    adisyo_api_secret: "",
    adisyo_branch_id: ""
  });
  const [showApiKeys, setShowApiKeys] = useState(false);

  const fetchRestaurants = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurants/${companyId}?include_archived=true`);
      setRestaurants(res.data);
    } catch (err) {
      toast.error("Restoranlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Fetch all couriers for blocking
  const fetchAllCouriers = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await axios.get(`${API}/companies/${companyId}/couriers`);
      setAllCouriers(res.data);
    } catch (err) {
      console.error("Kuryeler yüklenemedi:", err);
      toast.error("Kuryeler yüklenemedi");
    }
  }, [companyId]);

  useEffect(() => {
    fetchRestaurants();
    fetchAllCouriers();
  }, [fetchRestaurants, fetchAllCouriers]);

  // Open blocked couriers modal
  const openBlockedModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowBlockedModal(true);
    setLoadingBlocked(true);
    try {
      const res = await axios.get(`${API}/restaurants/blocked/${restaurant.id}`);
      setBlockedCouriers(res.data);
    } catch (err) {
      // Restoran bulunamadı demek DB'de sorun var, ama modal açılsın
      console.error("Engellenen kuryeler yüklenemedi:", err);
      setBlockedCouriers([]);
    } finally {
      setLoadingBlocked(false);
    }
  };

  // Block courier
  const handleBlockCourier = async () => {
    if (!selectedCourierToBlock || !selectedRestaurant) return;
    try {
      await axios.post(`${API}/restaurants/block/${selectedRestaurant.id}`, {
        courier_id: selectedCourierToBlock
      });
      toast.success("Kurye engellendi");
      // Refresh blocked list
      const res = await axios.get(`${API}/restaurants/blocked/${selectedRestaurant.id}`);
      setBlockedCouriers(res.data);
      setSelectedCourierToBlock("");
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Unblock courier
  const handleUnblockCourier = async (courierId) => {
    if (!selectedRestaurant) return;
    try {
      await axios.post(`${API}/restaurants/unblock/${selectedRestaurant.id}`, {
        courier_id: courierId
      });
      toast.success("Engel kaldırıldı");
      // Refresh blocked list
      const res = await axios.get(`${API}/restaurants/blocked/${selectedRestaurant.id}`);
      setBlockedCouriers(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "İşlem başarısız");
    }
  };

  // Invoice Settings Management
  const openInvoiceSettingsModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowInvoiceSettingsModal(true);
    setLoadingInvoiceSettings(true);
    try {
      const res = await axios.get(`${API}/restaurant-invoice-settings/${restaurant.id}`);
      setInvoiceSettings(res.data.settings);
    } catch (err) {
      console.error("Fatura ayarları yüklenemedi:", err);
      setInvoiceSettings({
        cash: false,
        credit_card: false,
        online: false,
        meal_card: false,
        online_meal_card: false,
        percentage: 10,
        percentage_name: "Yeme-İçme"
      });
    } finally {
      setLoadingInvoiceSettings(false);
    }
  };

  const handleSaveInvoiceSettings = async () => {
    if (!selectedRestaurant) return;
    try {
      await axios.put(`${API}/restaurant-invoice-settings/${selectedRestaurant.id}`, invoiceSettings);
      toast.success("Fatura ayarları kaydedildi");
      setShowInvoiceSettingsModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    }
  };

  // Restaurant Users Management
  const openUsersModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowUsersModal(true);
    setLoadingUsers(true);
    setNewUserData({ username: "", password: "", name: "" });
    try {
      const res = await axios.get(`${API}/restaurant-users/restaurant/${restaurant.id}`);
      setRestaurantUsers(res.data);
    } catch (err) {
      console.error("Kullanıcılar yüklenemedi:", err);
      setRestaurantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserData.username || !newUserData.password || !newUserData.name) {
      toast.error("Tüm alanları doldurun");
      return;
    }
    try {
      await axios.post(`${API}/restaurant-users`, {
        ...newUserData,
        restaurant_id: selectedRestaurant.id
      });
      toast.success("Kullanıcı oluşturuldu");
      // Refresh list
      const res = await axios.get(`${API}/restaurant-users/restaurant/${selectedRestaurant.id}`);
      setRestaurantUsers(res.data);
      setNewUserData({ username: "", password: "", name: "", phone: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kullanıcı oluşturulamadı");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) return;
    try {
      await axios.delete(`${API}/restaurant-users/${userId}`);
      toast.success("Kullanıcı silindi");
      // Refresh list
      const res = await axios.get(`${API}/restaurant-users/restaurant/${selectedRestaurant.id}`);
      setRestaurantUsers(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kullanıcı silinemedi");
    }
  };

  // Preparation Time Management
  const openPreparationModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowPreparationModal(true);
    setLoadingPreparation(true);
    
    try {
      // Restoran ürünlerini çek
      const productsRes = await axios.get(`${API}/products/restaurant/${restaurant.id}`);
      const products = productsRes.data?.products || [];
      setRestaurantProducts(products);
      
      // Mevcut hazırlık sürelerini yükle
      setPreparationData({
        standard_time: restaurant.preparation_time || 15,
        product_times: restaurant.product_preparation_times || {}
      });
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
      setRestaurantProducts([]);
      setPreparationData({
        standard_time: restaurant.preparation_time || 15,
        product_times: {}
      });
    } finally {
      setLoadingPreparation(false);
    }
  };

  const handleSavePreparation = async () => {
    try {
      await axios.put(`${API}/restaurants/${selectedRestaurant.id}/preparation-times`, {
        preparation_time: parseInt(preparationData.standard_time) || 15,
        product_preparation_times: preparationData.product_times
      });
      toast.success("Hazırlık süreleri kaydedildi");
      setShowPreparationModal(false);
      fetchRestaurants();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Kaydetme başarısız");
    }
  };

  const updateProductTime = (productId, time) => {
    setPreparationData(prev => ({
      ...prev,
      product_times: {
        ...prev.product_times,
        [productId]: time === "" ? null : parseInt(time) || 0
      }
    }));
  };

  // Filtered restaurants by tab
  const activeRestaurants = restaurants.filter(r => !r.is_archived);
  const archivedRestaurants = restaurants.filter(r => r.is_archived);
  const displayedRestaurants = activeTab === "active" ? activeRestaurants : archivedRestaurants;
  
  const filteredRestaurants = displayedRestaurants.filter(r => 
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Initialize location picker map
  const initLocationPicker = useCallback((initialLat = null, initialLng = null) => {
    setTimeout(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      
      if (!window.L) {
        if (!document.querySelector('link[href*="leaflet"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => createMap(initialLat, initialLng);
        document.body.appendChild(script);
      } else {
        createMap(initialLat, initialLng);
      }
    }, 100);
  }, []);

  const createMap = (initialLat, initialLng) => {
    if (!mapContainerRef.current || !window.L || mapInstanceRef.current) return;
    
    const L = window.L;
    const defaultLat = initialLat || 41.0082;
    const defaultLng = initialLng || 28.9784;
    
    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: false
    }).setView([defaultLat, defaultLng], initialLat ? 15 : 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    if (initialLat && initialLng) {
      markerRef.current = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
      });
    }
    
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', (ev) => {
          const pos = ev.target.getLatLng();
          setFormData(prev => ({ ...prev, latitude: pos.lat.toFixed(6), longitude: pos.lng.toFixed(6) }));
        });
      }
      setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    });
    
    mapInstanceRef.current = map;
  };

  const cleanupMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    if (markerRef.current) {
      markerRef.current = null;
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      address: "",
      latitude: "",
      longitude: "",
      preparation_time: 15,
      adisyo_api_key: "",
      adisyo_api_secret: "",
      adisyo_branch_id: ""
    });
    setShowApiKeys(false);
    cleanupMap();
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      toast.error("Restoran adı gerekli");
      return;
    }

    try {
      await axios.post(`${API}/restaurants`, {
        ...formData,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        preparation_time: parseInt(formData.preparation_time) || 15,
        company_id: companyId
      });
      toast.success("Restoran eklendi");
      setShowAddModal(false);
      resetForm();
      fetchRestaurants();
    } catch (err) {
      toast.error("Restoran eklenemedi");
    }
  };

  const handleEdit = async () => {
    if (!formData.name.trim()) {
      toast.error("Restoran adı gerekli");
      return;
    }

    try {
      await axios.put(`${API}/restaurants/${selectedRestaurant.id}`, {
        ...formData,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        preparation_time: parseInt(formData.preparation_time) || 15
      });
      toast.success("Restoran güncellendi");
      setShowEditModal(false);
      resetForm();
      fetchRestaurants();
    } catch (err) {
      toast.error("Restoran güncellenemedi");
    }
  };

  const handleArchive = async (restaurant) => {
    try {
      if (restaurant.is_archived) {
        await axios.put(`${API}/restaurants/${restaurant.id}/unarchive`);
        toast.success("Restoran arşivden çıkarıldı");
      } else {
        await axios.put(`${API}/restaurants/${restaurant.id}/archive`);
        toast.success("Restoran arşivlendi");
      }
      fetchRestaurants();
    } catch (err) {
      toast.error("İşlem başarısız");
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/restaurants/${selectedRestaurant.id}`);
      toast.success("Restoran silindi");
      setShowDeleteModal(false);
      setSelectedRestaurant(null);
      fetchRestaurants();
    } catch (err) {
      toast.error("Restoran silinemedi");
    }
  };

  // Ücretlendirme modalını aç
  const openPricingModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    try {
      const res = await axios.get(`${API}/restaurants/pricing/${restaurant.id}`);
      setPricingType(res.data.pricing_type || "per_package");
      setPerPackagePrice(res.data.per_package_price?.toString() || "");
      setKmRanges(res.data.km_ranges || DEFAULT_KM_RANGES);
      setKdvRate(res.data.kdv_rate?.toString() || "");
      setPosCommissionRate(res.data.pos_commission_rate?.toString() || "");
    } catch (err) {
      setPricingType("per_package");
      setPerPackagePrice("");
      setKmRanges(DEFAULT_KM_RANGES);
      setKdvRate("");
      setPosCommissionRate("");
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
        kdv_rate: parseFloat(kdvRate) || 0,
        pos_commission_rate: parseFloat(posCommissionRate) || 0
      };
      await axios.put(`${API}/restaurants/pricing/${selectedRestaurant.id}`, payload);
      toast.success("Ücretlendirme kaydedildi");
      setShowPricingModal(false);
      fetchRestaurants();
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

  const openEditModal = (restaurant) => {
    setSelectedRestaurant(restaurant);
    setFormData({
      name: restaurant.name || "",
      phone: restaurant.phone || "",
      address: restaurant.address || "",
      latitude: restaurant.latitude?.toString() || "",
      longitude: restaurant.longitude?.toString() || "",
      preparation_time: restaurant.preparation_time || 15,
      adisyo_api_key: "",
      adisyo_api_secret: "",
      adisyo_branch_id: restaurant.adisyo_branch_id || ""
    });
    setShowEditModal(true);
    setTimeout(() => {
      initLocationPicker(restaurant.latitude, restaurant.longitude);
    }, 200);
  };

  useEffect(() => {
    if (showAddModal) {
      initLocationPicker();
    }
    return () => {
      if (!showAddModal && !showEditModal) {
        cleanupMap();
      }
    };
  }, [showAddModal, initLocationPicker]);

  return (
    <div data-testid="restoranlar-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">Restoranlar</h2>
        <div className="flex gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Restoran ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 border-2"
              data-testid="restaurant-search-input"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGroupsModal(true)} className="font-semibold" data-testid="restaurant-groups-btn">
              <Users className="w-4 h-4 mr-2" />
              Gruplar
            </Button>
            <Button variant="outline" onClick={() => setShowIntegrationLogs(true)} className="font-semibold" data-testid="integration-logs-btn">
              <FileText className="w-4 h-4 mr-2" />
              Ent. Logları
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-restaurant-btn">
              <Plus className="w-4 h-4 mr-2" />
              Restoran Ekle
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs + View Mode Toggle */}
      <div className="flex justify-between items-center gap-2 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              activeTab === "active" 
                ? "bg-primary text-white" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Store className="w-4 h-4" />
            Aktif ({activeRestaurants.length})
          </button>
          <button
            onClick={() => setActiveTab("archived")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              activeTab === "archived" 
                ? "bg-slate-700 text-white" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Archive className="w-4 h-4" />
            Arşiv ({archivedRestaurants.length})
          </button>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === "list" 
                ? "bg-white shadow text-primary" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List className="w-4 h-4" />
            Liste
          </button>
          <button
            onClick={() => setViewMode("matrix")}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              viewMode === "matrix" 
                ? "bg-white shadow text-primary" 
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Ayar Matrisi
          </button>
        </div>
      </div>

      {/* Restaurant View */}
      {loading ? (
        <PageLoading />
      ) : viewMode === "matrix" ? (
        /* Matrix View */
        <RestaurantMatrixView 
          companyId={companyId} 
          onRestaurantClick={(restaurant) => openEditModal(restaurant)}
        />
      ) : filteredRestaurants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{activeTab === "active" ? "Henüz restoran eklenmemiş" : "Arşivde restoran yok"}</p>
            {activeTab === "active" && (
              <Button variant="link" onClick={() => setShowAddModal(true)}>
                İlk restoranı ekle
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Desktop Card */}
        <div className="hidden md:block border-2 border-border bg-white overflow-x-auto">
          {/* Desktop Table */}
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-primary">
                <th className="text-left p-3 font-bold text-xs">Restoran</th>
                <th className="text-left p-3 font-bold text-xs">Hazırlık</th>
                <th className="text-right p-3 font-bold text-xs">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredRestaurants.map((restaurant) => (
                <tr 
                  key={restaurant.id} 
                  className="border-b border-border hover:bg-slate-50 transition-colors"
                  data-testid={`restaurant-row-${restaurant.id}`}
                >
                  <td className="p-3">
                    <p className="font-medium text-sm">{restaurant.name}</p>
                  </td>
                  <td className="p-3">
                    <span className="text-sm">{restaurant.preparation_time || 15} dk</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openPreparationModal(restaurant)} className="h-8 px-3 border-2" title="Hazırlık Süreleri">
                        <Clock className="w-4 h-4" />
                        <span className="ml-1 text-xs">Hazırlık</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openPricingModal(restaurant)} className="h-8 px-3 border-2" title="Ücretlendirme">
                        <span className="font-bold">₺</span>
                        <span className="ml-1 text-xs">Ücretlendirme</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openUsersModal(restaurant)} className="h-8 px-3 border-2" title="Kullanıcılar">
                        <Users className="w-4 h-4" />
                        <span className="ml-1 text-xs">Kullanıcılar</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openBlockedModal(restaurant)} className="h-8 px-3 border-2" title="Engellenen Kuryeler">
                        <UserX className="w-4 h-4" />
                        <span className="ml-1 text-xs">Engellenenler</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedRestaurant(restaurant); setShowPermissionsModal(true); }} className="h-8 px-3 border-2" title="İzinler">
                        <Shield className="w-4 h-4" />
                        <span className="ml-1 text-xs">İzinler</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedRestaurant(restaurant); setShowCollectionModal(true); }} className="h-8 px-3 border-2" title="Tahsilat Ayarları">
                        <Banknote className="w-4 h-4" />
                        <span className="ml-1 text-xs">Tahsilat</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openInvoiceSettingsModal(restaurant)} className="h-8 px-3 border-2" title="Fatura Ayarları">
                        <Receipt className="w-4 h-4" />
                        <span className="ml-1 text-xs">Fatura</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditModal(restaurant)} className="h-8 px-3 border-2" data-testid={`edit-restaurant-${restaurant.id}`}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleArchive(restaurant)} className="h-8 px-3 border-2">
                        {restaurant.is_archived ? (
                          <ArchiveRestore className="w-4 h-4" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </Button>
                      {restaurant.is_archived && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-8 px-3 border-2"
                          onClick={() => {
                            setSelectedRestaurant(restaurant);
                            setShowDeleteModal(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Mobile Cards */}
        <div className="md:hidden space-y-4">
          {filteredRestaurants.map((restaurant) => (
            <div 
              key={restaurant.id}
              className="border-2 border-border p-4 bg-white"
              data-testid={`restaurant-card-${restaurant.id}`}
            >
              <div className="mb-3">
                <p className="font-bold">{restaurant.name}</p>
              </div>
              
              <div className="text-sm mb-3 space-y-1">
                <p>
                  <span className="text-muted-foreground">Hazırlık:</span> <span>{restaurant.preparation_time || 15} dk</span>
                </p>
              </div>
              
              {/* Row 1: Düzenle, Hazırlık */}
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => openEditModal(restaurant)} className="flex-1 border-2">
                  Düzenle
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPreparationModal(restaurant)} className="flex-1 border-2" title="Hazırlık Süreleri">
                  <Clock className="w-4 h-4 mr-1" />
                  <span className="text-xs">Hazırlık</span>
                </Button>
              </div>
              
              {/* Row 2: Ücretlendirme, Kullanıcılar */}
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => openPricingModal(restaurant)} className="flex-1 border-2" title="Ücretlendirme">
                  <span className="font-bold">₺</span>
                  <span className="text-xs ml-1">Ücretlendirme</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => openUsersModal(restaurant)} className="flex-1 border-2">
                  <Users className="w-4 h-4 mr-1" />
                  <span className="text-xs">Kullanıcılar</span>
                </Button>
              </div>
              
              {/* Row 3: Engellenenler, Entegrasyon Logları */}
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => openBlockedModal(restaurant)} className="flex-1 border-2">
                  <UserX className="w-4 h-4 mr-1" />
                  <span className="text-xs">Engellenenler</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowIntegrationLogs(true)} className="flex-1 border-2">
                  <FileText className="w-4 h-4 mr-1" />
                  <span className="text-xs">Ent. Logları</span>
                </Button>
              </div>
              
              {/* Row 4: İzinler, Tahsilat, Fatura */}
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => { setSelectedRestaurant(restaurant); setShowPermissionsModal(true); }} className="flex-1 border-2">
                  <Shield className="w-4 h-4 mr-1" />
                  <span className="text-xs">İzinler</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedRestaurant(restaurant); setShowCollectionModal(true); }} className="flex-1 border-2">
                  <Banknote className="w-4 h-4 mr-1" />
                  <span className="text-xs">Tahsilat</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => openInvoiceSettingsModal(restaurant)} className="flex-1 border-2">
                  <Receipt className="w-4 h-4 mr-1" />
                  <span className="text-xs">Fatura</span>
                </Button>
              </div>
              
              {/* Row 5: Arşiv */}
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleArchive(restaurant)} 
                  className="flex-1 border-2"
                >
                  <Archive className="w-4 h-4 mr-1" />
                  <span className="text-xs">{restaurant.is_archived ? 'Arşivden Çıkar' : 'Arşivle'}</span>
                </Button>
              </div>
              
              {/* Row 6: Sil (only for archived) */}
              {restaurant.is_archived && (
                <div className="flex gap-2 mt-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setSelectedRestaurant(restaurant);
                      setShowDeleteModal(true);
                    }}
                    className="flex-1 border-2"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    <span className="text-xs">Sil</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni Restoran Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Restoran Adı *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Örn: Karadeniz Pide"
                data-testid="restaurant-name-input"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="05XX XXX XX XX"
              />
            </div>
            <div>
              <Label>Adres</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                placeholder="Tam adres"
              />
            </div>
            
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4" />
                Konum (Haritadan İşaretle)
              </Label>
              <div 
                ref={mapContainerRef} 
                className="w-full h-[250px] rounded-lg border"
                style={{ zIndex: 1 }}
              />
              {formData.latitude && formData.longitude && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {formData.latitude}, {formData.longitude}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>
              İptal
            </Button>
            <Button onClick={handleAdd} data-testid="save-restaurant-btn">
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restoran Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Restoran Adı *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div>
              <Label>Adres</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
            </div>
            
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4" />
                Konum (Haritadan İşaretle)
              </Label>
              <div 
                ref={mapContainerRef} 
                className="w-full h-[250px] rounded-lg border"
                style={{ zIndex: 1 }}
              />
              {formData.latitude && formData.longitude && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Navigation className="w-3 h-3" />
                  {formData.latitude}, {formData.longitude}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditModal(false); resetForm(); }}>
              İptal
            </Button>
            <Button onClick={handleEdit}>
              Güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restoranı Sil</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            <strong>{selectedRestaurant?.name}</strong> restoranını kalıcı olarak silmek istediğinizden emin misiniz?
            Bu işlem geri alınamaz.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              İptal
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Modal */}
      <Dialog open={showPricingModal} onOpenChange={setShowPricingModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-green-600 font-bold text-xl">₺</span>
              Ücretlendirme - {selectedRestaurant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RadioGroup value={pricingType} onValueChange={setPricingType}>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="per_package" id="per_package" />
                <Label htmlFor="per_package" className="cursor-pointer flex-1">
                  Paket Başı
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                <RadioGroupItem value="per_km" id="per_km" />
                <Label htmlFor="per_km" className="cursor-pointer flex-1">
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

            {/* KDV Oranı */}
            <div className="space-y-2 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <Label className="text-amber-800">KDV Oranı (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={kdvRate}
                  onChange={(e) => setKdvRate(e.target.value)}
                  placeholder="0"
                  className="bg-white"
                  data-testid="kdv-rate-input"
                />
                <span className="text-amber-700 font-medium">%</span>
              </div>
              <p className="text-xs text-amber-600">
                Restoran ücretine ek olarak hesaplanacak KDV oranı
              </p>
            </div>

            {/* POS Komisyonu */}
            <div className="space-y-2 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
              <Label className="text-indigo-800">POS Komisyonu (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={posCommissionRate}
                  onChange={(e) => setPosCommissionRate(e.target.value)}
                  placeholder="0"
                  className="bg-white"
                  data-testid="pos-commission-rate-input"
                />
                <span className="text-indigo-700 font-medium">%</span>
              </div>
              <p className="text-xs text-indigo-600">
                Kredi kartı/Online ödemeli siparişlerde sipariş tutarı üzerinden hesaplanacak komisyon
              </p>
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

      {/* Blocked Couriers Modal */}
      <Dialog open={showBlockedModal} onOpenChange={(open) => { setShowBlockedModal(open); if (!open) { setSelectedRestaurant(null); setBlockedCouriers([]); setSelectedCourierToBlock(""); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-red-600" />
              Engellenen Kuryeler - {selectedRestaurant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Kurye Ekleme */}
            <div className="flex gap-2">
              <select
                value={selectedCourierToBlock}
                onChange={(e) => setSelectedCourierToBlock(e.target.value)}
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Kurye seçin...</option>
                {allCouriers
                  .filter(c => !blockedCouriers.find(b => b.id === c.id))
                  .map(courier => (
                    <option key={courier.id} value={courier.id}>
                      {courier.name}
                    </option>
                  ))
                }
              </select>
              <Button 
                onClick={handleBlockCourier}
                disabled={!selectedCourierToBlock}
                size="sm"
                className="h-10"
              >
                <UserX className="w-4 h-4 mr-1" />
                Engelle
              </Button>
            </div>

            {allCouriers.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                Şirkete kayıtlı kurye bulunamadı. Önce kurye ekleyin.
              </p>
            )}

            {/* Engellenen Kuryeler Listesi */}
            <div className="border rounded-lg">
              {loadingBlocked ? (
                <div className="p-4 text-center text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Yükleniyor...
                </div>
              ) : blockedCouriers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Engellenen kurye yok</p>
                </div>
              ) : (
                <div className="divide-y">
                  {blockedCouriers.map(courier => (
                    <div key={courier.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium text-sm">{courier.name}</p>
                        <p className="text-xs text-muted-foreground">{courier.phone}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnblockCourier(courier.id)}
                        className="h-8 text-green-600 border-green-300 hover:bg-green-50"
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        Engeli Kaldır
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Engellenen kuryeler bu restorandan sipariş alamaz.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restaurant Users Modal */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Restoran Kullanıcıları - {selectedRestaurant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Add new user form */}
            <div className="p-4 bg-slate-50 rounded-lg border">
              <h4 className="font-semibold text-sm mb-3">Yeni Kullanıcı Ekle</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs">Kullanıcı Adı</Label>
                  <Input
                    placeholder="kullaniciadi"
                    value={newUserData.username}
                    onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Ad Soyad</Label>
                  <Input
                    placeholder="Ad Soyad"
                    value={newUserData.name}
                    onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input
                    placeholder="05XX XXX XX XX"
                    value={newUserData.phone}
                    onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Şifre</Label>
                  <Input
                    type="password"
                    placeholder="******"
                    value={newUserData.password}
                    onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <Button 
                size="sm" 
                onClick={handleCreateUser}
                className="mt-3 w-full"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Kullanıcı Oluştur
              </Button>
            </div>

            {/* Existing users list */}
            <div>
              <h4 className="font-semibold text-sm mb-2">Mevcut Kullanıcılar</h4>
              {loadingUsers ? (
                <p className="text-sm text-muted-foreground text-center py-4">Yükleniyor...</p>
              ) : restaurantUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Henüz kullanıcı eklenmemiş.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {restaurantUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                        {user.phone && (
                          <p className="text-xs text-muted-foreground">{user.phone}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${user.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {user.is_active !== false ? 'Aktif' : 'Pasif'}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteUser(user.id)}
                          className="h-8 text-red-600 border-red-300 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Restoran kullanıcıları bu restoran için sipariş takibi yapabilir.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preparation Time Modal */}
      <Dialog open={showPreparationModal} onOpenChange={setShowPreparationModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Hazırlık Süreleri - {selectedRestaurant?.name}
            </DialogTitle>
          </DialogHeader>
          
          {loadingPreparation ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Standart Hazırlık Süresi */}
              <div className="p-4 border rounded-lg">
                <Label className="font-semibold">Standart Hazırlık Süresi</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min="1"
                    max="120"
                    value={preparationData.standard_time}
                    onChange={(e) => setPreparationData(prev => ({ ...prev, standard_time: e.target.value }))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">dakika</span>
                </div>
              </div>

              {/* Ürün Bazlı Ekstra Süreler */}
              <div className="p-4 border rounded-lg">
                <Label className="font-semibold">Ürün Bazlı Ekstra Hazırlık Süreleri</Label>
                
                {restaurantProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Bu restorana ait ürün bulunamadı
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto mt-3">
                    {restaurantProducts.map((product) => (
                      <div key={product.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border">
                        <span className="text-sm">{product.name}</span>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            max="60"
                            placeholder="0"
                            value={preparationData.product_times[product.id] || ""}
                            onChange={(e) => updateProductTime(product.id, e.target.value)}
                            className="w-20 h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">dk</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreparationModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSavePreparation}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Modal */}
      <RestaurantPermissionsModal
        open={showPermissionsModal}
        onOpenChange={setShowPermissionsModal}
        restaurant={selectedRestaurant}
      />

      {/* Collection Settings Modal */}
      <CollectionSettingsModal
        open={showCollectionModal}
        onOpenChange={setShowCollectionModal}
        restaurant={selectedRestaurant}
        onSaved={fetchRestaurants}
      />

      {/* Invoice Settings Modal */}
      <Dialog open={showInvoiceSettingsModal} onOpenChange={setShowInvoiceSettingsModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              Fatura Ayarları - {selectedRestaurant?.name}
            </DialogTitle>
          </DialogHeader>
          
          {loadingInvoiceSettings ? (
            <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                İşletme hangi ödeme yöntemleri için fatura kesecek?
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Nakit</span>
                  </div>
                  <Switch
                    checked={invoiceSettings.cash}
                    onCheckedChange={(checked) => setInvoiceSettings(prev => ({ ...prev, cash: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Kredi Kartı</span>
                  </div>
                  <Switch
                    checked={invoiceSettings.credit_card}
                    onCheckedChange={(checked) => setInvoiceSettings(prev => ({ ...prev, credit_card: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-purple-600" />
                    <span className="font-medium">Online</span>
                  </div>
                  <Switch
                    checked={invoiceSettings.online}
                    onCheckedChange={(checked) => setInvoiceSettings(prev => ({ ...prev, online: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-orange-600" />
                    <span className="font-medium">Yemek Kartı</span>
                  </div>
                  <Switch
                    checked={invoiceSettings.meal_card}
                    onCheckedChange={(checked) => setInvoiceSettings(prev => ({ ...prev, meal_card: checked }))}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-cyan-600" />
                    <span className="font-medium">Online Yemek Kartı</span>
                  </div>
                  <Switch
                    checked={invoiceSettings.online_meal_card}
                    onCheckedChange={(checked) => setInvoiceSettings(prev => ({ ...prev, online_meal_card: checked }))}
                  />
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Seçilen ödeme yöntemlerinin haftalık toplamı için restorandan fatura beklenecektir.
              </p>
              
              {/* Yüzdelik Dilim Ayarları */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Fatura Yüzdesi</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Restoran fatura keserken kullanacağı yüzdelik dilim
                </p>
                
                <div className="flex gap-2 mb-3">
                  {[1, 10, 20].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      variant={invoiceSettings.percentage === pct ? "default" : "outline"}
                      size="sm"
                      onClick={() => setInvoiceSettings(prev => ({ ...prev, percentage: pct }))}
                      className="flex-1"
                    >
                      %{pct}
                    </Button>
                  ))}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="percentage_name">Yüzdelik İsmi</Label>
                  <Input
                    id="percentage_name"
                    placeholder="Yeme-İçme, Tatlı, vb."
                    value={invoiceSettings.percentage_name || ""}
                    onChange={(e) => setInvoiceSettings(prev => ({ ...prev, percentage_name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Örn: "Yeme-İçme", "Tatlı", "Kedi Maması"
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceSettingsModal(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveInvoiceSettings}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IntegrationLogsModal open={showIntegrationLogs} onClose={() => setShowIntegrationLogs(false)} />
      
      <RestaurantGroupsModal 
        open={showGroupsModal} 
        onClose={() => setShowGroupsModal(false)} 
        companyId={companyId}
        restaurants={restaurants}
      />
    </div>
  );
}