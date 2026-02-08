import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Search, Edit2, Trash2, Archive, ArchiveRestore, 
  MapPin, Phone, Link2, CheckCircle2, XCircle, Eye, EyeOff,
  Store, RefreshCw, Navigation
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function RestoranlarPage({ companyId }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  
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
    adisyo_api_key: "",
    adisyo_api_secret: "",
    adisyo_branch_id: ""
  });
  const [showApiKeys, setShowApiKeys] = useState(false);

  const fetchRestaurants = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/restaurants/${companyId}?include_archived=${showArchived}`);
      setRestaurants(res.data);
    } catch (err) {
      toast.error("Restoranlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [companyId, showArchived]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  // Initialize location picker map
  const initLocationPicker = useCallback((initialLat = null, initialLng = null) => {
    // Wait for container to be available
    setTimeout(() => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      
      // Load Leaflet if needed
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
      scrollWheelZoom: true,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 120
    }).setView([defaultLat, defaultLng], initialLat ? 15 : 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    
    // Add marker if initial position
    if (initialLat && initialLng) {
      markerRef.current = L.marker([initialLat, initialLng], { draggable: true }).addTo(map);
      markerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
      });
    }
    
    // Click to place/move marker
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
        longitude: formData.longitude ? parseFloat(formData.longitude) : null
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

  const openEditModal = (restaurant) => {
    setSelectedRestaurant(restaurant);
    setFormData({
      name: restaurant.name || "",
      phone: restaurant.phone || "",
      address: restaurant.address || "",
      latitude: restaurant.latitude?.toString() || "",
      longitude: restaurant.longitude?.toString() || "",
      adisyo_api_key: "",  // Güvenlik için boş göster
      adisyo_api_secret: "",
      adisyo_branch_id: restaurant.adisyo_branch_id || ""
    });
    setShowEditModal(true);
    // Initialize map with existing location
    setTimeout(() => {
      initLocationPicker(restaurant.latitude, restaurant.longitude);
    }, 200);
  };

  // Initialize map when add modal opens
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

  const filteredRestaurants = restaurants.filter(r => 
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div data-testid="restoranlar-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="font-heading text-xl font-bold tracking-tight">Restoranlar</h2>
        <Button onClick={() => setShowAddModal(true)} data-testid="add-restaurant-btn">
          <Plus className="w-4 h-4 mr-2" />
          Restoran Ekle
        </Button>
      </div>

      {/* Filtreler */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Restoran ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="restaurant-search-input"
          />
        </div>
        <Button 
          variant={showArchived ? "secondary" : "outline"} 
          onClick={() => setShowArchived(!showArchived)}
          className="whitespace-nowrap"
        >
          <Archive className="w-4 h-4 mr-2" />
          {showArchived ? "Arşivi Gizle" : "Arşivi Göster"}
        </Button>
      </div>

      {/* Restoran Listesi */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRestaurants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henüz restoran eklenmemiş</p>
            <Button variant="link" onClick={() => setShowAddModal(true)}>
              İlk restoranı ekle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRestaurants.map((restaurant) => (
            <Card 
              key={restaurant.id} 
              className={restaurant.is_archived ? "opacity-60" : ""}
              data-testid={`restaurant-card-${restaurant.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base font-semibold">
                    {restaurant.name}
                  </CardTitle>
                  <div className="flex gap-1">
                    {restaurant.is_active ? (
                      <Badge variant="success" className="text-xs">Aktif</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Pasif</Badge>
                    )}
                    {restaurant.is_archived && (
                      <Badge variant="destructive" className="text-xs">Arşiv</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  {restaurant.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{restaurant.phone}</span>
                    </div>
                  )}
                  {restaurant.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-2">{restaurant.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Adisyo:</span>
                    {restaurant.adisyo_connected ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Bağlı
                      </span>
                    ) : restaurant.adisyo_api_key ? (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <XCircle className="w-3.5 h-3.5" />
                        Test Edilmedi
                      </span>
                    ) : (
                      <span className="text-slate-400">Ayarlanmadı</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => openEditModal(restaurant)}
                    data-testid={`edit-restaurant-${restaurant.id}`}
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Düzenle
                  </Button>
                  {restaurant.adisyo_api_key && !restaurant.adisyo_connected && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleTestAdisyo(restaurant)}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Test
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleArchive(restaurant)}
                  >
                    {restaurant.is_archived ? (
                      <><ArchiveRestore className="w-3.5 h-3.5 mr-1" /> Çıkar</>
                    ) : (
                      <><Archive className="w-3.5 h-3.5 mr-1" /> Arşivle</>
                    )}
                  </Button>
                  {restaurant.is_archived && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setSelectedRestaurant(restaurant);
                        setShowDeleteModal(true);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Sil
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
            
            {/* Haritadan Konum Seçimi */}
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

            {/* Adisyo API Bilgileri */}
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
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Enlem (Latitude)</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                />
              </div>
              <div>
                <Label>Boylam (Longitude)</Label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                />
              </div>
            </div>

            {/* Adisyo API Bilgileri */}
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
    </div>
  );
}
