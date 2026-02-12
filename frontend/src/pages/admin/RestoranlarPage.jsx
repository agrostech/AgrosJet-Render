import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Plus, Search, Edit2, Trash2, Archive, ArchiveRestore, 
  MapPin, Eye, EyeOff, Store, RefreshCw, Navigation, Clock, CheckCircle2, XCircle
} from "lucide-react";

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
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  
  // Pricing state
  const [pricingType, setPricingType] = useState("per_package");
  const [perPackagePrice, setPerPackagePrice] = useState("");
  const [kmRanges, setKmRanges] = useState(DEFAULT_KM_RANGES);
  
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

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

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

  const handleTestAdisyo = async (restaurant) => {
    try {
      const res = await axios.post(`${API}/restaurants/${restaurant.id}/test-adisyo`);
      if (res.data.connected) {
        toast.success("Adisyo bağlantısı başarılı!");
        fetchRestaurants();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Adisyo bağlantı testi başarısız");
    }
  };

  // Ücretlendirme modalını aç
  const openPricingModal = async (restaurant) => {
    setSelectedRestaurant(restaurant);
    try {
      const res = await axios.get(`${API}/restaurants/${restaurant.id}/pricing`);
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
      await axios.put(`${API}/restaurants/${selectedRestaurant.id}/pricing`, payload);
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
          <Button onClick={() => setShowAddModal(true)} className="font-semibold" data-testid="add-restaurant-btn">
            <Plus className="w-4 h-4 mr-2" />
            Restoran Ekle
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
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

      {/* Restaurant List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
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
                <th className="text-left p-3 font-bold text-xs">Telefon</th>
                <th className="text-left p-3 font-bold text-xs">Hazırlık</th>
                <th className="text-left p-3 font-bold text-xs">Adisyo</th>
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
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-sm">{restaurant.name}</p>
                        {restaurant.address && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">{restaurant.address}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-sm">{restaurant.phone || "-"}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-sm">{restaurant.preparation_time || 15} dk</span>
                  </td>
                  <td className="p-3">
                    {restaurant.adisyo_connected ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Bağlı
                      </span>
                    ) : restaurant.adisyo_api_key ? (
                      <button 
                        onClick={() => handleTestAdisyo(restaurant)}
                        className="flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-700"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Test Et
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Ayarlanmadı</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openPricingModal(restaurant)} className="h-8 px-3 border-2" title="Ücretlendirme">
                        <span className="font-bold">₺</span>
                        <span className="ml-1 text-xs">Ücretlendirme</span>
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
                {restaurant.address && (
                  <p className="text-sm text-muted-foreground">{restaurant.address}</p>
                )}
              </div>
              
              <div className="text-sm mb-3 space-y-1">
                {restaurant.phone && (
                  <p>
                    <span className="text-muted-foreground">Telefon:</span> <span className="font-mono">{restaurant.phone}</span>
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Hazırlık:</span> <span>{restaurant.preparation_time || 15} dk</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Adisyo:</span>{' '}
                  {restaurant.adisyo_connected ? (
                    <span className="text-green-600 font-medium">Bağlı</span>
                  ) : restaurant.adisyo_api_key ? (
                    <span className="text-yellow-600 font-medium">Test Gerekli</span>
                  ) : (
                    <span className="text-slate-400">Ayarlanmadı</span>
                  )}
                </p>
              </div>
              
              {/* Row 1: Düzenle, Ücretlendirme */}
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={() => openEditModal(restaurant)} className="flex-1 border-2">
                  Düzenle
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPricingModal(restaurant)} className="flex-1 border-2" title="Ücretlendirme">
                  <span className="font-bold">₺</span>
                  <span className="text-xs ml-1">Ücretlendirme</span>
                </Button>
                {restaurant.adisyo_api_key && !restaurant.adisyo_connected && (
                  <Button size="sm" variant="outline" onClick={() => handleTestAdisyo(restaurant)} className="flex-1 border-2">
                    Test
                  </Button>
                )}
              </div>
              
              {/* Row 2: Arşiv, Sil */}
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
                {restaurant.is_archived && (
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
                )}
              </div>
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
              <Label>Hazırlık Süresi (Dakika)</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={formData.preparation_time}
                onChange={(e) => setFormData({...formData, preparation_time: e.target.value})}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sipariş geldiğinde bu süre kadar "Hazırlanıyor" durumunda kalır
              </p>
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

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Adisyo API Entegrasyonu</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowApiKeys(!showApiKeys)}
                >
                  {showApiKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>API Key</Label>
                  <Input
                    type={showApiKeys ? "text" : "password"}
                    value={formData.adisyo_api_key}
                    onChange={(e) => setFormData({...formData, adisyo_api_key: e.target.value})}
                    placeholder="Adisyo API Key"
                  />
                </div>
                <div>
                  <Label>API Secret</Label>
                  <Input
                    type={showApiKeys ? "text" : "password"}
                    value={formData.adisyo_api_secret}
                    onChange={(e) => setFormData({...formData, adisyo_api_secret: e.target.value})}
                    placeholder="Adisyo API Secret"
                  />
                </div>
                <div>
                  <Label>Branch ID</Label>
                  <Input
                    value={formData.adisyo_branch_id}
                    onChange={(e) => setFormData({...formData, adisyo_branch_id: e.target.value})}
                    placeholder="Adisyo Şube ID"
                  />
                </div>
              </div>
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
              <Label>Hazırlık Süresi (Dakika)</Label>
              <Input
                type="number"
                min="1"
                max="120"
                value={formData.preparation_time}
                onChange={(e) => setFormData({...formData, preparation_time: e.target.value})}
                placeholder="15"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sipariş geldiğinde bu süre kadar "Hazırlanıyor" durumunda kalır
              </p>
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

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Adisyo API Entegrasyonu</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowApiKeys(!showApiKeys)}
                >
                  {showApiKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                API bilgilerini değiştirmek için yeni değer girin. Boş bırakırsanız mevcut değer korunur.
              </p>
              <div className="space-y-3">
                <div>
                  <Label>API Key</Label>
                  <Input
                    type={showApiKeys ? "text" : "password"}
                    value={formData.adisyo_api_key}
                    onChange={(e) => setFormData({...formData, adisyo_api_key: e.target.value})}
                    placeholder="Yeni API Key (opsiyonel)"
                  />
                </div>
                <div>
                  <Label>API Secret</Label>
                  <Input
                    type={showApiKeys ? "text" : "password"}
                    value={formData.adisyo_api_secret}
                    onChange={(e) => setFormData({...formData, adisyo_api_secret: e.target.value})}
                    placeholder="Yeni API Secret (opsiyonel)"
                  />
                </div>
                <div>
                  <Label>Branch ID</Label>
                  <Input
                    value={formData.adisyo_branch_id}
                    onChange={(e) => setFormData({...formData, adisyo_branch_id: e.target.value})}
                  />
                </div>
              </div>
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
